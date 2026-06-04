# PAO Speed Trainer Astro Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `docs/pao-speed-trainer.html` to an Astro + Tailwind v4 + Alpine app with identical layout and behavior.

**Architecture:** Hybrid. `src/lib/db.ts` owns canonical in-memory `CARDS`/`LEITNER` + IndexedDB I/O. The timing-critical drill engine (`src/lib/drill.ts`) stays vanilla and keeps the double-rAF clock + first-line keydown latency capture untouched. Alpine (via `@astrojs/alpinejs` entrypoint) drives the reactive shell: nav/view switching, the builder grid, the dashboard, and toasts. The original file stays at `docs/pao-speed-trainer.html` as the line-referenced source of truth for verbatim ports.

**Tech Stack:** Astro 5, Tailwind CSS v4 (`@tailwindcss/vite`, `@theme`), Alpine 3, TypeScript-lite, IndexedDB.

**Var-rename rule (applies to every JS-injected SVG/HTML string):** the original references raw CSS vars (`var(--disp)`, `var(--mono)`, `var(--body)`, `var(--card-red)`, `var(--card-black)`, `var(--dim)`, `var(--accent2)`, …). Tailwind v4 `@theme` emits them as `--font-disp`, `--font-mono`, `--font-body`, `--color-cardred`, `--color-cardblack`, `--color-dim`, `--color-accent2`, … Update every `var(--x)` in ported strings to the emitted name. Hard-coded hex values in the original (card back, trend chart, legend) stay as-is.

---

### Task 1: Scaffold project, deps, repo files

**Files:** Create `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `LICENSE`, `README.md`, `src/pages/index.astro` (temporary placeholder).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pao-speed-trainer",
  "type": "module",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  }
}
```

- [ ] **Step 2: Install dependencies** (writes exact versions into package.json)

Run: `npm install astro @astrojs/alpinejs alpinejs` then `npm install -D @tailwindcss/vite tailwindcss @types/alpinejs`
Expected: `node_modules/` created, deps added.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [alpinejs({ entrypoint: '/src/entrypoint' })],
  vite: { plugins: [tailwindcss()] },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.astro/
.env
.env.*
!.env.example
npm-debug.log*
.DS_Store
```

- [ ] **Step 6: Create `LICENSE`** — standard MIT text, `Copyright (c) 2026 cschweda`.

- [ ] **Step 7: Create `README.md`** — sections: title + one-line description; "How it works" (PAO mnemonic, 4 views); Stack (Astro/Tailwind v4/Alpine, IndexedDB); Getting started (`npm install`, `npm run dev`, `npm run build`, `npm run preview`); Project structure tree; "Your data stays local — everything is in your browser's IndexedDB; nothing is sent anywhere"; License (MIT).

- [ ] **Step 8: Create temporary `src/pages/index.astro`** with `<h1>PAO Speed Trainer</h1>` so the dev server has a route.

- [ ] **Step 9: Verify dev server boots**

Run: `npm run build`
Expected: build succeeds, emits `dist/index.html`.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold Astro + Tailwind v4 + Alpine project"
```

---

### Task 2: Global styles — `@theme` tokens + component CSS layer

**Files:** Create `src/styles/global.css`.

- [ ] **Step 1: Write `src/styles/global.css`**

