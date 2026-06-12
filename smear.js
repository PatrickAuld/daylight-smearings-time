/* ═══════════════════════════════════════════════════════════════
   THE SMEARED TIMEBASE — shared engine
   The one-hour change is administered linearly over the 14 days
   ending at the legacy U.S. transition instant (second Sunday of
   March / first Sunday of November, 2:00 a.m. local). The smear
   completes exactly as unsmeared clocks jump, so the two timebases
   re-converge at the legacy moment.
   Rate while smearing: 3600 s / 1,209,600 s = 2.98 ms per second.
   ═══════════════════════════════════════════════════════════════ */
const HOUR = 3600000, DAY = 86400000, SMEAR = 14 * DAY;
const SMEAR_RATE = "2.98 ms/s";

function nthSunday(year, month, n) {
  const firstDay = new Date(year, month, 1).getDay();
  const date = 1 + ((7 - firstDay) % 7) + 7 * (n - 1);
  return new Date(year, month, date, 2, 0, 0);
}
function transitionsFor(year) {
  return [
    { at: nthSunday(year, 2, 2),  dir: +1, label: "spring" }, // 2nd Sun Mar
    { at: nthSunday(year, 10, 1), dir: -1, label: "fall"   }, // 1st Sun Nov
  ];
}
function allTransitions(now) {
  const y = now.getFullYear();
  return [...transitionsFor(y - 1), ...transitionsFor(y), ...transitionsFor(y + 1)]
    .sort((a, b) => a.at - b.at);
}

function smearState(now) {
  const ts = allTransitions(now);
  for (const tr of ts) {
    const start = new Date(tr.at.getTime() - SMEAR);
    if (now >= start && now < tr.at) {
      const f = (now - start) / SMEAR;
      return { active: true, frac: f, divergenceMs: tr.dir * f * HOUR, next: tr };
    }
  }
  const next = ts.find(tr => now < tr.at.getTime() - SMEAR);
  return { active: false, frac: 0, divergenceMs: 0, next };
}

function smearedNow() {
  const now = new Date();
  const st = smearState(now);
  return { now, st, smeared: new Date(now.getTime() + st.divergenceMs) };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const fmtDate = d => d.toLocaleDateString(undefined,
  { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const fmtShort = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
