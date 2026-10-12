import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page";
import { insightsByTopic } from "@/lib/services/knowledge";
import { requireWorkspace } from "@/lib/workspace";
import { AskKnowledge } from "./ask";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const ws = await requireWorkspace();
  const topics = await insightsByTopic(ws);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Knowledge base"
        description="Everything people have told you, searchable. Answers come only from your saved notes and link back to the conversation."
      />
      <AskKnowledge initialQuestion={q.slice(0, 300)} aiLabel={ws.ai.label} />
      <Section title="Advice by topic" description="Collected automatically from your meeting notes">
        {topics.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {topics.map((t) => (
              <Panel key={t.topic} className="p-4">
                <p className="text-sm font-medium capitalize">
                  {t.topic} <span className="text-xs font-normal text-muted-foreground">· {t.items.length}</span>
                </p>
                <ul className="mt-2 space-y-2">
                  {t.items.slice(0, 6).map((i) => (
                    <li key={i.id} className="text-sm">
                      {i.insight}{" "}
                      <Link href={i.meetingId ? `/app/meetings/${i.meetingId}` : `/app/contacts/${i.contactId}`} className="text-xs text-muted-foreground hover:underline">
                        — {i.contactName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Lightbulb />} title="No advice saved yet" description="After a coffee chat, save your notes and the advice shows up here." />
        )}
      </Section>
    </div>
  );
}
