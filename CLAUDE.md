# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A parody campaign site for "Daylight Smearings Time" — a fictional civic proposal (from the
"Institute for Temporal Continuity") to spread the annual one-hour daylight-saving change
across 14 days instead of applying it instantly. The humor depends entirely on a **deadpan,
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

- **`src/scripts/smear.js`** is the conceptual core and the only place the smear model lives.
  It's a plain ES module (exports functions + constants). Both pages import from it; Astro
  bundles it into one shared client chunk. The model: the one-hour change is applied **linearly
  over the 14 days ending at the legacy US transition instant** (2nd Sunday of March / 1st
  Sunday of November, 02:00 local). Smeared and civil time therefore re-converge exactly at the
  moment unsmeared clocks jump. `smearState(now)` returns `{ active, frac, divergenceMs, next }`;
  `smearedNow()` wraps it with the current `Date`. If you touch timekeeping, this file is the
  single source of truth — the pages only render its output.

- **`src/pages/index.astro`** — the campaign page (route `/`). Its inline module `<script>`
  drives three live things by element id: the masthead clock, and (via `renderNextShift()`) the
  §02 prose dates **and** the SVG comparison chart, which is rewritten to match the *direction*
  of the next transition (spring ramps up, fall ramps down). The pledge form posts to a Google
  Form — wiring constants (`GOOGLE_FORM_ACTION`, `GOOGLE_FORM_EMAIL_FIELD`) are at the top of
  that script and are currently placeholders; until set, the form just shows the local success
  state.

- **`src/pages/clock.astro`** — the full-screen live clock (route `/clock`). Same `smear.js`
  engine, different presentation (instrument panel, divergence/rate/progress readouts).

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
