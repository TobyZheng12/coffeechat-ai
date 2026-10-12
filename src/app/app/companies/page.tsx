import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page";
import { listCompanies } from "@/lib/services/companies";
import { requireWorkspace } from "@/lib/workspace";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const ws = await requireWorkspace();
  const companies = await listCompanies(ws);
  return (
    <div className="space-y-6">
      <PageHeader title="Companies" description="Your network and what you've learned, organized by employer." />
      {companies.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Link
              key={c.name}
              href={`/app/companies/${encodeURIComponent(c.name)}`}
              className="space-y-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="size-4 text-brand" /> {c.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.contacts} {c.contacts === 1 ? "person" : "people"} · {c.conversations} conversation{c.conversations === 1 ? "" : "s"} · {c.insights} insight
                {c.insights === 1 ? "" : "s"}
              </p>
              {c.industry ? <p className="text-xs text-muted-foreground">{c.industry}</p> : null}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Building2 />} title="No companies yet" description="Companies appear here as you add contacts." />
      )}
    </div>
  );
}
