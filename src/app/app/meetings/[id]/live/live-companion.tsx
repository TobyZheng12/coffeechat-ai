"use client";

import { ArrowLeft, Check, Keyboard, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { saveNotesAction, setAskedAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MeetingQuestion, MeetingScript, QuestionSection } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const ORDER: QuestionSection[] = ["career_journey", "deep_dive", "career_advice", "closing"];

const noopSubscribe = () => () => {};
function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

interface Props {
  meetingId: string;
  contactName: string;
  subtitle: string;
  durationMinutes: number;
  script: MeetingScript;
  questions: MeetingQuestion[];
}

export function LiveCompanion({ meetingId, contactName, subtitle, durationMinutes, script, questions }: Props) {
  const ordered = useMemo(
    () =>
      questions
        .filter((q) => !q.is_alternate)
        .sort((a, b) => ORDER.indexOf(a.section) - ORDER.indexOf(b.section) || a.position - b.position),
    [questions],
  );
  const [asked, setAsked] = useState<Record<string, boolean>>(() => Object.fromEntries(questions.map((q) => [q.id, q.asked])));
  const [current, setCurrent] = useState(0);
  const [condensed, setCondensed] = useState(false);
  const [shortPlan, setShortPlan] = useState(durationMinutes <= 15);
  const [showIntro, setShowIntro] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const draftKey = `cc-live-notes-${meetingId}`;
  // Unsaved notes are kept in this browser only. `null` = not edited yet, so show the saved draft.
  const savedDraft = useSyncExternalStore(noopSubscribe, () => readDraft(draftKey), () => "");
  const [edited, setNotes] = useState<string | null>(null);
  const notes = edited ?? savedDraft;
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [saving, start] = useTransition();

  const visible = shortPlan ? ordered.filter((q) => q.include_in_short_call || q.priority === 1) : ordered;

  useEffect(() => {
    if (edited === null) return;
    try {
      if (edited) localStorage.setItem(draftKey, edited);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [edited, draftKey]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const toggleAsked = useCallback(
    (id: string) => {
      const next = !asked[id];
      setAsked((a) => ({ ...a, [id]: next }));
      setAskedAction(id, next).then((r) => {
        if (!r.ok) {
          setAsked((a) => ({ ...a, [id]: !next }));
          toast.error(r.error);
        }
      });
    },
    [asked],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const q = visible[current];
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setCurrent((c) => Math.min(c + 1, visible.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setCurrent((c) => Math.max(c - 1, 0));
          break;
        case "x":
        case "Enter":
          if (q) {
            e.preventDefault();
            toggleAsked(q.id);
            if (!asked[q.id]) setCurrent((c) => Math.min(c + 1, visible.length - 1));
          }
          break;
        case "c":
          setCondensed((v) => !v);
          break;
        case "t":
          setRunning((v) => !v);
          break;
        case "n":
          e.preventDefault();
          notesRef.current?.focus();
          break;
        case "?":
          setShowHelp((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, current, asked, toggleAsked]);

  useEffect(() => {
    document.getElementById(`q-${visible[current]?.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, visible]);

  const saveNotes = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("body", notes);
      fd.set("kind", "live");
      fd.set("process", "off");
      const r = await saveNotesAction(meetingId, null, fd);
      if (!r.ok) return void toast.error(r.error);
      setNotes("");
      toast.success("Notes saved. Open the meeting page to extract insights and draft a thank-you.");
    });

  const total = durationMinutes * 60;
  const remaining = total - elapsed;
  const fmt = (s: number) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
  const askedCount = visible.filter((q) => asked[q.id]).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link href={`/app/meetings/${meetingId}`} className="text-muted-foreground hover:text-foreground" aria-label="Back to meeting">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{contactName}</h1>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-lg px-2.5 py-1 font-mono text-xl tabular-nums",
              remaining <= 0 ? "bg-danger-soft text-danger" : remaining <= 180 ? "bg-warning-soft text-warning" : "bg-muted",
            )}
            aria-live="off"
            aria-label="Time remaining"
          >
            {fmt(remaining)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setRunning((v) => !v)} aria-label={running ? "Pause timer (T)" : "Start timer (T)"}>
            {running ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setElapsed(0); setRunning(false); }} aria-label="Reset timer">
            <RotateCcw />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
        <Toggle on={!condensed} onClick={() => setCondensed(false)}>Full</Toggle>
        <Toggle on={condensed} onClick={() => setCondensed(true)}>Condensed</Toggle>
        <span className="mx-1 h-4 w-px bg-border" />
        <Toggle on={shortPlan} onClick={() => setShortPlan(true)}>15-min plan</Toggle>
        <Toggle on={!shortPlan} onClick={() => setShortPlan(false)}>All questions</Toggle>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {askedCount}/{visible.length} asked
        </span>
        <Button variant="ghost" size="sm" onClick={() => setShowHelp((v) => !v)}>
          <Keyboard /> Shortcuts
        </Button>
      </div>

      {showHelp ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-border bg-muted/50 px-4 py-3 text-xs sm:grid-cols-4">
          {[
            ["↓ / J", "Next question"],
            ["↑ / K", "Previous question"],
            ["X / Enter", "Mark asked"],
            ["C", "Full ↔ condensed"],
            ["T", "Start / pause timer"],
            ["N", "Jump to notes"],
            ["Esc", "Leave notes"],
            ["?", "Show / hide shortcuts"],
          ].map(([k, l]) => (
            <p key={k}>
              <kbd className="rounded border border-border bg-card px-1 font-mono">{k}</kbd> {l}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_360px]">
        <main className="space-y-4 px-4 py-5 sm:px-6">
          <section className="space-y-2">
            <button onClick={() => setShowIntro((v) => !v)} className="eyebrow hover:text-foreground">
              {showIntro ? "▾" : "▸"} Opening & your intro
            </button>
            {showIntro ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-lg leading-relaxed">
                <p>{script.greeting}</p>
                <p>{script.why_connect}</p>
                <p className="border-l-2 border-brand pl-3">{script.self_intro}</p>
              </div>
            ) : null}
          </section>

          <ol className="space-y-2">
            {visible.map((q, i) => {
              const isCurrent = i === current;
              const done = asked[q.id];
              return (
                <li
                  key={q.id}
                  id={`q-${q.id}`}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                    isCurrent ? "border-brand bg-brand-soft/50" : "border-border bg-card",
                    done && !isCurrent && "opacity-50",
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAsked(q.id);
                    }}
                    aria-label={done ? "Mark as not asked" : "Mark as asked"}
                    className={cn(
                      "mt-1 grid size-6 shrink-0 place-items-center rounded-full border",
                      done ? "border-success bg-success text-white" : "border-input",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : <span className="text-[0.625rem] text-muted-foreground">{i + 1}</span>}
                  </button>
                  <div className="min-w-0 space-y-1.5">
                    {condensed ? (
                      <p className={cn("text-lg font-medium", done && "line-through")}>{q.short_version || q.question}</p>
                    ) : (
                      <>
                        <p className={cn("text-xl leading-snug font-medium", done && "line-through")}>{q.question}</p>
                        {q.follow_up ? <p className="text-base text-muted-foreground">↳ {q.follow_up}</p> : null}
                      </>
                    )}
                    {q.priority === 1 && !done ? <p className="text-xs font-medium text-brand">Must ask</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-lg leading-relaxed">
            <p className="eyebrow">Closing</p>
            <p>{script.closing_thanks}</p>
            {script.referral_question ? <p className="text-muted-foreground">(Optional) {script.referral_question}</p> : null}
          </section>
        </main>

        <aside className="space-y-4 border-t border-border bg-muted/30 px-4 py-5 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <div>
            <p className="eyebrow">Goals</p>
            <ol className="mt-2 space-y-1.5 text-sm">
              {script.objectives.map((o, i) => (
                <li key={i}>
                  {i + 1}. {o}
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-2">
            <label htmlFor="live-notes" className="eyebrow">
              Notes (N)
            </label>
            <Textarea
              id="live-notes"
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={12}
              placeholder="Quick notes during the call…"
              className="bg-card text-base"
            />
            <Button onClick={saveNotes} disabled={saving || notes.trim().length < 3} className="w-full">
              Save notes to this meeting
            </Button>
            <p className="text-xs text-muted-foreground">Kept in this browser until you save. Nothing is recorded or transcribed.</p>
          </div>
          {script.closing_reminder ? (
            <div className="rounded-lg bg-brand-soft p-3 text-sm">
              <p className="eyebrow mb-1">Before you hang up</p>
              {script.closing_reminder}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cn("rounded-md px-2.5 py-1", on ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
