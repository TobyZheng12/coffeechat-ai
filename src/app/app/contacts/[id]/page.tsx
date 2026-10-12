import { ArrowUpRight, Pencil, Quote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pill, StrengthPill } from "@/components/badges";
import { DraftCard, DraftComposer, KIND_LABEL } from "@/components/app/drafts";
import { FollowUpItem } from "@/components/app/follow-up-item";
import { Timeline } from "@/components/app/timeline";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { NotFoundError } from "@/lib/data/repository";
import { formatDateTime, relativeDays } from "@/lib/domain/dates";
import { isOpen } from "@/lib/domain/followups";
import type { MessageKind } from "@/lib/domain/types";
import { getContactView } from "@/lib/services/views";
import { requireWorkspace } from "@/lib/workspace";
import {
  DeleteContactButton,
  ExperienceEditor,
  LogInteractionForm,
  ManualFollowUpForm,
  ReanalyzeButton,
  ScheduleMeetingDialog,
} from "./contact-widgets";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compose?: string; task?: string; meeting?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ws = await requireWorkspace();
  const v = await getContactView(ws, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { contact } = v;
  const a = contact.analysis;
  const openTasks = v.tasks.filter(isOpen);
  const composeKind = sp.compose && sp.compose in KIND_LABEL ? (sp.compose as MessageKind) : undefined;
  const latestCompleted = v.meetings.find((m) => m.status === "completed");
  const meetingForCompose = sp.meeting && v.meetings.some((m) => m.id === sp.meeting) ? sp.meeting : (latestCompleted?.id ?? null);
  const taskId = sp.task && v.tasks.some((t) => t.id === sp.task) ? sp.task : null;
  const safeLinkedIn = /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(contact.linkedin_url) ? contact.linkedin_url : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <StrengthPill strength={v.strength} />
            {v.lastContact ? <span>Last contact {relativeDays(v.lastContact.slice(0, 10), v.today)}</span> : null}
          </span>
        }
        title={contact.full_name}
        description={
          <>
            {[contact.current_position, contact.current_company].filter(Boolean).join(" at ") || "Role not set"}
            {contact.location ? ` · ${contact.location}` : ""}
            {safeLinkedIn ? (
              <>
                {" · "}
                <a href={safeLinkedIn} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                  LinkedIn <ArrowUpRight className="size-3" />
                </a>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <ScheduleMeetingDialog contactId={contact.id} />
            <Link href={`/app/contacts/${contact.id}/edit`} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              <Pencil /> Edit
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <Section
            title="About them"
            description={a ? `Analysis by ${a.generated_by}` : "Paste their LinkedIn profile, then analyze it."}
            actions={<ReanalyzeButton contactId={contact.id} hasAnalysis={!!a} />}
          >
            {a ? (
              <Panel className="space-y-4 p-4 text-sm">
                <p className="leading-relaxed">{a.headline_summary}</p>
                <p className="leading-relaxed text-muted-foreground">{a.career_progression}</p>
                {a.career_transitions.length ? (
                  <div>
                    <p className="eyebrow">Career moves</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                      {a.career_transitions.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {a.connections_to_me.length ? (
                  <div>
                    <p className="eyebrow">Connections to you</p>
                    <ul className="mt-1.5 space-y-2">
                      {a.connections_to_me.map((c, i) => (
                        <li key={i}>
                          {c.point}
                          <span className="mt-0.5 flex gap-1 text-xs text-muted-foreground">
                            <Quote className="mt-0.5 size-3 shrink-0 text-brand" /> <span className="italic">“{c.evidence}”</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {a.topics_to_explore.length ? (
                    <div>
                      <p className="eyebrow">Worth exploring</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        {a.topics_to_explore.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {a.recruiting_insights_to_ask.length ? (
                    <div>
                      <p className="eyebrow">Recruiting insights to ask about</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        {a.recruiting_insights_to_ask.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                {a.missing_information.length ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Missing: {a.missing_information.join(" · ")}
                  </p>
                ) : null}
              </Panel>
            ) : (
              <EmptyState title="Not analyzed yet" description="Add their LinkedIn text on the edit page, then analyze." />
            )}
          </Section>

          <Section title="Conversations">
            {v.meetings.length ? (
              <div className="space-y-2">
                {v.meetings.map((m) => {
                  const s = v.summaries.find((x) => x.meeting_id === m.id);
                  return (
                    <Link key={m.id} href={`/app/meetings/${m.id}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{m.title}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {m.scheduled_at ? formatDateTime(m.scheduled_at, v.profile.timezone) : "Time not set"}
                          <Pill variant={m.status === "completed" ? "success" : m.status === "cancelled" ? "neutral" : "brand"}>{m.status}</Pill>
                        </span>
                      </div>
                      {s ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{s.summary}</p> : null}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No conversations yet" />
            )}
          </Section>

          {v.insights.length ? (
            <Section title="What you've learned from them">
              <Panel className="divide-y divide-border">
                {v.insights.map((i) => (
                  <div key={i.id} className="px-4 py-2.5 text-sm">
                    {i.insight}
                    <span className="ml-2 text-xs text-muted-foreground">{i.topic}</span>
                  </div>
                ))}
              </Panel>
            </Section>
          ) : null}

          <Section title="Relationship timeline">
            <Timeline events={v.timeline} timezone={v.profile.timezone} />
          </Section>

          <section id="messages" className="scroll-mt-6">
            <Section title="Messages" description="Drafts are never sent for you. Copy, send it yourself, then mark as sent.">
              <DraftComposer
                key={`${composeKind}-${taskId}`}
                contactId={contact.id}
                meetingId={meetingForCompose}
                taskId={taskId}
                defaultKind={composeKind ?? (latestCompleted ? "thank_you" : "linkedin_message")}
                aiLabel={ws.ai.label}
              />
              {v.drafts.map((d) => (
                <DraftCard key={d.id} draft={d} />
              ))}
            </Section>
          </section>
        </div>

        <aside className="space-y-8">
          <Section title="Follow-ups" actions={<ManualFollowUpForm contactId={contact.id} />}>
            {openTasks.length ? (
              <div className="space-y-2">
                {openTasks.map((t) => (
                  <FollowUpItem key={t.id} task={t} today={v.today} showContact={false} compact />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No open follow-ups.</p>
            )}
          </Section>
          <Section title="Background">
            <ExperienceEditor contactId={contact.id} experiences={v.experiences} />
          </Section>
          <Section title="Details">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">How you connected</dt>
                <dd>{contact.how_connected || "—"}</dd>
              </div>
              {contact.industry ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Industry</dt>
                  <dd>{contact.industry}</dd>
                </div>
              ) : null}
              {contact.tags.length ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Tags</dt>
                  <dd className="flex flex-wrap gap-1">{contact.tags.map((t) => <Pill key={t}>{t}</Pill>)}</dd>
                </div>
              ) : null}
              {contact.personal_notes ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Your notes</dt>
                  <dd className="whitespace-pre-wrap">{contact.personal_notes}</dd>
                </div>
              ) : null}
            </dl>
          </Section>
          <Section title="Log an interaction">
            <LogInteractionForm contactId={contact.id} />
          </Section>
          <DeleteContactButton contactId={contact.id} name={contact.full_name} />
        </aside>
      </div>
    </div>
  );
}
