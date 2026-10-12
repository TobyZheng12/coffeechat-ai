import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { loadProfile } from "@/lib/services/context";
import { requireWorkspace } from "@/lib/workspace";
import { ProfileForm } from "./profile-form";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Profile & timeline" };

export default async function SettingsPage() {
  const ws = await requireWorkspace();
  const profile = await loadProfile(ws);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & timeline"
        description="This is what the AI knows about you. Everything here is editable, and nothing is shared."
      />
      <ProfileForm profile={profile} />
    </div>
  );
}
