import { Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StrengthPill } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, relativeDays, todayIn } from "@/lib/domain/dates";
import { listContactsView } from "@/lib/services/views";
import { requireWorkspace } from "@/lib/workspace";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.slice(0, 100);
  const ws = await requireWorkspace();
  const [rows, profile] = await Promise.all([listContactsView(ws, query), ws.repo.getProfile()]);
  const today = todayIn(profile?.timezone || "America/Denver");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Everyone you've met or plan to meet, and where each relationship stands."
        actions={
          <Link href="/app/prepare" className={buttonVariants({ size: "lg" })}>
            <Plus /> Prepare coffee chat
          </Link>
        }
      />
      <form className="relative max-w-md" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={query} placeholder="Search names, companies, roles, notes…" className="pl-8" aria-label="Search contacts" />
      </form>
      {rows.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[2fr_1.5fr_1fr_1.5fr] gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Name</span>
            <span>Company</span>
            <span>Last contact</span>
            <span>Next follow-up</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map(({ contact, strength, lastContact, nextFollowUp, meetingsCompleted }) => (
              <li key={contact.id}>
                <Link
                  href={`/app/contacts/${contact.id}`}
                  className="grid gap-1 px-4 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[2fr_1.5fr_1fr_1.5fr] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{contact.full_name}</span>
                      <StrengthPill strength={strength} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contact.current_position || "—"}
                      {meetingsCompleted ? ` · ${meetingsCompleted} conversation${meetingsCompleted === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{contact.current_company || "—"}</span>
                  <span className="text-sm text-muted-foreground">
                    {lastContact ? relativeDays(lastContact.slice(0, 10), today) : "Not yet"}
                  </span>
                  <span className="truncate text-sm">
                    {nextFollowUp ? (
                      <>
                        {nextFollowUp.title}{" "}
                        <span className="text-xs text-muted-foreground">
                          {nextFollowUp.due_date ? `· ${formatDate(nextFollowUp.due_date, { withYear: false })}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title={query ? `No contacts match “${query}”` : "No contacts yet"}
          description={query ? "Search covers names, companies, roles, tags, and your meeting notes." : "Prepare your first coffee chat to add someone."}
          action={
            query ? (
              <Link href="/app/contacts" className={buttonVariants({ variant: "outline" })}>
                Clear search
              </Link>
            ) : (
              <Link href="/app/prepare" className={buttonVariants()}>
                Prepare coffee chat
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
