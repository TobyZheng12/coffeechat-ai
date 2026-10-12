import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { emptyData, type MemoryData, MemoryStore } from "./memory";

/**
 * LOCAL mode storage: the in-memory store, persisted to a JSON file that is
 * gitignored. Meant for running the app on your laptop without any accounts.
 * Not used in production (serverless file systems are ephemeral).
 */
const g = globalThis as unknown as { __ccLocalStores?: Map<string, MemoryStore> };

export function localStore(file: string): MemoryStore {
  g.__ccLocalStores ??= new Map();
  const abs = path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
  let store = g.__ccLocalStores.get(abs);
  if (!store) {
    let data: MemoryData = emptyData();
    if (existsSync(abs)) {
      data = { ...emptyData(), ...(JSON.parse(readFileSync(abs, "utf8")) as Partial<MemoryData>) };
    }
    store = new MemoryStore(data, (d) => {
      mkdirSync(path.dirname(abs), { recursive: true });
      // Write-then-rename so a crash never leaves a half-written file.
      writeFileSync(`${abs}.tmp`, JSON.stringify(d, null, 2));
      renameSync(`${abs}.tmp`, abs);
    });
    g.__ccLocalStores.set(abs, store);
  }
  return store;
}
