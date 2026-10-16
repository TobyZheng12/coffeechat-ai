# Architecture

This document explains how CoffeeChat AI is put together and why. It's written for someone learning full-stack development.

## The big picture

```
Browser ──► Next.js (Vercel)
              │
              ├─ Pages (Server Components)  ── read data through services
              ├─ Server Actions             ── the only way data changes
              │        │
              │        ▼
              │   requireWorkspace()  ◄── decides WHO you are and WHICH data you may touch
              │        │
              │        ▼
              │   Services (src/lib/services)  ── plain TypeScript, no Next.js imports
              │        │            │
              │        ▼            ▼
              │   Repository     AIProvider
              │   (interface)    (interface)
              │     │   │           │     │
              │     │   │           │     └─ MockProvider (offline templates)
              │     │   │           └─ AnthropicProvider (Claude, server-only)
              │     │   └─ MemoryRepository  (local dev file, demo, tests)
              │     └─ SupabaseRepository  (production, Postgres + RLS)
```

### Why a Repository interface?

Every page and service talks to storage through one interface (`src/lib/data/repository.ts`). That gives three things:

1. **Testability.** The whole workflow runs in Vitest against an in-memory store, with no database or network.
2. **A safe public demo.** The demo uses the in-memory implementation, which has no database client, so it can't reach real data.
3. **Ownership by construction.** A repository is created for one user, and no method takes a `userId`, so calling code can't accidentally ask for someone else's data.

### Why are services separate from Next.js?

Services in `src/lib/services` receive an `AppContext` (`repo`, `ai`, limits, clock) and never read cookies or environment variables. Server Actions are thin wrappers: authenticate → call service → revalidate. The same code runs in tests, in the demo seeder, and in production.

## Workspaces (who can see what)

`src/lib/workspace.ts` resolves every request into exactly one mode:

| Mode | When | Storage | Auth |
|---|---|---|---|
| `demo` | `cc_demo` cookie present | In-memory per visitor, seeded with fictional data, expires after 6h | none |
| `supabase` | Supabase env vars set | Postgres with RLS | Supabase Auth magic link + `ALLOWED_EMAILS` allowlist; identity from `getClaims()` (JWT verified) |
| `local` | Development only | `.data/local-db.json` | Passcode, HMAC-signed cookie |

Local mode is refused when `NODE_ENV=production`.

## Data model

Normalized tables (see `supabase/migrations/20261012000000_init.sql`):

```
profiles (1:1 auth.users)
contacts ─┬─ contact_experiences
          ├─ meetings ─┬─ meeting_questions
          │            ├─ meeting_notes        (append-only)
          │            └─ meeting_summaries    (versioned; latest is shown)
          ├─ follow_up_tasks   (status separate from completion; unique rule_key per user)
          ├─ message_drafts    (draft lifecycle `status` separate from `sent_at`)
          ├─ interaction_history (the relationship timeline)
          └─ career_insights   (knowledge base; full-text indexed)
company_research, ai_usage
```

- Every private row has `user_id` and RLS policy `user_id = auth.uid()`.
- **Composite foreign keys** `(parent_id, user_id) → parent(id, user_id)` make cross-user references impossible at the database level.
- `ON DELETE CASCADE` from contact → everything about that contact. Notes and summaries are never updated by the app, only inserted.
- Full-text `tsvector` columns on contacts, notes, and insights prepare for the knowledge base.
- `increment_ai_usage()` is an atomic, `security invoker` function, so RLS still applies.

## AI pipeline

See README §4. Files:

- `src/lib/ai/tasks.ts`: prompts and the task registry
- `src/lib/ai/schemas.ts`: Zod schemas, used both as the structured-output format and for re-validation
- `src/lib/ai/safety.ts`: untrusted-content fencing, quote matching
- `src/lib/ai/grounding.ts`: removes anything not traceable to your pasted text
- `src/lib/ai/anthropic.ts`: Claude via `client.beta.messages.parse` with server-side refusal fallback
- `src/lib/ai/mock.ts`: deterministic offline provider

Model: `claude-opus-5-5` (configurable via `AI_MODEL`). Thinking is adaptive (always on for this model). Effort is `high` for scripts and `medium` elsewhere.

## Profile normalization → spoken text

Your profile fields are **source material**; what gets read aloud is built from
cleaned facts. `src/lib/profile/normalize.ts` (shared by every provider):

- removes only known platform artifacts — “X logo” headings, “Show all/See more”,
  “· Part-time”, “· Hybrid”, tenure like “· 3 mos”, bullet prefixes — and can
  split a paste whose line breaks were lost at unambiguous LinkedIn boundaries;
- separates title / employer / location / dates, drops legal suffixes
  (“Caterpillar Inc.” → “Caterpillar”), trims a school's sub-unit
  (“… University Marriott School of Business” → “… University”, spoken “BYU”
  only for multi-word “<Name> <Name> University” forms), splits the degree from
  the field (“BS Global Supply Chain Management”);
- deduplicates interests into spoken topics (“strategy consulting” + “management
  consulting” → “consulting”, “strategy”);
- keeps the source text of every fact and returns warnings instead of guessing.

`src/lib/profile/introduction.ts` composes a 45–65 word introduction (name,
optional hometown, what/where you study, ONE experience most relevant to the
contact, what you hope to learn) and provides `spokenTextIssues()`, a validator
used after **any** provider: an introduction with artifacts, or one that copies
your Background word for word, is replaced by the composed one and the script
gets a review note. Your saved “My spoken introduction” always wins. Target
companies are never treated as employers, and broad shared terms are reported
as interests, not shared experience. Edited script text (`edited_fields`) and
edited questions survive regeneration unless you choose “Also replace my edits”.

Nothing here rewrites stored data; normalization happens at read time.

## Follow-up engine

`src/lib/domain/followup-engine.ts` is a pure function. Input: meeting facts plus extracted signals, relationship strength, last outbound message, mission dates, and existing rule keys. Output: recommendations plus explanatory notes.

Rules: thank-you within 24h; checking on offered introductions; your own commitments (with timing hints such as "this week" or "before my mission"); following up on recommended resources after you've had time to read or practice; explicit reconnect signals (post-mission ones stay **undated** until you set a return date); an optional, low-confidence pre-departure note for substantive relationships; two-week spacing after your last message; and moving reminders out of the mission window (urgent ones move before departure, others after your return).

Reminders are **in-app** (dashboard, sidebar badge, follow-up page). Email reminders would be a scheduled job that reads `follow_up_tasks` where `due_date <= today`. The data model already supports that; no background scheduler is configured yet, so the app never claims reminders arrive by email.

## Rendering & caching

The project runs with Next.js 16 **Cache Components**. Private pages read the session on every request, so they're marked `export const instant = false` (allowed to block) and resolve the workspace after `connection()`. The landing page is fully static. A future improvement is a static shell with `<Suspense>` streaming for per-user sections.
