import { NextResponse } from "next/server";
import { buildPlaybook, playbookToMarkdown } from "@/lib/services/playbook";
import { getWorkspace } from "@/lib/workspace";

/** Downloads the playbook as Markdown. Private: requires a signed-in workspace. */
export async function GET() {
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const md = playbookToMarkdown(await buildPlaybook(ws));
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="networking-playbook.md"',
      "Cache-Control": "private, no-store",
    },
  });
}