```css
@import "tailwindcss";

@theme {
  --color-bg: #0e0f13;
  --color-surface: #181a21;
  --color-surface2: #21242e;
  --color-line: #2c3040;
  --color-ink: #f4f5f7;
  --color-muted: #9aa0ad;
  --color-dim: #6b7280;
  --color-accent: #ffb000;
  --color-accent2: #39d98a;
  --color-red: #e0414b;
  --color-slow: #f5a623;
  --color-miss: #e0414b;
  --color-instant: #39d98a;
  --color-cardred: #d11f2d;
  --color-cardblack: #15171c;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-disp: 'Archivo Black', 'Arial Black', sans-serif;
  --font-body: 'Inter', -apple-system, system-ui, sans-serif;
}

/* Google Fonts (kept from original) */
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');

html, body { height: 100%; }
body {
  background:
    radial-gradient(circle at 20% -10%, rgba(255,176,0,.06), transparent 40%),
    radial-gradient(circle at 90% 110%, rgba(57,217,138,.05), transparent 40%),
    var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
  overflow-x: hidden;
}

/* View show/hide + fade — kept as CSS so the original animation is identical */
.view { display: none; }
.view.active { display: block; animation: fade .3s ease; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* 3D card flip */
.cardbox { perspective: 1200px; }
.flip { transition: transform .42s cubic-bezier(.2,.8,.3,1); transform-style: preserve-3d; position: relative; }
.flip.flipped { transform: rotateY(180deg); }
.face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.face.back { position: absolute; inset: 0; transform: rotateY(180deg); }
.card-svg { display: block; width: 100%; height: auto; }

/* Guide list marker colors */
.g-list-ul li::marker { color: var(--color-accent2); }
.g-list-ol li::marker { color: var(--color-accent); font-family: var(--font-mono); font-weight: 600; }

/* Dashboard slowest-bar cell */
.bar-cell { position: relative; }
.bar-cell .b { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 60%; background: rgba(224,65,75,.25); border-radius: 4px; }
.bar-cell span { position: relative; }

/* Toast */
.toast { opacity: 0; transition: .25s; pointer-events: none; }
.toast.show { opacity: 1; }
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "style: add Tailwind v4 theme tokens and component CSS layer"
```

---

### Task 3: Data, stats, and SVG modules

**Files:** Create `src/lib/data.ts`, `src/lib/stats.ts`, `src/lib/svg.ts`.

- [ ] **Step 1: `src/lib/data.ts`** — copy `SUITS`, `RANKS`, `SUIT_META`, `FACETS`, `FACET_LABEL`, `SEED`, `cardId`, `allCards` verbatim from original lines 380–399, prefixing each top-level declaration with `export`. Add types:

```ts
export type Suit = 'H' | 'S' | 'D' | 'C';
export type Facet = 'person' | 'action' | 'object';
export interface Card { suit: Suit; rank: string; id: string; }
```

- [ ] **Step 2: `src/lib/stats.ts`** — port `quantile` from original line 460:

```ts
export function quantile(arr: number[], q: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const b = Math.floor(pos);
  const rest = pos - b;
  return s[b + 1] !== undefined ? s[b] + rest * (s[b + 1] - s[b]) : s[b];
}
```

- [ ] **Step 3: `src/lib/svg.ts`** — port `cardSVG`, `cardBackSVG` (original lines 432–457) and `esc` (line 495). Apply the var-rename rule: in `cardSVG`, `col = m.color==='red' ? 'var(--color-cardred)' : 'var(--color-cardblack)'` and `font-family="var(--font-disp)"`; in `cardBackSVG`, the foreignObject inline styles use `var(--font-disp)` / `var(--font-mono)` (hex colors stay). `esc`:

```ts
export function esc(s: string): string {
  return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx astro check` (or `npm run build`)
Expected: no type errors from these modules.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port data, stats, and SVG card modules"
```

---

### Task 4: Persistence module — `src/lib/db.ts`

**Files:** Create `src/lib/db.ts`.

- [ ] **Step 1: Port the IndexedDB wrapper + state.** From original lines 401–429 (the `DB` object, `CARDS`, `LEITNER`, `KEY`, `loadCards`, `saveCard`, `saveLeitner`) plus `assignedCount` (line 473), `applySeed` (lines 722–724), and a `clearAll` helper (the body of the clear handler, lines 503–505). Keep the IndexedDB schema byte-identical (name `pao-speed`, version 1, stores/indexes as in original lines 403–407). Export: `DB`, `CARDS`, `LEITNER`, `KEY`, `loadCards`, `saveCard`, `saveLeitner`, `assignedCount`, `applySeed`, `clearAll`. Import `SEED`, `SUITS`, `RANKS`, `cardId`, `allCards` from `./data`.

```ts
export async function clearAll(): Promise<void> {
  for (const id in CARDS) { CARDS[id].person = CARDS[id].action = CARDS[id].object = ''; await saveCard(id); }
}
export function assignedCount(): number {
  let n = 0;
  for (const id in CARDS) { const c = CARDS[id]; if (c.person && c.action && c.object) n++; }
  return n;
}
```

- [ ] **Step 2: Verify typecheck.** Run: `npm run build` — Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: port IndexedDB persistence and deck state"
```

---

### Task 5: App shell — index, header, toast, Alpine stores, boot

**Files:** Create `src/components/Header.astro`, `src/components/Toast.astro`, `src/entrypoint.ts`; rewrite `src/pages/index.astro`.

