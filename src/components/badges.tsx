import { cn } from "@/lib/utils";
import type { RelationshipStrength } from "@/lib/domain/relationship";
import type { Confidence, FollowUpStatus, Priority } from "@/lib/domain/types";

const tone = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export function Pill({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[0.6875rem] font-medium whitespace-nowrap",
        tone[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: Priority | 1 | 2 | 3 }) {
  const p = priority === 1 ? "high" : priority === 2 ? "medium" : priority === 3 ? "low" : priority;
  const label = typeof priority === "number" ? (priority === 1 ? "Must ask" : priority === 2 ? "If time" : "Optional") : `${p} priority`;
  return <Pill variant={p === "high" ? "brand" : "neutral"}>{label}</Pill>;
}

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return <Pill variant="neutral">{confidence} confidence</Pill>;
}

export function StatusPill({ status }: { status: FollowUpStatus }) {
  const map: Record<FollowUpStatus, keyof typeof tone> = {
    suggested: "brand",
    accepted: "neutral",
    snoozed: "warning",
    dismissed: "neutral",
    completed: "success",
  };
  return <Pill variant={map[status]}>{status}</Pill>;
}

export function StrengthPill({ strength }: { strength: RelationshipStrength }) {
  const label = { new: "New connection", developing: "Developing", warm: "Warm" }[strength];
  return <Pill variant={strength === "warm" ? "success" : strength === "developing" ? "brand" : "neutral"}>{label}</Pill>;
}
