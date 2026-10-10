/* ═══════════════════════════════════════════════════════════════
   THE SMEARED TIMEBASE — shared engine (Bulletin No. 15)

   Civil time is anchored to the sun:
     • Sunrise is 06:00:00, every day, at every location.
     • Sunset  is 18:00:00, every day, at every location.
   Daylight (sunrise → sunset) is divided into twelve equal hours;
   night (sunset → next sunrise) into twelve more. The clock runs
   continuously, compressing or expanding each hour to fit. Midnight
   falls at the exact midpoint of darkness.

   Sunrise/sunset come from the standard sunrise equation (solar
   altitude −0.833°, i.e. upper limb with refraction), accurate to
   about a minute. Above the polar circles the hour angle is clamped
   so that the shortest permitted day or night is ~65 minutes —
   the "provisional schedule" of the Institute's Northern Annex.

   This file is the single source of truth. Pages render its output.
   ═══════════════════════════════════════════════════════════════ */
export const HOUR = 3600000;
export const DAY = 86400000;
export const SUNRISE_H = 6;
export const SUNSET_H = 18;

const RAD = Math.PI / 180;
const J2000 = 2451545;
const toJD = (ms) => ms / DAY + 2440587.5;
const fromJD = (jd) => (jd - 2440587.5) * DAY;
const COS_W_LIMIT = 0.99; // polar clamp → minimum segment ≈ 65 min

/* ── reference locations ──────────────────────────────────────── */
const ZONES = {
  "America/New_York":    ["New York",    40.71,  -74.01],
  "America/Detroit":     ["Detroit",     42.33,  -83.05],
  "America/Toronto":     ["Toronto",     43.65,  -79.38],
  "America/Chicago":     ["Chicago",     41.88,  -87.63],
  "America/Denver":      ["Denver",      39.74, -104.99],
  "America/Phoenix":     ["Phoenix",     33.45, -112.07],
  "America/Los_Angeles": ["Los Angeles", 34.05, -118.24],
  "America/Vancouver":   ["Vancouver",   49.28, -123.12],
  "America/Anchorage":   ["Anchorage",   61.22, -149.90],
  "Pacific/Honolulu":    ["Honolulu",    21.31, -157.86],
  "Europe/London":       ["London",      51.51,   -0.13],
  "Europe/Dublin":       ["Dublin",      53.35,   -6.26],
  "Europe/Paris":        ["Paris",       48.86,    2.35],
  "Europe/Berlin":       ["Berlin",      52.52,   13.40],
  "Europe/Madrid":       ["Madrid",      40.42,   -3.70],
  "Europe/Rome":         ["Rome",        41.90,   12.50],
  "Europe/Amsterdam":    ["Amsterdam",   52.37,    4.90],
  "Asia/Tokyo":          ["Tokyo",       35.68,  139.69],
  "Asia/Kolkata":        ["New Delhi",   28.61,   77.21],
  "Asia/Shanghai":       ["Beijing",     39.90,  116.40],
  "Australia/Sydney":    ["Sydney",     -33.87,  151.21],
  "Pacific/Auckland":    ["Auckland",   -36.85,  174.76],
};
const STORE_KEY = "dst-location-v1";

export function defaultLocation() {
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
  if (ZONES[tz]) {
    const [name, lat, lon] = ZONES[tz];
    return { name, lat, lon, source: "reference" };
  }
  // Fall back to the standard meridian of the viewer's time zone, at 40°N.
  const y = new Date().getFullYear();
  const std = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  return { name: "Regional reference meridian", lat: 40, lon: -std / 4, source: "reference" };
}

export function getLocation() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && isFinite(s.lat) && isFinite(s.lon)) return s;
  } catch {}
  return defaultLocation();
}

export function clearLocation() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
  return defaultLocation();
}

export function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = {
          name: "Your location",
          lat: +p.coords.latitude.toFixed(3),
          lon: +p.coords.longitude.toFixed(3),
          source: "device",
        };
        try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch {}
        resolve(loc);
      },
      reject,
      { maximumAge: 6 * HOUR, timeout: 15000 }
    );
  });
}

export const fmtCoords = (loc) =>
  Math.abs(loc.lat).toFixed(2) + "°" + (loc.lat >= 0 ? "N" : "S") + " " +
  Math.abs(loc.lon).toFixed(2) + "°" + (loc.lon >= 0 ? "E" : "W");

