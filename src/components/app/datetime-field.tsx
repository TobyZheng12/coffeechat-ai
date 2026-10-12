"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * datetime-local inputs have no time zone. We convert to an ISO timestamp in
 * the browser (which knows the user's zone) and submit that in a hidden field.
 */
export function DateTimeField({ name, id, defaultValue }: { name: string; id?: string; defaultValue?: string | null }) {
  const [local, setLocal] = useState(() => (defaultValue ? toLocalInput(defaultValue) : ""));
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <Input id={id} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
