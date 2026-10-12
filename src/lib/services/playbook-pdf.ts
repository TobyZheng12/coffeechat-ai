import "server-only";
import { jsPDF } from "jspdf";
import { formatDate } from "@/lib/domain/dates";
import { type Playbook, statsLine } from "./playbook";

/**
 * Renders the playbook as a clean, printable PDF (US Letter).
 * Uses the built-in Helvetica font, so text is normalised to Latin-1.
 */

const MARGIN = 56;
const INK: [number, number, number] = [32, 30, 28];
const MUTED: [number, number, number] = [110, 104, 98];
const ACCENT: [number, number, number] = [166, 92, 42];

function latin1(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[·•]/g, "-")
    .replace(/[→]/g, "->")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function playbookToPdf(p: Playbook): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const width = W - MARGIN * 2;
  let y = MARGIN;

  const ensure = (h: number) => {
    if (y + h > H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10.5;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? INK));
    const lines = doc.splitTextToSize(latin1(s), width - (opts.indent ?? 0)) as string[];
    const lh = size * 1.4;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, MARGIN + (opts.indent ?? 0), y + size);
      y += lh;
    }
    y += opts.gap ?? 4;
  };
  const bullet = (s: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    ensure(15);
    doc.setTextColor(...ACCENT);
    doc.text("-", MARGIN + 4, y + 10.5);
    text(s, { indent: 16, gap: 2 });
  };
  const h2 = (s: string) => {
    y += 10;
    ensure(40);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.2);
    doc.line(MARGIN, y, MARGIN + 28, y);
    y += 8;
    text(s, { size: 15, bold: true, gap: 6 });
  };
  const h3 = (s: string) => {
    y += 4;
    ensure(30);
    text(s, { size: 12, bold: true, gap: 2 });
  };

  // Cover
  text(p.title, { size: 22, bold: true, gap: 6 });
  text(
    [p.owner, `Generated ${formatDate(p.generatedOn)}`, p.departure && `Departure ${formatDate(p.departure)}`, p.returnDate && `Return ${formatDate(p.returnDate)}`]
      .filter(Boolean)
      .join("  -  "),
    { color: MUTED, gap: 10 },
  );
  text(statsLine(p, "  -  "), { color: MUTED });

  h2("Before you leave");
  if (p.beforeYouLeave.length) p.beforeYouLeave.forEach((t) => bullet(`[ ] ${t.title} - ${t.who}${t.due ? ` (by ${formatDate(t.due)})` : ""}`));
  else text("Nothing outstanding.", { color: MUTED });

  h2("Reconnect after you return");
  if (p.afterYouReturn.length) p.afterYouReturn.forEach((r) => bullet(`${r.who} - ${r.when}. ${r.angle}`));
  else text("No conversations recorded yet.", { color: MUTED });

  h2("Recruiting advice");
  if (p.recruitingAdvice.length) p.recruitingAdvice.forEach((a) => bullet(`${a.insight} (${a.by})`));
  else text("None recorded yet.", { color: MUTED });

  h2("Career insights by theme");
  if (!p.themes.length) text("None recorded yet.", { color: MUTED });
  for (const t of p.themes) {
    h3(t.topic.charAt(0).toUpperCase() + t.topic.slice(1));
    t.items.forEach((i) => bullet(`${i.insight} (${i.by})`));
  }

  h2("People");
  for (const person of p.people) {
    h3(person.name);
    text(
      `${[person.role, person.company].filter(Boolean).join(" at ") || "Role not recorded"}${person.howConnected ? `  -  Connected via ${person.howConnected}` : ""}`,
      { color: MUTED, gap: 4 },
    );
    if (person.conversations.length) {
      text("Conversations", { bold: true, size: 10, gap: 1 });
      person.conversations.forEach((c) => bullet(`${formatDate(c.date)}: ${c.summary}`));
    }
    if (person.advice.length) {
      text("Their advice", { bold: true, size: 10, gap: 1 });
      person.advice.forEach(bullet);
    }
    if (person.worthRemembering.length) {
      text("Worth remembering", { bold: true, size: 10, gap: 1 });
      person.worthRemembering.forEach(bullet);
    }
    if (person.openItems.length) {
      text("Open items", { bold: true, size: 10, gap: 1 });
      person.openItems.forEach(bullet);
    }
    text(`Reconnect: ${person.reconnect.when}. ${person.reconnect.angle}`, { gap: 10 });
  }

  // Footer with page numbers.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`CoffeeChat AI  -  compiled from your saved notes  -  ${i} / ${pages}`, MARGIN, H - 28);
  }
  return doc.output("arraybuffer");
}