/* ── the sun ──────────────────────────────────────────────────── */
// Solar day n (integer days since J2000) at longitude lon (east +).
function solarDay(n, lat, lon) {
  const Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const Mr = M * RAD;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const L = ((M + C + 180 + 102.9372) % 360) * RAD;
  const Jt = J2000 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * L);
  const sinD = Math.sin(L) * Math.sin(23.4397 * RAD);
  const cosD = Math.cos(Math.asin(sinD));
  let cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinD) / (Math.cos(lat * RAD) * cosD);
  cosW = Math.max(-COS_W_LIMIT, Math.min(COS_W_LIMIT, cosW));
  const w = Math.acos(cosW) / RAD;
  return {
    n,
    transit: fromJD(Jt),
    rise: fromJD(Jt - w / 360),
    set: fromJD(Jt + w / 360),
  };
}

const nearestDay = (ms, lon) => Math.round(toJD(ms) - J2000 + lon / 360);

/** Legacy sunrise/sunset for the solar day nearest a given instant. */
export function sunEvents(ms, loc) {
  const d = solarDay(nearestDay(ms, loc.lon), loc.lat, loc.lon);
  return { rise: new Date(d.rise), set: new Date(d.set), transit: new Date(d.transit) };
}

/* ── the smeared clock ────────────────────────────────────────── */
export function smearState(now, loc) {
  const t = now.getTime();
  const n0 = nearestDay(t, loc.lon);
  const days = [-2, -1, 0, 1, 2].map((k) => solarDay(n0 + k, loc.lat, loc.lon));

  let seg = null;
  for (let i = 0; i < days.length && !seg; i++) {
    const d = days[i], nx = days[i + 1];
    if (t >= d.rise && t < d.set) seg = { phase: "day", start: d.rise, end: d.set, base: SUNRISE_H, d };
    else if (nx && t >= d.set && t < nx.rise) seg = { phase: "night", start: d.set, end: nx.rise, base: SUNSET_H, d };
  }

  const frac = (t - seg.start) / (seg.end - seg.start);
  const hourMs = (seg.end - seg.start) / 12;
  let msOfDay = seg.base * HOUR + frac * 12 * HOUR;
  let dayShift = 0;
  if (msOfDay >= 24 * HOUR) { msOfDay -= 24 * HOUR; dayShift = 1; }

  // The smeared calendar date is the local solar date of the governing day.
  const solarDate = new Date(seg.d.transit + dayShift * DAY + (loc.lon / 360) * DAY);
  const date = new Date(Date.UTC(solarDate.getUTCFullYear(), solarDate.getUTCMonth(), solarDate.getUTCDate()));

  // Divergence from legacy civil time on this device, wrapped to ±12 h.
  const civilMs = now.getHours() * HOUR + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
  let divergenceMs = msOfDay - civilMs;
  if (divergenceMs > 12 * HOUR) divergenceMs -= 24 * HOUR;
  if (divergenceMs <= -12 * HOUR) divergenceMs += 24 * HOUR;

  return {
    phase: seg.phase,
    frac,
    hourMs,
    rate: HOUR / hourMs,               // smeared seconds per legacy second
    msOfDay,
    date,                              // UTC-midnight Date; format with timeZone:"UTC"
    divergenceMs,
    next: { kind: seg.phase === "day" ? "sunset" : "sunrise", at: new Date(seg.end) },
  };
}

export function smearedNow(loc = getLocation()) {
  const now = new Date();
  const st = smearState(now, loc);
  const m = st.msOfDay;
  return {
    now, st, loc,
    h: Math.floor(m / HOUR),
    m: Math.floor((m % HOUR) / 60000),
    s: Math.floor((m % 60000) / 1000),
    ms: Math.floor(m % 1000),
  };
}

/* ── formatting ───────────────────────────────────────────────── */
export const pad = (n, w = 2) => String(n).padStart(w, "0");
export const fmtHMS = (h, m, s) => pad(h) + ":" + pad(m) + ":" + pad(s);
export const fmtSmearedDate = (d) => d.toLocaleDateString(undefined,
  { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export const fmtLegacyTime = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtDur = (ms) => {
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + "m " + pad(s % 60) + "s";
};
