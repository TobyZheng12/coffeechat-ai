import { ArrowRight, CalendarClock, Coffee, Lightbulb, MessageSquareText, Plus, Sparkles, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FollowUpItem } from "@/components/app/follow-up-item";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { getDashboard } from "@/lib/services/views";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

function greeting(now: Date, tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const ws = await requireWorkspace();
  const d = await getDashboard(ws);
  const name = d.profile.preferred_name || d.profile.full_name.split(" ")[0];
  const due = [...d.followUps.overdue, ...d.followUps.thisWeek];
  const profileIncomplete = !d.profile.full_name || !d.profile.school;

  if (d.totals.contacts === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title={`Welcome${name ? `, ${name}` : ""}`} description="Let's prepare your first coffee chat." />
        {profileIncomplete ? <ProfileCallout /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["1. Paste their profile", "Copy the text from their LinkedIn profile and your email thread."],
            ["2. Get a tailored script", "Questions grounded in their real experience, ready to read on Zoom."],
            ["3. Save notes, follow up", "Turn notes into a thank-you email and well-timed reminders."],
          ].map(([t, b]) => (
            <Panel key={t} className="p-5">
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </Panel>
          ))}
        </div>
        <Link href="/app/prepare" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
          <Plus /> Prepare new coffee chat
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting(new Date(), d.profile.timezone)}${name ? `, ${name}` : ""}`}
        description={
          due.length
            ? `${due.length} follow-up${due.length === 1 ? "" : "s"} need${due.length === 1 ? "s" : ""} attention this week.`
            : "You're all caught up on follow-ups."
        }
        actions={
          <Link href="/app/prepare" className={buttonVariants({ size: "lg" })}>
            <Plus /> Prepare new coffee chat
          </Link>
        }
      />

      {profileIncomplete ? <ProfileCallout /> : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title="Follow-ups due"
          description="Overdue and due in the next 7 days"
          actions={
            <Link href="/app/follow-ups" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          }
        >
          {due.length ? (
            <div className="space-y-2">
              {due.slice(0, 6).map((t) => (
                <FollowUpItem key={t.id} task={t} today={d.today} contactName={t.contact_name} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Sparkles />}
              title="Nothing due this week"
              description={
                d.followUps.upcoming.length
                  ? `Next up: ${d.followUps.upcoming[0].title}${d.followUps.upcoming[0].due_date ? ` (${formatDate(d.followUps.upcoming[0].due_date)})` : ""}.`
                  : "Recommendations appear here after you save notes from a conversation."
              }
            />
          )}
        </Section>

        <Section className="lg:col-span-2" title="Upcoming coffee chats">
          {d.upcoming.length ? (
            <div className="space-y-2">
              {d.upcoming.map(({ meeting, contact }) => (
                <Link
                  key={meeting.id}
                  href={`/app/meetings/${meeting.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <CalendarClock className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{contact.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {meeting.scheduled_at ? formatDateTime(meeting.scheduled_at, d.profile.timezone) : "Time not set"} ·{" "}
                      {meeting.duration_minutes} min
                      {contact.current_company ? ` · ${contact.current_company}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{meeting.script ? "Script ready" : "No script"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Coffee />} title="No chats scheduled" description="Prepare a new coffee chat to see it here." />
          )}
        </Section>
      </div>

      <Section title="Recent conversations">
        {d.recent.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {d.recent.map(({ meeting, contact, summary }) => (
              <Link
                key={meeting.id}
                href={`/app/meetings/${meeting.id}`}
                className="space-y-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{contact.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {meeting.completed_at ? formatDate(meeting.completed_at.slice(0, 10)) : ""}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {summary?.summary ?? "Notes not processed yet."}
                </p>
                {summary?.advice.length ? (
                  <p className="text-xs">
                    <span className="font-medium">Key advice:</span>{" "}
                    <span className="text-muted-foreground">{summary.advice[0].advice}</span>
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquareText />}
            title="No conversations yet"
            description="After a chat, save your notes on the meeting page to build your history."
          />
        )}
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Section title="Relationship overview" description="Your network by company">
          <Panel className="divide-y divide-border">
            {d.byCompany.slice(0, 8).map((c) => (
              <div key={c.company} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  {c.company === "Unknown company" ? (
                    <p className="truncate text-sm font-medium">{c.company}</p>
                  ) : (
                    <Link href={`/app/companies/${encodeURIComponent(c.company)}`} className="block truncate text-sm font-medium hover:underline">
                      {c.company}
                    </Link>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {c.contacts.map((x, i) => (
                      <span key={x.id}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/app/contacts/${x.id}`} className="hover:underline">
                          {x.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
              </div>
            ))}
          </Panel>
          {d.byIndustry.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {d.byIndustry.map((i) => (
                <span key={i.industry} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {i.industry} · {i.count}
                </span>
              ))}
            </div>
          ) : null}
        </Section>

        <Section title="Career insights" description="Themes from advice you've received">
          {d.themes.length ? (
            <Panel className="divide-y divide-border">
              {d.themes.map((t) => (
                <div key={t.topic} className="space-y-0.5 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium capitalize">{t.topic}</p>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t.count} mention{t.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    “{t.example}” — {t.contactName}
                  </p>
                </div>
              ))}
            </Panel>
          ) : (
            <EmptyState icon={<Lightbulb />} title="No insights yet" description="Advice from your notes is collected here." />
          )}
        </Section>

        <Section
          title={d.progress.missionStart ? "Before you leave" : "Networking progress"}
          description={
            d.progress.missionStart && d.progress.daysUntilMission !== null && d.progress.daysUntilMission >= 0
              ? `${d.progress.daysUntilMission} days until ${formatDate(d.progress.missionStart)}`
              : "Your activity so far"
          }
        >
          <Panel className="grid grid-cols-2 gap-px overflow-hidden bg-border">
            {[
              ["People in your network", d.progress.contacts],
              ["Conversations completed", d.progress.chatsCompleted],
              ["Chats coming up", d.progress.chatsPlanned],
              ["Thank-you notes sent", d.progress.thankYousSent],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-card p-4">
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </Panel>
          {d.progress.missionStart && d.progress.daysUntilMission !== null && d.progress.daysUntilMission > 0 ? (
            <p className="text-xs text-muted-foreground">
              Focus on a few genuine conversations and thoughtful follow-ups. Quality over quantity.
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

function ProfileCallout() {
  return (
    <Link
      href="/app/settings"
      className="flex items-center gap-3 rounded-xl border border-brand/25 bg-brand-soft p-4 transition-colors hover:border-brand/40"
    >
      <UserRound className="size-5 shrink-0 text-brand" />
      <div className="flex-1">
        <p className="text-sm font-medium">Finish your profile</p>
        <p className="text-xs text-muted-foreground">
          Your background and goals let the AI write an introduction that sounds like you.
        </p>
      </div>
      <ArrowRight className="size-4 text-brand" />
    </Link>
  );
}
