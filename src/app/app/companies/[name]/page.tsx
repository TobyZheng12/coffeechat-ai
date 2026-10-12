import { ArrowLeft, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpItem } from "@/components/app/follow-up-item";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/domain/dates";
import { getCompanyView } from "@/lib/services/companies";
import { requireWorkspace } from "@/lib/workspace";
import { ResearchNotes } from "./research-notes";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw).slice(0, 200);
  } catch {
    notFound();
  }
  const ws = await requireWorkspace();
  const v = await getCompanyView(ws, decoded);
  if (!v.contacts.length && !v.alumni.length && !v.research) notFound();

  return (
    <div className="space-y-8">
      <Link href="/app/companies" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Companies
      </Link>
      <PageHeader
        eyebrow="Company"
        title={v.name}
        description={`${v.contacts.length} ${v.contacts.length === 1 ? "person works" : "people work"} here${v.alumni.length ? ` · ${v.alumni.length} used to` : ""}`}
        actions={
          <Link href={`/app/knowledge?q=${encodeURIComponent(`What have I learned about ${v.name}?`)}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Search /> Ask your notes about {v.name}
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          <Section title="People">
            <Panel className="divide-y divide-border">
              {v.contacts.map((c) => (
                <Link key={c.id} href={`/app/contacts/${c.id}`} className="block px-4 py-3 hover:bg-muted/50">
                  <p className="text-sm font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.current_position || "Role not set"}</p>
                </Link>
              ))}
              {v.alumni.map(({ contact, role, period }) => (
                <Link key={contact.id} href={`/app/contacts/${contact.id}`} className="block px-4 py-3 hover:bg-muted/50">
                  <p className="text-sm font-medium">{contact.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Formerly {role || "worked here"}
                    {period ? ` (${period})` : ""} · now at {contact.current_company || "—"}
                  </p>
                </Link>
              ))}
            </Panel>
          </Section>
          <Section title="What they've told you">
            {v.advice.length ? (
              <Panel className="divide-y divide-border">
                {v.advice.map((a) => (
                  <div key={a.id} className="px-4 py-2.5 text-sm">
                    {a.insight} <span className="text-xs text-muted-foreground">— {a.contactName}</span>
                  </div>
                ))}
              </Panel>
            ) : (
              <EmptyState title="No advice recorded yet" description="Advice from your conversations with people here appears automatically." />
            )}
          </Section>
          {v.conversations.length ? (
            <Section title="Conversations">
              <div className="space-y-2">
                {v.conversations.map(({ meeting, contactName, summary }) => (
                  <Link key={meeting.id} href={`/app/meetings/${meeting.id}`} className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/50">
                    <p className="text-sm font-medium">
                      {contactName}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {meeting.completed_at ? formatDate(meeting.completed_at.slice(0, 10)) : ""}
                      </span>
                    </p>
                    {summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{summary}</p> : null}
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
        <aside className="space-y-8">
          <Section title="Your research notes" description="Only what you write here. Nothing is pulled from the web.">
            <ResearchNotes company={v.name} initial={v.research?.notes ?? ""} />
          </Section>
          {v.openTasks.length ? (
            <Section title="Open follow-ups">
              <div className="space-y-2">
                {v.openTasks.map((t) => (
                  <FollowUpItem key={t.id} task={t} today={v.today} contactName={t.contact_name} compact />
                ))}
              </div>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
