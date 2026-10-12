import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";
import { EditContactForm } from "./edit-form";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ws = await requireWorkspace();
  const contact = await ws.repo.getContact(id);
  if (!contact) notFound();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Edit contact" title={contact.full_name} />
      <EditContactForm contact={contact} />
    </div>
  );
}
