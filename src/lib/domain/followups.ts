import { addDays } from "./dates";
import type { FollowUpTask, ISODate } from "./types";

export interface FollowUpBuckets<T extends FollowUpTask = FollowUpTask> {
  overdue: T[];
  thisWeek: T[];
  upcoming: T[];
  completed: T[];
}

export function isOpen(task: Pick<FollowUpTask, "status">): boolean {
  return task.status === "suggested" || task.status === "accepted" || task.status === "snoozed";
}

/** Groups tasks for the Follow-Up Dashboard. Dismissed tasks are hidden. */
export function bucketFollowUps<T extends FollowUpTask>(tasks: T[], today: ISODate): FollowUpBuckets<T> {
  const weekEnd = addDays(today, 6);
  const out: FollowUpBuckets<T> = { overdue: [], thisWeek: [], upcoming: [], completed: [] };
  for (const t of tasks) {
    if (t.status === "completed") out.completed.push(t);
    else if (!isOpen(t)) continue;
    else if (t.due_date && t.due_date < today) out.overdue.push(t);
    else if (t.due_date && t.due_date <= weekEnd) out.thisWeek.push(t);
    else out.upcoming.push(t);
  }
  const byDue = (a: T, b: T) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  out.overdue.sort(byDue);
  out.thisWeek.sort(byDue);
  out.upcoming.sort(byDue);
  out.completed.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return out;
}

/** Number of open tasks that need attention now (badge in the sidebar). */
export function attentionCount(tasks: FollowUpTask[], today: ISODate): number {
  const b = bucketFollowUps(tasks, today);
  return b.overdue.length + b.thisWeek.filter((t) => t.due_date && t.due_date <= today).length;
}
