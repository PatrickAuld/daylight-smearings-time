# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A parody campaign site for "Daylight Smearings Time" — a fictional civic proposal (from the
"Institute for Temporal Continuity") to anchor civil time to the sun: sunrise is always
06:00 and sunset always 18:00, with daylight and night each divided into twelve equal hours
that stretch or compress with the seasons (Bulletin No. 15, which superseded the earlier
fourteen-day DST smear of Bulletin No. 14). The humor depends entirely on a **deadpan,
serious tone**: the site never winks at the reader or admits it's a joke. Preserve this when
editing copy. The premise is internally consistent and leans on real precedent (leap smearing)
and real citations (DST heart-attack / traffic studies) — keep claims plausible and the voice
bureaucratic-earnest.

## Commands

```bash
npm run dev      # Astro dev server (HMR)
npm run build    # static build to dist/
npm run preview  # serve the built dist/
```

There is no test suite and no linter configured. Verify changes by building and viewing in a
browser. `astro build` does not type-check by default; run `npx astro check` if you want that.

## Architecture

Astro 5 static site. Two routed pages, with shared logic and design tokens factored out.

- **`src/scripts/smear.js`** is the conceptual core and the only place the time model lives.
  It's a plain ES module (exports functions + constants). Both pages import from it; Astro
  bundles it into one shared client chunk. The model: sunrise/sunset come from the standard
  sunrise equation (−0.833° altitude). Sunrise → sunset maps linearly onto 06:00–18:00;
  sunset → next sunrise maps onto 18:00–06:00, so midnight is the midpoint of darkness. Polar
  days/nights are clamped (min ~65 min segment). `smearState(now, loc)` returns
  `{ phase, frac, hourMs, rate, msOfDay, date, divergenceMs, next }`; `smearedNow(loc)` wraps
  it with the current time and h/m/s fields. The smeared `date` is a UTC-midnight Date — format
  it with `timeZone: "UTC"` (`fmtSmearedDate`). Location: `getLocation()` returns a saved device
  location (localStorage) or a reference city derived from the browser time zone;
  `requestDeviceLocation()` / `clearLocation()` switch between them. If you touch timekeeping,
  this file is the single source of truth — the pages only render its output.

- **`src/pages/index.astro`** — the campaign page (route `/`). Its inline module `<script>`
  drives the masthead clock, the §02 "today" line (hour lengths at the reference location), and
  the §02 SVG chart, which is generated client-side: a year of legacy sunrise/sunset times
  (dashed, wandering, with DST jumps) against the flat 6 am / 6 pm smeared lines. The pledge
  form posts to a Google Form — wiring constants (`GOOGLE_FORM_ACTION`,
  `GOOGLE_FORM_EMAIL_FIELD`) are at the top of that script and are currently placeholders;
  until set, the form just shows the local success state.

- **`src/pages/clock.astro`** — the full-screen live clock (route `/clock`). Same `smear.js`
  engine, different presentation (divergence / clock rate / hour length readouts, day-or-night
  progress bar, "Use my location" toggle).

- **`src/layouts/Base.astro`** — owns `<html>`/`<head>`, font loading, and the `<body class>`.
  Pages pass `title`, `description`, and a `bodyClass`.

- **`src/components/ClockMark.astro`** — the clock-face emblem, parameterized by `size` and
  `primary` colour (ink in the homepage header, gold on the clock page). The motion-blur trail
  is always dawn-orange.

### Styling conventions (important — easy to get wrong)

- Design tokens (CSS custom properties), reset, `::selection`, `.wrap`, and the reduced-motion
  rule live in **`src/styles/global.css`**, imported once by `Base.astro`.
- **Per-page `<body>` theming must go in a `<style is:global>` block** on the page. Astro's
  scoped `<style>` cannot reach the `<body>` element because it's rendered by the layout, not
  the page. This is why each page has both a global block (body background/grain) and a scoped
  block (everything else). `bodyClass` (`page-home` / `page-clock`) keys these global rules.
- To style an SVG that lives inside the `ClockMark` child component from a parent page, use
  `:global(svg)` inside the parent's scoped style (e.g. `.brand :global(svg)`) — scoped
  selectors don't cross component boundaries.

## Notes

- Internal links use Astro routes (`/`, `/clock`), not `.html` paths.
- `.claude/settings.local.json` is local permission state; don't commit it.
