import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { composeIntroduction } from "@/lib/profile/introduction";
import { normalizeProfile } from "@/lib/profile/normalize";
import { loadProfile, todayFor } from "@/lib/services/context";
import { requireWorkspace } from "@/lib/workspace";
import { type IntroPreview, ProfileForm } from "./profile-form";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Profile & timeline" };

export default async function SettingsPage() {
  const ws = await requireWorkspace();
  const profile = await loadProfile(ws);
  const np = normalizeProfile(profile);
  const generic = composeIntroduction(np, { intro_pitch: "" }, {}, todayFor(ws, profile));
  const preview: IntroPreview = {
    suggested: generic.text,
    words: generic.words,
    warnings: generic.warnings,
    facts: [
      np.name && { label: "Name", value: np.name.value, source: np.name.source },
      np.hometown && { label: "From", value: np.hometown.value, source: np.hometown.source },
      np.school && { label: "School", value: np.school.spoken === np.school.value ? np.school.value : `${np.school.value} (“${np.school.spoken}”)`, source: np.school.source },
      np.major && { label: "Studies", value: np.major.value, source: np.major.source },
      ...np.experiences.map((e, i) => ({
        label: i === 0 ? "Experience" : "",
        value: [e.title, e.orgSpoken].filter(Boolean).join(" · ") + (e.period ? ` (${e.period})` : ""),
        source: e.source,
      })),
      np.interests.length > 0 && { label: "Interests", value: np.interests.map((x) => x.value).join(", "), source: np.interests.map((x) => x.source).join(", ") },
    ].filter((f): f is { label: string; value: string; source: string } => !!f),
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & timeline"
        description="This is what the AI knows about you. Everything here is editable, and nothing is shared."
      />
      <ProfileForm profile={profile} preview={preview} />
    </div>
  );
}
