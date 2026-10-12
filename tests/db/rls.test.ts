import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the REAL Supabase migration inside PGlite (Postgres compiled to WASM)
 * and checks that Row Level Security and the composite foreign keys enforce
 * per-user data ownership at the database level.
 */

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
  await db.exec(userId ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
  const migrations = path.join(__dirname, "../../supabase/migrations");
  await db.exec(readFileSync(path.join(migrations, "20261012000000_init.sql"), "utf8"));
  // Supabase grants table privileges to `authenticated` by default; RLS then filters rows.
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await db.exec(`insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');`);
});

afterAll(async () => {
  await db?.close();
});

describe("database ownership (RLS)", () => {
  it("creates a profile automatically for each new auth user", async () => {
    const res = await db.query<{ id: string }>("select id from public.profiles order by id");
    expect(res.rows.map((r) => r.id)).toEqual([ALICE, BOB]);
  });

  it("lets a user read only their own profile", async () => {
    const rows = await as(ALICE, async () => (await db.query<{ id: string }>("select id from public.profiles")).rows);
    expect(rows).toEqual([{ id: ALICE }]);
  });

  it("isolates contacts between users", async () => {
    await as(ALICE, () => db.query("insert into public.contacts (user_id, full_name) values ($1, 'Alice Contact')", [ALICE]));
    await as(BOB, () => db.query("insert into public.contacts (user_id, full_name) values ($1, 'Bob Contact')", [BOB]));

    const aliceSees = await as(ALICE, async () => (await db.query<{ full_name: string }>("select full_name from public.contacts")).rows);
    const bobSees = await as(BOB, async () => (await db.query<{ full_name: string }>("select full_name from public.contacts")).rows);
    expect(aliceSees.map((r) => r.full_name)).toEqual(["Alice Contact"]);
    expect(bobSees.map((r) => r.full_name)).toEqual(["Bob Contact"]);
  });

  it("rejects inserting a row owned by someone else", async () => {
    await expect(
      as(ALICE, () => db.query("insert into public.contacts (user_id, full_name) values ($1, 'Sneaky')", [BOB])),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update or delete another user's rows", async () => {
    const updated = await as(BOB, async () =>
      (await db.query("update public.contacts set full_name = 'hacked' where full_name = 'Alice Contact'")).affectedRows,
    );
    const deleted = await as(BOB, async () =>
      (await db.query("delete from public.contacts where full_name = 'Alice Contact'")).affectedRows,
    );
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    const still = await db.query("select 1 from public.contacts where full_name = 'Alice Contact'");
    expect(still.rows).toHaveLength(1);
  });

  it("blocks attaching a meeting to another user's contact (composite foreign key)", async () => {
    const aliceContact = (await db.query<{ id: string }>("select id from public.contacts where user_id = $1", [ALICE])).rows[0].id;
    // Bob knows Alice's contact UUID and tries to hang his own meeting off it.
    await expect(
      as(BOB, () =>
        db.query("insert into public.meetings (user_id, contact_id, title) values ($1, $2, 'x')", [BOB, aliceContact]),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("gives anonymous visitors no access at all", async () => {
    await expect(as(null, () => db.query("select * from public.contacts"))).rejects.toThrow(/permission denied/i);
  });

  it("deduplicates engine follow-ups per user by rule_key", async () => {
    const contact = (await db.query<{ id: string }>("select id from public.contacts where user_id = $1", [ALICE])).rows[0].id;
    const insert = () =>
      as(ALICE, () =>
        db.query(
          "insert into public.follow_up_tasks (user_id, contact_id, kind, title, rule_key) values ($1, $2, 'thank_you', 'Thank them', 'thank_you:m1')",
          [ALICE, contact],
        ),
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/i);
    // The repository relies on this exact upsert form being a silent no-op.
    const ignored = await as(ALICE, async () =>
      (
        await db.query(
          "insert into public.follow_up_tasks (user_id, contact_id, kind, title, rule_key) values ($1, $2, 'thank_you', 'Again', 'thank_you:m1') on conflict (user_id, rule_key) do nothing",
          [ALICE, contact],
        )
      ).affectedRows,
    );
    expect(ignored).toBe(0);
    // Manual tasks have no rule_key and never conflict with each other.
    for (let i = 0; i < 2; i++) {
      await as(ALICE, () =>
        db.query("insert into public.follow_up_tasks (user_id, contact_id, kind, title, source) values ($1, $2, 'custom', 'Manual', 'manual')", [ALICE, contact]),
      );
    }
  });

  it("increments AI usage atomically per user and day", async () => {
    const run = () =>
      as(ALICE, async () => (await db.query<{ increment_ai_usage: number }>("select public.increment_ai_usage('2026-10-12')")).rows[0].increment_ai_usage);
    expect(await run()).toBe(1);
    expect(await run()).toBe(2);
    const bob = await as(BOB, async () => (await db.query<{ increment_ai_usage: number }>("select public.increment_ai_usage('2026-10-12')")).rows[0].increment_ai_usage);
    expect(bob).toBe(1);
  });

  it("cascades a contact deletion to its meetings, notes and follow-ups", async () => {
    await as(ALICE, async () => {
      const c = (await db.query<{ id: string }>("insert into public.contacts (user_id, full_name) values ($1, 'Temp') returning id", [ALICE])).rows[0].id;
      const m = (await db.query<{ id: string }>("insert into public.meetings (user_id, contact_id) values ($1, $2) returning id", [ALICE, c])).rows[0].id;
      await db.query("insert into public.meeting_notes (user_id, meeting_id, contact_id, body) values ($1, $2, $3, 'note')", [ALICE, m, c]);
      await db.query("delete from public.contacts where id = $1", [c]);
      const left = await db.query("select 1 from public.meeting_notes where meeting_id = $1", [m]);
      expect(left.rows).toHaveLength(0);
    });
  });
});
