import {
  ArrowRight,
  BellRing,
  BookOpenText,
  CheckCircle2,
  Coffee,
  FileText,
  History,
  Lock,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Add a contact", body: "Paste their LinkedIn profile and your email thread. No scraping, no extensions." },
  { title: "Get a script", body: "A personalized, ready-to-read conversation plan with evidence from their profile." },
  { title: "Have the chat", body: "A calm meeting view beside Zoom: timer, prioritized questions, notes." },
  { title: "Follow up well", body: "Notes become insights, a genuine thank-you draft, and well-timed reminders." },
];

const FEATURES = [
  {
    icon: ScrollText,
    title: "Interview scripts that sound like you",
    body: "Opening, a 20–30 second intro, career-journey and deep-dive questions, advice, and a natural close. Full script, cheat sheet, or question bank.",
  },
  {
    icon: ShieldCheck,
    title: "Grounded, never invented",
    body: "Every question cites the line in their profile it came from. Quotes the AI can't trace back to your pasted text are removed automatically.",
  },
  {
    icon: BellRing,
    title: "Follow-ups with a reason",
    body: "Thank-you notes within 24 hours, check-ins after reading a recommended book, reminders when someone offers an intro — and no arbitrary monthly pings.",
  },
  {
    icon: MessageSquareText,
    title: "Emails from your real notes",
    body: "Turn rough notes into a warm, specific message in a professional, friendly, or brief tone. Nothing is ever sent for you.",
  },
  {
    icon: History,
    title: "Relationship memory",
    body: "A timeline for every person: how you met, every conversation, advice, commitments, and when to reconnect.",
  },
  {
    icon: BookOpenText,
    title: "Timeline-aware",
    body: "Plan around a big commitment like a two-year service mission: reminders move out of the time you're away, and no return date is ever assumed.",
  },
];

export default function Landing() {
  const demo = config().demo.enabled;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-brand-foreground">
            <Coffee className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">CoffeeChat AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          {demo ? (
            <a href="/demo" className={buttonVariants()}>
              Try the demo
            </a>
          ) : null}
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-8 sm:pt-20">
          <div className="max-w-3xl space-y-6">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-brand" /> Your personal networking copilot
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Better coffee chats. Relationships that last.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
              CoffeeChat AI helps students prepare for informational interviews, remember every conversation, and follow up at
              the right moment — so networking feels genuine instead of transactional.
            </p>
            <div className="flex flex-wrap gap-3">
              {demo ? (
                <a href="/demo" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
                  Explore the live demo <ArrowRight />
                </a>
              ) : null}
              <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
                Sign in
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">The demo uses fictional people and companies. No sign-up needed.</p>
          </div>

          <ScriptPreview />
        </section>

        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="space-y-2">
                <div className="text-xs font-medium text-brand">Step {i + 1}</div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Built for the whole relationship, not one email</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-5">
                <f.icon className="size-5 text-brand" />
                <h3 className="mt-3 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
          <div className="grid gap-8 rounded-2xl border border-border bg-card p-6 sm:p-10 lg:grid-cols-2">
            <div className="space-y-3">
              <Lock className="size-5 text-brand" />
              <h2 className="text-xl font-semibold tracking-tight">Private by design</h2>
              <p className="text-sm text-muted-foreground">
                Real contacts and notes live in a private Postgres database protected by row-level security. The public demo
                runs entirely in memory with synthetic data and has no database connection at all.
              </p>
            </div>
            <ul className="grid gap-2.5 text-sm">
              {[
                "Pasted profiles and emails are treated as untrusted data, never as instructions",
                "AI runs server-side only; keys never reach the browser",
                "Every database row is owned by one user and enforced in Postgres",
                "Emails are never sent automatically — you mark them sent yourself",
                "No LinkedIn scraping or bypassing platform restrictions",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <span>CoffeeChat AI · a portfolio project by Toby Zheng</span>
          <span>Next.js · TypeScript · Supabase · Claude</span>
        </div>
      </footer>
    </div>
  );
}

/** Static illustration of the script view (fictional content). */
function ScriptPreview() {
  return (
    <div className="mt-14 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-2 text-xs text-muted-foreground">Coffee chat with Maya Patel · Northwind Consulting · 30 min</span>
      </div>
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_280px]">
        <div className="space-y-5 p-6">
          <div>
            <p className="eyebrow">Why I wanted to connect</p>
            <p className="script-text mt-1.5">
              I wanted to talk with you because you moved from procurement at Granite Machinery into consulting — that&apos;s
              exactly the path I&apos;m trying to understand.
            </p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-brand">Must ask</span>
              <span className="text-xs text-muted-foreground">Career journey</span>
            </div>
            <p className="script-text mt-2 font-medium">
              I saw you were at Granite Machinery before Northwind. What made you decide to make that move?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <FileText className="mr-1 inline size-3" />
              From their profile: “Procurement Analyst · Granite Machinery”
            </p>
          </div>
        </div>
        <div className="space-y-3 border-t border-border bg-muted/40 p-6 md:border-t-0 md:border-l">
          <p className="eyebrow">Follow-ups</p>
          {[
            ["Send Maya a thank-you note", "Tomorrow"],
            ["Check on the intro to Daniel", "In 10 days"],
            ["Share takeaways from “The Pyramid Principle”", "In 4 weeks"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">{t}</p>
              <p className="text-xs text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
