"use client";

import { CheckCircle2, MoreHorizontal, XCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelMeetingAction, markMeetingCompletedAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function MeetingActions({ meetingId, status }: { meetingId: string; status: string }) {
  const [pending, start] = useTransition();
  if (status !== "planned") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" aria-label="Meeting actions" disabled={pending} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() =>
            start(async () => {
              const r = await markMeetingCompletedAction(meetingId);
              if (r.ok) toast.success("Marked as completed");
              else toast.error(r.error);
            })
          }
        >
          <CheckCircle2 /> Mark as completed
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            start(async () => {
              const r = await cancelMeetingAction(meetingId);
              if (r.ok) toast.success("Meeting cancelled");
              else toast.error(r.error);
            })
          }
        >
          <XCircle /> Cancel meeting
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
