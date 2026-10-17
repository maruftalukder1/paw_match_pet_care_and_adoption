/**
 * time.ts — Pure time helpers used across PawMatch.
 *
 * The legacy demo seed data stored timestamps as free-form strings
 * ("10:42 AM", "Just now", "Yesterday", "2h ago"). Real messaging needs
 * real ISO-8601 timestamps so messages sort and group correctly.
 *
 * All functions here are pure and dependency-free, so they can be
 * unit-tested with plain node (see scripts/sanity-time.mjs).
 */

export const DAY_MS = 86_400_000;

/** Current time as ISO-8601 string. Use for every new record. */
export const nowISO = (): string => new Date().toISOString();

/**
 * Parse a stored timestamp into epoch milliseconds.
 * Accepts: ISO strings, "HH:MM AM/PM" (assumed today), "YYYY-MM-DD HH:mm",
 * epoch numbers. Falls back to `fallbackMs` (default: now).
 */
export function parseTimestamp(ts: unknown, fallbackMs: number = Date.now()): number {
  if (ts == null) return fallbackMs;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts !== 'string') return fallbackMs;

  const s = ts.trim();
  if (!s) return fallbackMs;

  // 1. ISO / Date.parse-able
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;

  // 2. "10:42 AM" / "10:42:05 pm" -> today at that time
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*\.?[Mm]\.?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    const isPM = m[4].toLowerCase() === 'p';
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    const d = new Date();
    d.setHours(h, min, sec, 0);
    return d.getTime();
  }

  // 3. "YYYY-MM-DD HH:mm" (legacy activity-log format)
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m2) {
    return new Date(
      parseInt(m2[1], 10),
      parseInt(m2[2], 10) - 1,
      parseInt(m2[3], 10),
      parseInt(m2[4], 10),
      parseInt(m2[5], 10),
      m2[6] ? parseInt(m2[6], 10) : 0
    ).getTime();
  }

  // 4. Relative legacy strings ("Just now", "5 mins ago", "2h ago", "Yesterday")
  const lower = s.toLowerCase();
  const now = Date.now();
  if (lower === 'just now') return now;
  const rel = lower.match(/^(\d+)\s*(min|mins?|hour|hours?|h|day|days?|d)\s*ago$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    if (unit.startsWith('min')) return now - n * 60_000;
    if (unit.startsWith('h')) return now - n * 3_600_000;
    return now - n * DAY_MS;
  }
  if (lower === 'yesterday') return now - DAY_MS;

  return fallbackMs;
}

/** "10:42 AM" from a timestamp. */
export function formatTime(ts: unknown): string {
  const d = new Date(parseTimestamp(ts));
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** "Today" / "Yesterday" / "12 Oct 2026" style day labels for separators. */
export function dayLabel(ts: unknown): string {
  const d = new Date(parseTimestamp(ts));
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Humanized list timestamp: "Just now" (<1m), "5m ago" (<1h),
 * "3h ago" (<24h), "Yesterday", otherwise "12 Oct".
 */
export function humanizeTimestamp(ts: unknown, now: number = Date.now()): string {
  const t = parseTimestamp(ts, now);
  const diff = now - t;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * DAY_MS) return 'Yesterday';
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} days ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Stable sort helper: oldest first (chat order). */
export function sortByTimeAsc<T>(items: T[], getTs: (item: T) => unknown): T[] {
  return [...items].sort((a, b) => parseTimestamp(getTs(a)) - parseTimestamp(getTs(b)));
}

/** Format a Date as a LOCAL ISO date (YYYY-MM-DD) — never via toISOString,
 *  which is UTC and shifts the day in UTC+ timezones like Asia/Dhaka. */
export function toLocalISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today's date in the user's local timezone (YYYY-MM-DD). */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/**
 * Vaccination display status computed from nextDueDate — never trust the
 * hardcoded seed value. Returns 'Overdue' when the due date has passed,
 * otherwise 'Upcoming'.
 */
export function computeVaccinationStatus(
  nextDueDate: string,
  today: string = todayISO()
): 'Overdue' | 'Upcoming' {
  return nextDueDate < today ? 'Overdue' : 'Upcoming';
}

/** ISO date (YYYY-MM-DD) N days from a given ISO date — handy for tests. */
export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/** Human-friendly pet age: "10 mos" under a year, otherwise "1 year" / "3 years". */
export function formatPetAge(ageMonths: number): string {
  const m = Math.max(0, Math.round(ageMonths));
  if (m < 12) return `${m} ${m === 1 ? 'mo' : 'mos'}`;
  const y = Math.floor(m / 12);
  return `${y} ${y === 1 ? 'year' : 'years'}`;
}
