"use client";

import { ArrowRight, Loader2, Quote, Search } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { askKnowledgeAction } from "@/app/app/actions";
import { Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/domain/dates";
import type { Citation, KnowledgeAnswer } from "@/lib/services/knowledge";

const SUGGESTIONS = [
  "What have consultants told me about recruiting?",
  "Which contacts recommended case interviews?",
  "What skills do people recommend I build?",
  "What did I learn about corporate strategy?",
  "What advice should I remember after my mission?",
];

const KIND_LABEL = { advice: "Advice", notes: "Notes", summary: "Summary", contact: "Contact" } as const;

export function AskKnowledge({ initialQuestion = "", aiLabel }: { initialQuestion?: string; aiLabel: string }) {
  const [q, setQ] = useState(initialQuestion);
  const [result, setResult] = useState<KnowledgeAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (question: string) => {
    setQ(question);
    setError(null);
    start(async () => {
      const r = await askKnowledgeAction(question);
      if (r.ok) setResult(r.data);
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q);
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask your notes, e.g. “Who have I spoken with at Deloitte?”"
            aria-label="Question"
            className="h-10 pl-9 text-base"
            maxLength={300}
          />
        </div>
        <Button type="submit" size="lg" className="h-10" disabled={pending || q.trim().length < 3}>
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Ask
        </Button>
      </form>
      {!result && !pending ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {result ? (
        <Panel className="space-y-4 p-5" aria-live="polite">
          <p className="eyebrow">Answer</p>
          <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
          {result.citations.length ? (
            <div className="space-y-2">
              <p className="eyebrow">Sources</p>
              {result.citations.map((c) => (
                <CitationCard key={c.id} c={c} />
              ))}
            </div>
          ) : null}
          {result.related.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Other related notes ({result.related.length})</summary>
              <div className="mt-2 space-y-2">
                {result.related.map((c) => (
                  <CitationCard key={c.id} c={c} />
                ))}
              </div>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Answered by {result.generatedBy === "Search" ? "search" : result.generatedBy} using only your saved notes. Check the sources
            for exact wording.
          </p>
        </Panel>
      ) : null}
      <p className="text-xs text-muted-foreground">Answers use {aiLabel} and cite the conversations they come from.</p>
    </div>
  );
}

function CitationCard({ c }: { c: Citation }) {
  const href = c.meetingId ? `/app/meetings/${c.meetingId}` : `/app/contacts/${c.contactId}`;
  return (
    <Link href={href} className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{c.contactName}</span>
        {c.company ? ` · ${c.company}` : ""} · {KIND_LABEL[c.kind]}
        {c.date ? ` · ${formatDate(c.date)}` : ""}
      </p>
      <p className="mt-1 flex gap-1.5 text-sm">
        <Quote className="mt-1 size-3 shrink-0 text-brand" />
        <span>{c.snippet}</span>
      </p>
    </Link>
  );
}
