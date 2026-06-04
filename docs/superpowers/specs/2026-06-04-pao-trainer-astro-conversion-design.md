# PAO Speed Trainer → Astro / Tailwind v4 / Alpine — Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Source:** `docs/pao-speed-trainer.html` (single-file vanilla app, 736 lines)

## 1. Goal & fidelity constraints

Faithful 1:1 port of the single-page app to Astro + Tailwind v4 + Alpine. Same layout, same
behavior, same keyboard/tap controls. No new features, no behavior changes.

Explicitly preserved:

- **Honest-latency measurement.** Stays plain JS, untouched in semantics: the clock starts via a
  double `requestAnimationFrame` after the prompt card's confirmed paint, and `performance.now()`
  is captured as the **first line** of the keydown handler (before any DOM work). No reactivity in
  that path — this is why the original chose "no framework indirection," and the port keeps it.
- **IndexedDB schema identical.** DB name `pao-speed`, version `1`, object stores `cards`
  (keyPath `id`), `attempts` (keyPath `aid`, autoIncrement; indexes `byCardFacet` on
  `['card','facet']` and `bySession` on `session`), and `meta` (keyPath `k`). Existing users keep
  their data and the `seeded` flag after the port.
- Leitner bucketing (buckets 1–5, streak rules), weighted rep picking, deadline math
  (`min(6000, max(400, p75*0.9))` or 6000 while calibrating), quantile stats, SVG cards + 3D flip,
  per-session trend chart, toasts, the GenX seed set, and the auto-seed-on-first-launch behavior.

## 2. Stack

- **Astro** 5.x, static output → `dist/`. Project at repo root.
- **Tailwind v4** via `@tailwindcss/vite` + `@import "tailwindcss"` in global CSS. The original
  `:root` tokens become a `@theme` block (colors `--bg`, `--surface`, `--accent`, … and the three
  font stacks `--mono` / `--disp` / `--body`).
- **Alpine** via the official `@astrojs/alpinejs` integration; an entrypoint registers stores and
  data components in `alpine:init`.
- **TypeScript-lite** for `lib/` modules — light typing, falling back to plain JS where types add
  friction rather than safety.
- Toolchain: Node 22, npm 10. Build output `dist/`. Original kept at `docs/pao-speed-trainer.html`.

## 3. Project structure

```
src/
  pages/index.astro          # shell: composes Header + 4 views + Toast; imports global.css
  components/
    Header.astro             # logo + nav (Alpine-bound active state)
    DrillView.astro          # drill stage markup with the ids the engine needs
    BuilderView.astro        # x-for grid of 52 edit cards
    DashView.astro           # stat grid + panels (Alpine-filled)
    GuideView.astro          # static guide + data-go launch buttons
    Toast.astro
  lib/
    data.ts                  # SUITS, RANKS, SUIT_META, FACETS, FACET_LABEL, SEED, cardId, allCards
    db.ts                    # IndexedDB wrapper + canonical CARDS/LEITNER state + load/save/seed/clear/assignedCount
    svg.ts                   # cardSVG, cardBackSVG, esc
    stats.ts                 # quantile
    drill.ts                 # timing-critical drill engine (VANILLA — no Alpine)
    dash.ts                  # dashboard compute + drawTrend
  entrypoint.ts              # Alpine stores/components + boot (DB load) + vanilla wiring
  styles/global.css          # @import "tailwindcss"; @theme tokens; small component-CSS layer
docs/pao-speed-trainer.html  # original, untouched (reference)
docs/superpowers/specs/…     # this spec
package.json · astro.config.mjs · tsconfig.json · .gitignore · LICENSE · README.md
```

## 4. Architecture & boundaries (the hybrid line)

**Single source of truth.** `db.ts` owns in-memory `CARDS` and `LEITNER` (as the original did) plus
all IndexedDB I/O. Both the vanilla engine and Alpine read/write through it — no divergent copies.

- **Vanilla (`drill.ts`)** owns everything inside `#view-drill`'s running stage: clock,
  keydown/Space, grade 1·2·3, tap-to-reveal, `nextRep` / `reveal` / `grade` / `pickRep`,
  start/end, deadbar animation. Grabs elements by id, like the original. The latency hot path
  reads/writes a non-reactive module variable only and reads no Alpine state.
