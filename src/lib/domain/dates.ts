import type { ISODate } from "./types";

/**
 * Date helpers that work on calendar dates (`YYYY-MM-DD`) rather than
 * timestamps, so "due tomorrow" never drifts across time zones.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isISODate(value: string): value is ISODate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Today's calendar date in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Calendar date of a timestamp in the given time zone. */
export function dateOf(timestamp: string, timeZone: string): ISODate {
  return todayIn(timeZone, new Date(timestamp));
}

export function addDays(date: ISODate, days: number): ISODate {
  const t = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function diffDays(later: ISODate, earlier: ISODate): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS,
  );
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function formatDate(date: ISODate | null | undefined, opts?: { withYear?: boolean }): string {
  if (!date) return "No date";
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: opts?.withYear === false ? undefined : "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(ts: string | null | undefined, timeZone: string): string {
  if (!ts) return "Not scheduled";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** "in 3 days", "2 days ago", "today". */
export function relativeDays(date: ISODate, today: ISODate): string {
  const d = diffDays(date, today);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 0) return d < 14 ? `in ${d} days` : `in ${Math.round(d / 7)} weeks`;
  return -d < 14 ? `${-d} days ago` : `${Math.round(-d / 7)} weeks ago`;
}
