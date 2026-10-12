import { AppShell } from "@/components/app/app-shell";
import { todayIn } from "@/lib/domain/dates";
import { attentionCount } from "@/lib/domain/followups";
import { requireWorkspace } from "@/lib/workspace";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const [profile, tasks] = await Promise.all([ws.repo.getProfile(), ws.repo.listFollowUps()]);
  const today = todayIn(profile?.timezone || "America/Denver");
  return (
    <AppShell
      mode={ws.mode}
      displayName={profile?.preferred_name || profile?.full_name || ws.email || ""}
      attention={attentionCount(tasks, today)}
    >
      {children}
    </AppShell>
  );
}
