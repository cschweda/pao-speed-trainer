# PAO Speed Trainer

A speed-drilling trainer for the **Person–Action–Object (PAO)** card-memory system. Map all 52
playing cards to a Person, an Action, and an Object, then drill them under time pressure until the
triplet fires as a single reflex. Honest, render-to-keypress latency tracking shows the curve bend
down as your encoding reflex builds.

## How it works

The deck is split by suit into four categories — **Hearts** (musicians), **Spades** (action heroes),
**Diamonds** (TV/movie), **Clubs** (cartoons/toys) — and the app has four views:

- **Drill** — a card is shown and one facet is asked (Person / Action / Object). Recall it silently,
  press **Space** to reveal, then grade **1** (instant) · **2** (got it, slow) · **3** (missed). A
  Leitner spaced-repetition system weights which card/facet comes up next. Latency is measured from
  the prompt's paint to your reveal keypress only.
- **Encode** — edit the Person/Action/Object for every card. Ships with a GenX starter set you can
  freely overwrite; your own images always beat a preset.
- **Progress** — median / p75 / p90 latency, accuracy, a per-session trend chart, your slowest
  card·facet pairs, and per-facet stats.
- **Start Here** — a guided pathway (one suit at a time, Person → Action → Object → Mixed) with
  one-click launch buttons that preset and start the right drill.

## Tech stack

- [Astro](https://astro.build/) — static site, single page
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first styling via `@tailwindcss/vite`, with
  the design tokens defined in a `@theme` block
- [Alpine.js](https://alpinejs.dev/) — reactive shell (view switching, the Encode grid, the
  dashboard, toasts)
- **IndexedDB** — local persistence for your encodings and drill history

The timing-critical drill loop (the latency clock and keypress capture) is deliberately kept as
plain JavaScript with no framework indirection, so measured times stay honest.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:4321)
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  pages/index.astro      # page shell — composes the header, four views, and toast
  components/            # Header, DrillView, BuilderView, DashView, GuideView, Toast
  lib/                   # data, db (IndexedDB), svg, stats, drill engine, dashboard compute
  entrypoint.ts          # Alpine stores/components, boot sequence, wiring
  styles/global.css      # Tailwind import, @theme tokens, small component-CSS layer
docs/                    # original single-file prototype + design/plan specs
```

## Your data stays local

Everything — your encodings and your drill history — lives in your browser's **IndexedDB**. Nothing
is uploaded or sent anywhere. Clearing your browser data for this site resets the trainer.

## License

[MIT](./LICENSE) © 2026 cschweda