- [ ] **Step 1: `src/components/Header.astro`** — port `<header>` (original lines 167–175). Sticky bar (`sticky top-0 z-50` + blur + bottom border via utilities), logo (`font-disp`, the `·` separator in `text-accent`), and nav. Each nav button:

```astro
<button @click="$store.ui.view='drill'"
  :class="$store.ui.view==='drill' ? 'text-bg bg-accent font-semibold' : 'text-muted hover:text-ink hover:bg-surface'"
  class="font-mono text-[13px] px-3.5 py-2 rounded-lg border border-transparent transition cursor-pointer">DRILL</button>
```
Repeat for ENCODE→`builder`, PROGRESS→`dash`, START HERE→`guide`.

- [ ] **Step 2: `src/components/Toast.astro`**

```astro
<div class="toast fixed bottom-5 left-1/2 -translate-x-1/2 bg-surface2 border border-line text-ink font-mono text-[13px] px-[18px] py-2.5 rounded-[10px] z-[100]"
  :class="{ 'show': $store.toast.visible }" x-text="$store.toast.msg" x-data></div>
```

- [ ] **Step 3: `src/pages/index.astro`** — import `../styles/global.css`; render `<Header />`, a `<div class="wrap">` (`max-w-[1100px] mx-auto px-4 pb-20`) containing the four `<section class="view">` components, then `<Toast />`. Set `class="active"` is NOT hard-coded; instead bind: `<section class="view" :class="{ active: $store.ui.view==='drill' }" id="view-drill">`. Default view is `drill` (set in store). Page `<head>` keeps `<title>PAO Speed Trainer</title>` and the viewport meta from original line 5.

- [ ] **Step 4: `src/entrypoint.ts` — stores + boot skeleton**

```ts
import type { Alpine } from 'alpinejs';
import { DB, loadCards, applySeed, assignedCount } from './lib/db';

export default (Alpine: Alpine) => {
  Alpine.store('ui', { view: 'drill' as 'drill' | 'builder' | 'dash' | 'guide' });
  Alpine.store('toast', {
    visible: false, msg: '', _t: 0 as unknown as ReturnType<typeof setTimeout>,
    show(msg: string) { this.msg = msg; this.visible = true; clearTimeout(this._t);
      this._t = setTimeout(() => (this.visible = false), 2200); },
  });
  Alpine.store('deck', {
    ready: false, assigned: 0,
    refresh() { this.assigned = assignedCount(); },
    get assignText() { return this.assigned < 52 ? `${52 - this.assigned} cards unassigned` : 'all 52 assigned ✓'; },
  });

  // boot (DOM is parsed; stores are registered)
  (async () => {
    await DB.open();
    await loadCards();
    const seededFlag = await DB.get('meta', 'seeded');
    if (assignedCount() === 0 && !seededFlag) {
      await applySeed();
      await DB.put('meta', { k: 'seeded', v: true });
      (Alpine.store('toast') as any).show('Loaded GenX defaults — edit any in the Encode tab');
    }
    (Alpine.store('deck') as any).ready = true;
    (Alpine.store('deck') as any).refresh();
  })();
};
```

(`showToast` for vanilla callers: export a helper `export const showToast = (m: string) => (window as any).Alpine.store('toast').show(m);` — add once Alpine is global.)

