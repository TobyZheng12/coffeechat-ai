import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import { FollowUpItem } from "@/components/app/follow-up-item";
import { EmptyState, PageHeader, Section } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFollowUpBoard } from "@/lib/services/views";
import { requireWorkspace } from "@/lib/workspace";
import { FollowUpCalendar } from "./calendar";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const ws = await requireWorkspace();
  const { buckets, today, all } = await getFollowUpBoard(ws);
  const groups = [
    { key: "overdue", title: "Overdue", items: buckets.overdue, empty: "Nothing overdue." },
    { key: "week", title: "Due this week", items: buckets.thisWeek, empty: "Nothing due in the next 7 days." },
    { key: "upcoming", title: "Upcoming", items: buckets.upcoming, empty: "Nothing scheduled further out." },
    { key: "done", title: "Completed", items: buckets.completed.slice(0, 20), empty: "Completed follow-ups show up here." },
  ];
  const total = buckets.overdue.length + buckets.thisWeek.length + buckets.upcoming.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description="Every suggestion comes with a reason. Reminders appear here in the app — nothing is emailed or sent automatically."
      />
      {total + buckets.completed.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title="No follow-ups yet"
          description="After a coffee chat, save your notes and CoffeeChat AI suggests thoughtful, well-timed follow-ups."
        />
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-6 space-y-8">
            {groups.map((g) => (
              <Section
                key={g.key}
                title={
                  <span className="flex items-center gap-2">
                    {g.title}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{g.items.length}</span>
                  </span>
                }
              >
                {g.items.length ? (
                  <div className="space-y-2">
                    {g.items.map((t) => (
                      <FollowUpItem key={t.id} task={t} today={today} contactName={t.contact_name} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{g.empty}</p>
                )}
              </Section>
            ))}
          </TabsContent>
          <TabsContent value="calendar" className="mt-6">
            <FollowUpCalendar tasks={all} today={today} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
