import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";
import { PrepareForm } from "./prepare-form";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Prepare a coffee chat" };

export default async function PreparePage() {
  const ws = await requireWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New coffee chat"
        title="Prepare a coffee chat"
        description="Paste what you have. CoffeeChat AI analyzes their background and writes a script tailored to this person."
      />
      <PrepareForm aiLabel={ws.ai.label} />
    </div>
  );
}
