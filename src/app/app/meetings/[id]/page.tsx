import { AlertTriangle, ArrowLeft, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pill } from "@/components/badges";
import { DraftCard, DraftComposer } from "@/components/app/drafts";
import { FollowUpItem } from "@/components/app/follow-up-item";
import { NotesPanel } from "@/components/app/notes-panel";
import { ScriptViews } from "@/components/app/script/script-views";
import { SummaryView } from "@/components/app/summary-view";
import { EmptyState, PageHeader, Section } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotFoundError } from "@/lib/data/repository";
import { formatDateTime } from "@/lib/domain/dates";
import { getMeetingView } from "@/lib/services/views";
import { requireWorkspace } from "@/lib/workspace";
import { MeetingActions } from "./meeting-actions";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Coffee chat" };

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aiError?: string }>;
}) {
  const { id } = await params;
  const { aiError } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ws = await requireWorkspace();
  const v = await getMeetingView(ws, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { meeting, contact } = v;
  const thankYouSent = v.drafts.some((d) => d.kind === "thank_you" && d.sent_at);

  return (
    <div className="space-y-6">
      <Link href={`/app/contacts/${contact.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {contact.full_name}
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            {meeting.status === "completed" ? "Completed" : meeting.status === "cancelled" ? "Cancelled" : "Upcoming"} ·{" "}
            {meeting.duration_minutes} min
          </span>
        }
        title={contact.full_name}
        description={
          <>
            {[contact.current_position, contact.current_company].filter(Boolean).join(" at ") || "Role not set"}
            {" · "}
            {meeting.scheduled_at ? formatDateTime(meeting.scheduled_at, v.profile.timezone) : "Time not set"}
          </>
        }
        actions={
          <>
            {meeting.script && meeting.status !== "cancelled" ? (
              <Link href={`/app/meetings/${meeting.id}/live`} className={buttonVariants({ size: "lg" })}>
                <MonitorPlay /> Open live view
              </Link>
            ) : null}
            <MeetingActions meetingId={meeting.id} status={meeting.status} />
          </>
        }
      />

      {aiError ? (
        <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Your contact was saved, but the AI step didn&apos;t finish: {aiError} You can generate the script again below.
          </p>
        </div>
      ) : null}

      <Tabs key={meeting.status} defaultValue={meeting.status === "completed" ? "after" : "prepare"}>
        <TabsList variant="line" className="w-full justify-start gap-4 overflow-x-auto border-b border-border">
          <TabsTrigger value="prepare" className="flex-none">Script</TabsTrigger>
          <TabsTrigger value="after" className="flex-none">
            After the call {v.notes.length ? <Pill className="ml-1">{v.notes.length}</Pill> : null}
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex-none">
            Messages & follow-ups {v.tasks.filter((t) => t.status !== "completed" && t.status !== "dismissed").length ? <Pill variant="brand" className="ml-1">{v.tasks.filter((t) => t.status !== "completed" && t.status !== "dismissed").length}</Pill> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prepare" className="pt-6">
          <ScriptViews
            meetingId={meeting.id}
            script={meeting.script}
            questions={v.questions}
            durationMinutes={meeting.duration_minutes}
            aiLabel={ws.ai.label}
          />
        </TabsContent>

        <TabsContent value="after" className="space-y-8 pt-6">
          {v.summary ? (
            <Section
              title="What you learned"
              description={v.summaryVersions > 1 ? `Latest of ${v.summaryVersions} versions — earlier versions are kept.` : undefined}
            >
              <SummaryView summary={v.summary} />
            </Section>
          ) : null}
          <Section title="Notes" description="Your raw notes, kept exactly as you wrote them.">
            <NotesPanel meetingId={meeting.id} notes={v.notes} timezone={v.profile.timezone} hasSummary={!!v.summary} />
          </Section>
        </TabsContent>

        <TabsContent value="messages" className="space-y-8 pt-6">
          <Section title="Suggested follow-ups" description="Each has a reason. Accept, reschedule, snooze, or dismiss.">
            {v.tasks.length ? (
              <div className="space-y-2">
                {v.tasks.map((t) => (
                  <FollowUpItem key={t.id} task={t} today={v.today} showContact={false} />
                ))}
              </div>
            ) : (
              <EmptyState title="No follow-ups yet" description="Save notes after the call and recommendations will appear here." />
            )}
          </Section>
          <Section title="Messages" description="Drafts are never sent for you. Copy, send from your email, then mark as sent.">
            <DraftComposer
              contactId={contact.id}
              meetingId={meeting.id}
              defaultKind={meeting.status === "completed" && !thankYouSent ? "thank_you" : "reconnection"}
              aiLabel={ws.ai.label}
            />
            {v.drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
