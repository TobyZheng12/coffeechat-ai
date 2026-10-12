import { NextResponse } from "next/server";
import { buildPlaybook } from "@/lib/services/playbook";
import { playbookToPdf } from "@/lib/services/playbook-pdf";
import { getWorkspace } from "@/lib/workspace";

/** Downloads the playbook as a PDF. Private: requires a signed-in workspace. */
export async function GET() {
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const pdf = playbookToPdf(await buildPlaybook(ws));
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="networking-playbook.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
