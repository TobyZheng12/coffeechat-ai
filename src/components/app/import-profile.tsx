"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { importProfileFileAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";

const MAX = 3.8 * 1024 * 1024;

/**
 * Lets you import a LinkedIn "Save to PDF" export or a profile screenshot.
 * The extracted text is put into the box for you to review — nothing is saved
 * until you submit the form.
 */
export function ImportProfileButton({ onText }: { onText: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const handle = (file: File) => {
    if (file.size > MAX) return void toast.error("Files must be under 3.8 MB.");
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await importProfileFileAction(fd);
      if (!r.ok) return void toast.error(r.error);
      onText(r.data.text);
      toast.success(
        r.data.method === "pdf"
          ? `Imported ${r.data.pages ?? ""} page${r.data.pages === 1 ? "" : "s"} from PDF. Review the text below.`
          : "Read the text from your screenshot. Review it below.",
      );
    });
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Import LinkedIn PDF or screenshot"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Loader2 className="animate-spin" /> : <FileUp />} Import PDF or screenshot
      </Button>
    </>
  );
}
