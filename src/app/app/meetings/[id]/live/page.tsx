import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NotFoundError } from "@/lib/data/repository";
import { getMeetingView } from "@/lib/services/views";
import { requireWorkspace } from "@/lib/workspace";
import { LiveCompanion } from "./live-companion";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Live" };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ws = await requireWorkspace();
  const v = await getMeetingView(ws, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (!v.meeting.script) redirect(`/app/meetings/${id}`);
  return (
    <LiveCompanion
      meetingId={id}
      contactName={v.contact.full_name}
      subtitle={[v.contact.current_position, v.contact.current_company].filter(Boolean).join(" · ")}
      durationMinutes={v.meeting.duration_minutes}
      script={v.meeting.script}
      questions={v.questions}
    />
  );
}