- [ ] **Step 5: Verify nav switches views.** Run `npm run dev`; load page; click each nav button; confirm only the matching section shows and the fade animation plays. (Sections may be near-empty placeholders at this point — that's fine.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: app shell, Alpine stores, header/toast, boot sequence"
```

---

### Task 6: Drill view + vanilla drill engine

**Files:** Create `src/components/DrillView.astro`, `src/lib/drill.ts`; wire `drill.init()` into `src/entrypoint.ts`.

- [ ] **Step 1: `src/components/DrillView.astro`** — port `#view-drill` markup (original lines 178–216). Convert static classes to utilities, but **keep every `id`** the engine uses: `mode`, `suitFilter`, `startBtn`, `endBtn`, `assignWarn`, `drillStage`, `facetAsk`, `flip`, `cardFront`, `cardBack`, `deadbar`, `targetLabel`, `revealPanel`, `hint`, `gradebar`, `latReadout`, `sessionbar`. Keep classes the engine toggles/needs: `flip`, `face`, `front`, `back`, `cardbox`. `drillStage` keeps inline `style="display:none"`. The `assignWarn` pill binds `x-text="$store.deck.assignText"` (replaces the imperative text set). Gradebar buttons keep `data-g` and the `g1/g2/g3` accent borders (as utility classes or arbitrary values).

- [ ] **Step 2: `src/lib/drill.ts`** — port the drill engine (original lines 508–671): module state (`session`, `cur`, `clockStart`, element refs), `eligibleCards`, `facetsForMode`, `p75For`, `bucketOf`, `pickRep`, `nextRep`, `reveal`, `grade`, `updateSessionbar`, `clearAnim`, `startSession`, `endSession`, the keydown listener, and the flip-tap listener. Adaptations:
  - Wrap element grabbing + listener attachment + button wiring in an exported `init()` (called after DOM ready). `export function start()` = `startSession`; `export function end()` = `endSession`.
  - Import `CARDS`, `LEITNER`, `KEY`, `DB`, `saveLeitner` from `./db`; `quantile` from `./stats`; `cardSVG`, `cardBackSVG`, `esc` from `./svg`; `SUIT_META`, `FACETS`, `FACET_LABEL`, `allCards` from `./data`; `showToast` from the entrypoint helper (or `Alpine.store('toast').show`).
  - After any card mutation path that changes assignment counts: none here (drill doesn't edit cards), so no deck.refresh needed.
  - Apply the var-rename rule inside `reveal`/`updateSessionbar` injected HTML (`.reveal-answer`→`font-disp text-[30px] leading-[1.1]`, `.reveal-context`→`font-mono text-[12px] text-muted mt-1.5`, latReadout `<b>`→`text-accent2`, sessionbar spans→`text-instant`/`text-slow`/`text-miss` and `<b>`→`text-ink`).
  - **DO NOT TOUCH** the latency path: keep `cur._lat = performance.now() - clockStart;` as the literal first line inside the Space branch (original lines 657 & 670), and keep the double-`requestAnimationFrame` clock start (original lines 568–573) exactly.
  - `endSession` toast uses `showToast(...)`.

- [ ] **Step 3: Wire init in `src/entrypoint.ts`** — import `* as drill from './lib/drill'`; at the end of the boot IIFE (after deck.ready), call `drill.init()`. Bind the gradebar/start/end inside `drill.init()` (engine owns them). The Start button calls `drill.start()`, End calls `drill.end()`.

- [ ] **Step 4: Verify a drill works.** `npm run dev`: Start session → a card shows, facet asked, deadbar animates; press Space → flips, reveal + answer shown, gradebar appears, latency readout shows ms; press 1/2/3 → tally updates, auto-advances after ~260ms. Tap card (instead of Space) also reveals. End hides the stage.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port drill view and vanilla timing engine"
```

---

### Task 7: Builder (Encode) view

**Files:** Create `src/components/BuilderView.astro`; add `builder` Alpine data component to `src/entrypoint.ts`.

- [ ] **Step 1: `src/components/BuilderView.astro`** — port `#view-builder` (original lines 219–236). Static suit legend + note + completion bar converted to utilities. The completion meter fill binds `:style="\`width:\${$store.deck.assigned/52*100}%\`"`; the text binds `x-text="\`\${$store.deck.assigned}/52\`"`. Seed button `@click="seed()"`, clear button `@click="clear()"`. The grid uses `x-data="builder()"` with `<template x-for="card in cards" :key="card.id">` rendering each edit card:
  - mini SVG: `<div class="..." x-html="mini(card)"></div>`
  - three inputs bound `x-model="card.person"` / `action` / `object` with `@change="save(card,'person')"` etc.
  - `:class="{ 'done-border': card.person && card.action && card.object }"` on the card wrapper (done border = `border-accent2/40`).

- [ ] **Step 2: `builder()` component in `src/entrypoint.ts`**

```ts
import { CARDS, saveCard, applySeed, clearAll, assignedCount } from './lib/db';
import { SUITS, RANKS, cardId } from './lib/data';
import { cardSVG } from './lib/svg';

Alpine.data('builder', () => ({
  cards: [] as any[],
  init() {
    const build = () => {
      this.cards = [];
      for (const s of SUITS) for (const r of RANKS) {
        const c = CARDS[cardId(s, r)];
        this.cards.push({ id: c.id, suit: s, rank: r, person: c.person, action: c.action, object: c.object });
      }
    };
    if ((Alpine.store('deck') as any).ready) build();
    this.$watch('$store.deck.ready', (v: boolean) => { if (v) build(); });
    this._build = build;
  },
  _build: null as any,
  mini(card: any) { return cardSVG(card.suit, card.rank, { mini: true }); },
  async save(card: any, f: 'person' | 'action' | 'object') {
    CARDS[card.id][f] = (card[f] || '').trim(); card[f] = CARDS[card.id][f];
    await saveCard(card.id);
    (Alpine.store('deck') as any).refresh();
  },
  async seed() {
    if (assignedCount() > 0 && !confirm('Reset all 52 cards to the GenX defaults? This overwrites your current edits.')) return;
    await applySeed(); this._build(); (Alpine.store('deck') as any).refresh();
    (Alpine.store('toast') as any).show('GenX defaults loaded — edit freely');
  },
  async clear() {
    if (!confirm('Clear all P/A/O assignments? Your drill history is kept.')) return;
    await clearAll(); this._build(); (Alpine.store('deck') as any).refresh();
    (Alpine.store('toast') as any).show('Cleared');
  },
}));
```

- [ ] **Step 2b:** Update the empty-input persistence to match original (it stored `.trim()` and could be empty) — covered by `save` above.

- [ ] **Step 3: Verify builder.** Edit a card's P/A/O → completion count + drill `assignWarn` update; reload page → edit persists (IndexedDB). "Reset to GenX defaults" repopulates; "Clear all" empties (with confirm). Done-border appears when all three fields filled.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: port Encode builder view with Alpine reactive grid"
```

---

### Task 8: Dashboard (Progress) view

**Files:** Create `src/components/DashView.astro`, `src/lib/dash.ts`; add `dash` Alpine data component to `src/entrypoint.ts`.

- [ ] **Step 1: `src/lib/dash.ts`** — port `renderDash` compute logic + `drawTrend` (original lines 673–716) into pure functions that **return HTML strings / data** rather than writing to fixed elements:
  - `computeDash(all: Attempt[])` returns `{ statCardsHTML, slowListHTML, facetStatsHTML, trendSVG }` (or `null`/empty markers when no data). Reuse the original string templates, applying the var-rename rule (`var(--dim)`→`var(--color-dim)`, etc.) and converting reused class names to utilities inline.
  - `drawTrend(pts)` returns the SVG inner markup string (original lines 709–716; the no-data and <2-session messages preserved).
  - Import `quantile` from `./stats`; `CARDS`, `DB` from `./db`; `SUIT_META`, `FACETS`, `FACET_LABEL` from `./data`; `esc` from `./svg`.

- [ ] **Step 2: `src/components/DashView.astro`** — port `#view-dash` (original lines 239–247). Static `<h2>`/`.sub` and the panel shells converted to utilities. Bind dynamic regions with `x-data="dash()"`:
  - `<div class="statgrid ..." x-html="statCards"></div>`
  - trend `<svg ...>` → `<div x-html="trend"></div>` wrapping the `<svg class="trend">` (keep `viewBox="0 0 600 160" preserveAspectRatio="none"`), or bind `x-html="trend"` on the inner of a kept `<svg>`. Keep the legend markup (hex swatches) static.
  - slowest `<div x-html="slowList"></div>`, per-facet `<div x-html="facetStats"></div>`.

- [ ] **Step 3: `dash()` component in `src/entrypoint.ts`**

```ts
import { computeDash } from './lib/dash';
Alpine.data('dash', () => ({
  statCards: '', trend: '', slowList: '', facetStats: '',
  init() {
    const load = async () => {
      const all = await DB.getAll('attempts');
      const r = computeDash(all);
      this.statCards = r.statCardsHTML; this.trend = r.trendSVG;
      this.slowList = r.slowListHTML; this.facetStats = r.facetStatsHTML;
    };
    this.$watch('$store.ui.view', (v: string) => { if (v === 'dash') load(); });
    if ((Alpine.store('ui') as any).view === 'dash') load();
  },
}));
```

- [ ] **Step 4: Verify dashboard.** With ≥1 drill rep: stat cards (total reps, median, p75, p90, accuracy) show; with ≥2 reps per (card,facet) the slowest table populates with the latency bars; per-facet table shows; with ≥2 sessions the trend draws three lines (median/p75/p90), else the "Need ≥2 sessions" message. Empty state shows when no reps.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port Progress dashboard view"
```

---

### Task 9: Guide (Start Here) view + launch bridge

**Files:** Create `src/components/GuideView.astro`; add the `data-go` bridge wiring to `src/lib/drill.ts` init (or entrypoint).

- [ ] **Step 1: `src/components/GuideView.astro`** — port `#view-guide` (original lines 250–371) verbatim in structure, converting classes to utilities. Guide cards (`.g-card`, `.g-tldr`, `.g-rules`, `.g-cta`, `.g-path`, phases, drills, chips) become utility-classed elements; the `::marker` lists get class `g-list-ul` / `g-list-ol` (defined in global.css). Keep every `data-go` / `data-suit` / `data-mode` / `data-autostart` attribute and the ids `guideEncodeBtn`, `guideDashBtn`, `pathDashBtn`.

- [ ] **Step 2: Bridge wiring** (in `drill.init()` or entrypoint, after DOM ready). Replaces original lines 638–650:

```ts
function goToDrill(suit: string, mode: string, autostart: boolean) {
  const modeEl = document.getElementById('mode') as HTMLSelectElement;
  const suitEl = document.getElementById('suitFilter') as HTMLSelectElement;
  if (mode) modeEl.value = mode;
  if (suit) suitEl.value = suit;
  (window as any).Alpine.store('ui').view = 'drill';
  if (autostart) { if (session) end(); start(); }
}
document.querySelectorAll('[data-go]').forEach((btn) => {
  const el = btn as HTMLElement;
  el.onclick = () => goToDrill(el.dataset.suit || 'all', el.dataset.mode || 'mixed', el.dataset.autostart === '1');
});
document.getElementById('guideEncodeBtn')!.onclick = () => ((window as any).Alpine.store('ui').view = 'builder');
document.getElementById('guideDashBtn')!.onclick = () => ((window as any).Alpine.store('ui').view = 'dash');
document.getElementById('pathDashBtn')!.onclick = () => ((window as any).Alpine.store('ui').view = 'dash');
```

- [ ] **Step 3: Verify guide.** Each `▶` chip/button switches to Drill, presets the suit+mode selects, and (when `data-autostart="1"`) starts a session. "Open Encode" → builder; "Dashboard"/"See your progress" → dash. The "custom session" chip (`data-autostart="0"`) switches to Drill without starting.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: port Start Here guide and launch bridge"
```

---

### Task 10: Full build + parity verification + screenshots

- [ ] **Step 1: Production build.** Run: `npm run build` — Expected: success, `dist/index.html` + bundled JS emitted, no type errors.

- [ ] **Step 2: Preview + full parity pass.** Run `npm run preview`; walk the §7 verification checklist from the spec end-to-end against the original's behavior. Use the `viewcap` MCP for screenshots of each of the 4 views and a mid-drill reveal state.

- [ ] **Step 3: Confirm IndexedDB compatibility.** In devtools, confirm DB `pao-speed` v1 with stores `cards`/`attempts`/`meta` and indexes `byCardFacet`/`bySession`.

- [ ] **Step 4: Final commit.**

```bash
git add -A && git commit -m "test: verify full parity build of PAO Speed Trainer"
```

---

## Self-Review

**Spec coverage:** §1 fidelity (latency path → Task 6 Step 2 "DO NOT TOUCH"; IndexedDB schema → Task 4; Leitner/pick/deadline/quantile/SVG/seed → Tasks 3–6). §2 stack → Task 1–2. §3 structure → all tasks create the listed files. §4 hybrid boundary → Tasks 5–9 (db canonical, drill vanilla, Alpine shell, bridge). §5 Tailwind policy → Task 2 + per-view conversions + var-rename rule. §6 scaffolding → Task 1. §7 verification → Task 10. §8 YAGNI → no tasks add features.

**Placeholder scan:** No "TBD"/"handle edge cases". Verbatim ports are pinned to exact original line ranges with the original file present in-repo; adaptations are shown as code.

**Type consistency:** `drill.start()`/`drill.end()`/`drill.init()` used consistently (Tasks 6, 9). `Alpine.store('deck').refresh()`/`.ready`/`.assigned`/`.assignText`, `store('ui').view`, `store('toast').show()` consistent across Tasks 5–9. `computeDash` return keys (`statCardsHTML`, `slowListHTML`, `facetStatsHTML`, `trendSVG`) match consumption in the `dash()` component.
