import { Download, FileText, Square } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StrengthPill } from "@/components/badges";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/domain/dates";
import { buildPlaybook } from "@/lib/services/playbook";
import { requireWorkspace } from "@/lib/workspace";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Networking playbook" };

export default async function PlaybookPage() {
  const ws = await requireWorkspace();
  const p = await buildPlaybook(ws);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={p.departure ? `Departure ${formatDate(p.departure)}` : "Playbook"}
        title={p.title}
        description="Everything worth remembering from your conversations, in one document you can keep. Compiled only from what you saved — nothing is invented."
        actions={
          <>
            <a href="/app/playbook/pdf" download className={buttonVariants({ size: "lg" })}>
              <Download /> PDF
            </a>
            <a href="/app/playbook/markdown" download className={buttonVariants({ variant: "outline", size: "lg" })}>
              <FileText /> Markdown
            </a>
          </>
        }
      />
      <Panel className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
        {[
          ["People", p.stats.people],
          ["Conversations", p.stats.conversations],
          ["Thank-you notes sent", p.stats.thankYous],
          ["Pieces of advice", p.stats.insights],
        ].map(([l, v]) => (
          <div key={l as string} className="bg-card p-4">
            <p className="text-2xl font-semibold tabular-nums">{v}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </Panel>

      {p.stats.people === 0 ? (
        <EmptyState title="Nothing to compile yet" description="Your playbook fills in as you add contacts and save notes." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Section title="Before you leave" description="Open follow-ups to finish first">
              {p.beforeYouLeave.length ? (
                <Panel className="divide-y divide-border">
                  {p.beforeYouLeave.map((t, i) => (
                    <div key={i} className="flex gap-2 px-4 py-2.5 text-sm">
                      <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>
                        {t.title} <span className="text-xs text-muted-foreground">· {t.who}{t.due ? ` · by ${formatDate(t.due)}` : ""}</span>
                      </span>
                    </div>
                  ))}
                </Panel>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
              )}
            </Section>
            <Section title="Reconnect after you return" description="Warmest relationships first">
              {p.afterYouReturn.length ? (
                <Panel className="divide-y divide-border">
                  {p.afterYouReturn.map((r, i) => (
                    <div key={i} className="space-y-0.5 px-4 py-2.5 text-sm">
                      <p className="font-medium">
                        {r.who} <span className="text-xs font-normal text-muted-foreground">· {r.when}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{r.angle}</p>
                    </div>
                  ))}
                </Panel>
              ) : (
                <p className="text-sm text-muted-foreground">No conversations recorded yet.</p>
              )}
            </Section>
          </div>

          {p.recruitingAdvice.length ? (
            <Section title="Recruiting advice">
              <Panel className="divide-y divide-border">
                {p.recruitingAdvice.map((a, i) => (
                  <p key={i} className="px-4 py-2.5 text-sm">
                    {a.insight} <span className="text-xs text-muted-foreground">— {a.by}</span>
                  </p>
                ))}
              </Panel>
            </Section>
          ) : null}

          <Section title="People">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {p.people.map((person) => (
                <Panel key={person.contactId} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/app/contacts/${person.contactId}`} className="font-medium hover:underline">
                        {person.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{[person.role, person.company].filter(Boolean).join(" at ")}</p>
                    </div>
                    <StrengthPill strength={person.strength} />
                  </div>
                  {person.conversations.map((c) => (
                    <p key={c.date} className="text-sm">
                      <span className="text-xs text-muted-foreground">{formatDate(c.date)} · </span>
                      {c.summary}
                    </p>
                  ))}
                  {person.advice.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {person.advice.slice(0, 4).map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                  {person.worthRemembering.length ? (
                    <p className="text-xs text-muted-foreground">Remember: {person.worthRemembering.join(" · ")}</p>
                  ) : null}
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs">
                    <span className="font-medium">Reconnect:</span> {person.reconnect.when}. {person.reconnect.angle}
                  </p>
                </Panel>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
