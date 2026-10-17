import { parseTimestamp, formatTime, humanizeTimestamp, dayLabel, computeVaccinationStatus, sortByTimeAsc, nowISO, addDaysISO } from '../src/utils/time';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (got === want) { pass++; }
  else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const near = (name: string, got: number, want: number, tol = 5000) => {
  if (Math.abs(got - want) <= tol) { pass++; }
  else { fail++; console.error(`FAIL ${name}: got ${got}, want ~${want}`); }
};

const now = new Date('2026-10-13T14:00:00+06:00').getTime(); // 08:00 UTC
const realNow = Date.now();
// absolute formats still honor the fallback
eq('parse 10:42 AM today (hour)', new Date(parseTimestamp('10:42 AM', now)).getHours(), 10);
eq('parse ISO', parseTimestamp('2026-10-13T08:00:00.000Z', now), Date.parse('2026-10-13T08:00:00.000Z'));
// relative formats anchor to real now by design (they describe "when the user looked")
near('parse just now', parseTimestamp('Just now', now), realNow);
near('parse 5 mins ago', parseTimestamp('5 mins ago', now), realNow - 5*60_000);
near('parse 2h ago', parseTimestamp('2h ago', now), realNow - 2*3_600_000);
near('parse Yesterday', parseTimestamp('Yesterday', now), realNow - 86_400_000);
eq('parse junk falls back', parseTimestamp('blah', now), now);
// format
eq('formatTime 10:42', formatTime('2026-10-13T10:42:00'), '10:42 AM');
// humanize (deterministic with injected now)
eq('humanize just now', humanizeTimestamp(new Date(now - 30_000).toISOString(), now), 'Just now');
eq('humanize 5m', humanizeTimestamp(new Date(now - 5*60_000).toISOString(), now), '5m ago');
eq('humanize 3h', humanizeTimestamp(new Date(now - 3*3_600_000).toISOString(), now), '3h ago');
eq('humanize yesterday', humanizeTimestamp(new Date(now - 30*3_600_000).toISOString(), now), 'Yesterday');
// day labels relative to real today
eq('dayLabel now', dayLabel(new Date().toISOString()), 'Today');
eq('dayLabel 2 days ago', dayLabel(new Date(Date.now() - 2*86_400_000).toISOString()), '2 days ago');
// vaccination
eq('vacc overdue past', computeVaccinationStatus('2025-03-15', '2026-10-13'), 'Overdue');
eq('vacc upcoming future', computeVaccinationStatus('2026-12-01', '2026-10-13'), 'Upcoming');
eq('vacc upcoming today', computeVaccinationStatus('2026-10-13', '2026-10-13'), 'Upcoming');
eq('addDaysISO', addDaysISO('2026-10-13', 30), '2026-11-12');
// sorting with unambiguous absolute times (oldest -> newest)
const msgs = [
  { id: 'a', t: '2026-10-13T10:20:00Z' },
  { id: 'b', t: new Date(now - 60_000).toISOString() },
  { id: 'c', t: '2026-10-13T07:00:00Z' },
];
eq('sort order', sortByTimeAsc(msgs, m => m.t).map(m=>m.id).join(','), 'c,b,a');
eq('nowISO parses', !Number.isNaN(Date.parse(nowISO())), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
