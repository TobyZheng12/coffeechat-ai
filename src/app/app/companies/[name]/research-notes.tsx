"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCompanyResearchAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ResearchNotes({ company, initial }: { company: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={8}
        maxLength={20000}
        aria-label={`Your research notes on ${company}`}
        placeholder="What you've read or learned yourself: business lines, recent news, recruiting timeline, office locations…"
      />
      <Button
        size="sm"
        disabled={pending || notes === saved}
        onClick={() =>
          start(async () => {
            const r = await saveCompanyResearchAction(company, notes);
            if (!r.ok) return void toast.error(r.error);
            setSaved(notes);
            toast.success("Notes saved");
          })
        }
      >
        Save notes
      </Button>
    </div>
  );
}
