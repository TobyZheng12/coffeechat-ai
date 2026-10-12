import { MemoryRepository, MemoryStore } from "@/lib/data/memory";
import { seedDemoWorkspace } from "./seed";

/**
 * Public demo workspaces.
 *
 * Each visitor gets their own in-memory workspace, seeded with fictional data
 * and identified by a random cookie. This module has NO database client and
 * never reads Supabase or the local data file — the demo is isolated from real
 * data by construction, not by a permission check.
 *
 * Workspaces expire after a few hours and are capped in number, so memory use
 * stays bounded. On serverless hosts a cold start may reset a demo; the banner
 * tells visitors that demo data is temporary.
 */

const MAX_WORKSPACES = 300;
const TTL_MS = 6 * 60 * 60 * 1000;

interface Entry {
  store: MemoryStore;
  ready: Promise<void>;
  lastUsed: number;
}

const g = globalThis as unknown as { __ccDemo?: Map<string, Entry> };

export const DEMO_ID_PATTERN = /^demo_[a-f0-9]{32}$/;

export function newDemoId(): string {
  return `demo_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** The demo "user id" — a fixed, obviously fake UUID per workspace. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e0";

export async function getDemoRepository(demoId: string): Promise<MemoryRepository> {
  if (!DEMO_ID_PATTERN.test(demoId)) throw new Error("Invalid demo id");
  g.__ccDemo ??= new Map();
  const map = g.__ccDemo;
  const now = Date.now();

  for (const [id, e] of map) if (now - e.lastUsed > TTL_MS) map.delete(id);

  let entry = map.get(demoId);
  if (!entry) {
    if (map.size >= MAX_WORKSPACES) {
      const oldest = [...map.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest) map.delete(oldest[0]);
    }
    const store = new MemoryStore();
    entry = { store, lastUsed: now, ready: seedDemoWorkspace(new MemoryRepository(store, DEMO_USER_ID)) };
    map.set(demoId, entry);
  }
  entry.lastUsed = now;
  await entry.ready;
  return new MemoryRepository(entry.store, DEMO_USER_ID);
}

export function resetDemoWorkspace(demoId: string) {
  g.__ccDemo?.delete(demoId);
}