- **Alpine (`entrypoint.ts`)**
  - `$store.ui.view` drives nav active-state and view show/hide (preserving the `fade` animation and
    the `.view` / `.view.active` display toggle).
  - **Builder** — `x-for` over the 52 cards; `x-model` + `@change` writes through `db.ts` and
    persists; completion meter/text derived from `assignedCount()`; seed/clear buttons. Mini card
    SVG via `x-html`.
  - **Dashboard** — on view-open, computes via `dash.ts` and fills stat cards, slowest table, and
    per-facet table (`x-html` for the table/SVG markup strings); trend SVG via `drawTrend`.
  - **Toast** store with a `showToast(msg)` helper that vanilla modules can call.
- **Bridge.** Guide `data-go` buttons and the "open Encode / dashboard" buttons are wired in
  `entrypoint.ts`: they set `$store.ui.view` and (when `data-autostart="1"`) call `drill.start()`,
  replacing the original's `.click()` nav trick. Switching mode/suit sets the `<select>` values the
  engine reads, exactly as before.

### Boot sequence

In `alpine:init`: register stores + data components. After registration (DOM already parsed):
`DB.open()` → `loadCards()` → if nothing assigned and no `seeded` flag, `applySeed()` + set the
flag + toast → update completion/assign-warning derived state → `drill.init()` (grab elements,
attach the window keydown listener, wire start/end + gradebar + flip-tap). A `ready` flag guards
Builder/Dashboard rendering until the deck has loaded.

## 5. Tailwind policy ("utilities first")

- **Tokens →** `@theme` (colors + fonts). Utilities reference them (`bg-bg`, `text-accent`,
  `font-mono`, etc.).
- **Markup →** utility classes for layout / spacing / typography / color.
- **Stays as small component CSS** in `global.css` where utilities are impractical: the `fade`
  keyframe + `.view` / `.view.active` display toggle, the 3D `.flip` / `backface-visibility` card
  flip, `::marker` colors in the guide lists, the `.bar-cell` absolutely-positioned latency bar, and
  the toast opacity transition. JS-injected HTML (reveal panel, session bar, dashboard tables)
  carries utility classes inline. The deadbar's `transition` is set from JS (as today) and stays
  inline regardless.

## 6. Repo deliverables (scaffolding)

- **package.json scripts:** `dev` → `astro dev`, `build` → `astro build`, `preview` →
  `astro preview`, `astro` → `astro`. Dependencies: `astro`, `alpinejs`, `@astrojs/alpinejs`,
  `tailwindcss`, `@tailwindcss/vite` (+ `@types/alpinejs` dev).
- **.gitignore:** `node_modules/`, `dist/`, `.astro/`, `.env*`, `.DS_Store`, npm debug logs.
  `.vscode/` already exists and stays tracked (Astro convention).
- **LICENSE:** MIT, © 2026 cschweda.
- **README.md:** overview, stack, getting-started (`npm install` → `npm run dev` / `build` /
  `preview`), project layout, feature summary, and a "data stays local in IndexedDB, nothing is
  sent anywhere" note.
- **git:** initialized on `main`; one initial commit of the scaffold + port. No `Co-Authored-By` /
  AI trailer on commits (per user global rules).

## 7. Verification plan

Build, then drive the real app: visit all 4 views; run a drill session (reveal + grade, confirm the
latency readout, bucket update, and auto-advance); edit a card in Encode and confirm it persists
across reload (IndexedDB); seed / clear; confirm dashboard stat cards + tables + trend render after
≥2 sessions; test Space / 1·2·3 and tap-to-reveal; confirm the guide launch buttons preset suit+mode
and autostart. Screenshot key states; optional Lighthouse/a11y pass compared against the original.

## 8. Out of scope (YAGNI)

No new features, no routing / multi-page, no behavior changes. No automated test suite beyond manual
parity checks (optional unit tests for `quantile` / `pickRep` only if requested later).
