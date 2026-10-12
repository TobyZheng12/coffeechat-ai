import { rmSync } from "node:fs";

export default function globalSetup() {
  rmSync(".data/e2e-db.json", { force: true });
}
