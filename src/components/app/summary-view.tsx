import { BookOpen, CheckSquare, Handshake, Heart, Lightbulb, Repeat } from "lucide-react";
import { Panel } from "@/components/page";
import type { MeetingSummary } from "@/lib/domain/types";

export function SummaryView({ summary }: { summary: MeetingSummary }) {
  const mine = summary.action_items.filter((a) => a.owner === "me");
  const theirs = summary.action_items.filter((a) => a.owner === "them");
  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <p className="eyebrow">Summary</p>
        <p className="mt-1.5 text-sm leading-relaxed">{summary.summary}</p>
        {summary.topics.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {summary.topics.map((t) => (
              <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Block icon={<Lightbulb />} title="Advice">
          {summary.advice.map((a, i) => (
            <li key={i}>
              {a.advice}
              <span className="block text-xs text-muted-foreground">{a.topic}</span>
            </li>
          ))}
        </Block>
        <Block icon={<CheckSquare />} title="Your commitments">
          {mine.map((a, i) => (
            <li key={i}>
              {a.description}
              {a.due_hint ? <span className="text-xs text-muted-foreground"> · {a.due_hint}</span> : null}
            </li>
          ))}
        </Block>
        <Block icon={<Handshake />} title="They offered">
          {summary.introductions_offered.map((x, i) => (
            <li key={`i${i}`}>Introduction to {x.person_or_role}</li>
          ))}
          {theirs.map((a, i) => (
            <li key={`t${i}`}>{a.description}</li>
          ))}
          {summary.offered_further_help && !summary.introductions_offered.length && !theirs.length ? <li>Further help when you need it</li> : null}
        </Block>
        <Block icon={<BookOpen />} title="Recommended">
          {summary.resources.map((r, i) => (
            <li key={i}>
              {r.name} <span className="text-xs text-muted-foreground">· {r.kind}</span>
            </li>
          ))}
        </Block>
        <Block icon={<Heart />} title="Worth remembering">
          {summary.relationship_insights.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </Block>
        <Block icon={<Repeat />} title="Reconnect">
          {summary.reconnect_signals.map((r, i) => (
            <li key={i}>“{r.phrase}”</li>
          ))}
        </Block>
      </div>
      <p className="text-xs text-muted-foreground">
        Extracted by {summary.generated_by} from your notes only. Items that couldn&apos;t be traced to your notes were removed.
      </p>
    </div>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <Panel className="p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:text-brand">
        {icon}
        {title}
      </p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">{children}</ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nothing noted.</p>
      )}
    </Panel>
  );
}
