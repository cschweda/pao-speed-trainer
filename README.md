# PAO Speed Trainer

A complete trainer for the **Person–Action–Object (PAO)** card-memory system. Map all 52 playing
cards to a Person, an Action, and an Object, drill them under time pressure until the triplet fires
as a single reflex, then prove it on full-deck runs. Honest, render-to-keypress latency tracking
shows the curve bend down as your encoding reflex builds.

## How it works

The deck is split by suit into four categories — **Hearts** (musicians), **Spades** (action heroes),
**Diamonds** (TV/movie), **Clubs** (cartoons/toys) — and the app has five views:

- **Drill** — the reflex gym, three kinds of question sharing one honest clock:
  - *Card → image*: a card is shown and one facet is asked (Person / Action / Object, or Mixed).
  - *Image → card (reverse)*: the facet text is shown and you name the card — the decoding skill
    recall depends on, scheduled as its own track.
  - *Triplet fusion*: three cards, one scene — person of the 1st + action of the 2nd + object of the
    3rd. The actual PAO operation used on a real deck.

  Recall silently, press **Space** to reveal — the back shows the card's full P·A·O with the asked
  facet highlighted — and grade **1** (instant) · **2** (got it, slow) · **3** (missed). Suit chips
  filter the pool: click a suit to drill just that suit, click more to blend, **ALL** for the full
  deck. **U** undoes a fat-fingered grade; **F** flags a card for re-encoding. Latency is
  measured from the prompt's paint to your reveal keypress only, and an INSTANT that lands over your
  own p75-derived target is *scheduled* as slow — the clock keeps the grading honest.

  Scheduling is a spaced Leitner system per (card · facet · direction): graduated pairs rest on
  day-scale intervals, immediate repeats are suppressed, and promotions require spacing so
  working-memory echoes don't graduate a card. Sessions can auto-end at a rep or minute target and
  finish with a summary.

- **Deck** — the real test. Memorize a full deck in self-paced groups of three (timed from first
  paint to last keypress, with per-group splits), then rebuild the order from a card bank. You get a
  deck time, score, first-error position, the exact positions that broke, and your slowest groups.
  The order can be a **random shuffle** (the sport) or a **magic stack** — Mnemonica, Aronson,
  Si Stebbins, or any custom 52-card order you paste — so the same engine teaches memorized-deck
  stacks. A **stack quiz** (position ↔ card, with neighbors) welds a stack in once you can run it.

- **Encode** — edit the Person/Action/Object for every card. Ships with a GenX starter set you can
  freely overwrite; your own images always beat a preset. A live linter flags **image collisions**
  (two cards sharing an action/object decode ambiguously mid-deck). Cards flagged from the drill
  float to the top. Editing a facet restarts that pair's schedule — a new image is a new memory.
  **Export/import** a full JSON backup (everything is local), and print a reference sheet.

- **Progress** — median / p75 / p90 latency and per-session trend for the forward reflex, reverse
  and fusion tracked separately, suit and recency filters, slowest card·facet pairs (computed over
  each pair's last 8 reps) with a one-click **▶ Drill these**, Leitner bucket distribution with
  due-now counts, per-suit "is it done?" table, daily streaks, and deck-run bests.

- **Start Here** — a guided pathway (one suit at a time, Person → Action → Object → Mixed, then
  reverse → fusion → deck runs) with one-click launch buttons that preset and start the right drill.

## Tech stack

- [Astro](https://astro.build/) — static site, single page
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first styling via `@tailwindcss/vite`, with
  the design tokens defined in a `@theme` block
- [Alpine.js](https://alpinejs.dev/) — reactive shell (view switching, the Encode grid, the
  dashboard, toasts)
- **IndexedDB** — local persistence for encodings, drill history, scheduling, and deck runs

The timing-critical loops (the drill's latency clock and the deck run's split timer) are deliberately
kept as plain JavaScript with no framework indirection, so measured times stay honest: clocks start
on a double-`requestAnimationFrame` after the prompt paints and stop on the first line of the
keypress handler.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:4321)
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

`./start-dev-server.sh` kills anything on the dev port, clears Astro/Vite caches, and starts fresh.

## Project structure

```
src/
  pages/index.astro      # page shell — composes the header, five views, and toast
  components/            # Header, DrillView, DeckView, BuilderView, DashView, GuideView, Toast
  lib/                   # data, db (IndexedDB), svg, stats, drill engine, deck-run engine,
                         # magic stacks, dashboard compute, backup/restore
  entrypoint.ts          # Alpine stores/components, boot sequence, wiring
  styles/global.css      # Tailwind import, @theme tokens, small component-CSS layer
docs/                    # original single-file prototype + design/plan specs
```

## Your data stays local

Everything — encodings, drill history, scheduling state, deck runs — lives in your browser's
**IndexedDB**. Nothing is uploaded or sent anywhere. Use **Encode → Export backup** for an offsite
copy; clearing your browser data for this site resets the trainer.

## Deploy

The site is a fully static build, so it deploys to any static host. For **Netlify**, the included
[`netlify.toml`](./netlify.toml) and [`.nvmrc`](./.nvmrc) configure everything — connect the repo and
Netlify runs `npm run build` and publishes `dist/` on Node 22. No adapter or server is required.

## License

[MIT](./LICENSE) © 2026 cschweda
