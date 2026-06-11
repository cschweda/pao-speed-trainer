# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [2.1.0] — 2026-06-10

### Changed

- **Reveal shows the whole triplet** — the card back on single-card (card → image) reveals now
  renders all three facets — PERSON / ACTION / OBJECT — with the asked facet accented, instead of
  the asked facet alone. Reverse and fusion reveals are unchanged: reverse's answer is the card
  face itself, and fusion's three backs each show exactly their slot in the scene.

### Fixed

- **Suit chips select what you click** — from the full deck, clicking a suit now drills *that*
  suit. Previously the chips were pure toggles over an all-on default, so clicking ♦ *removed*
  diamonds and dealt hearts/spades/clubs. From a subset, clicks still add/remove suits so
  multi-suit blends stay reachable; deselecting the last suit returns to the full deck.
- **Filter changes apply to the card on screen** — if the prompt no longer matches the suit
  filter (e.g. a club showing when you just picked diamonds), it is re-dealt immediately instead
  of lingering until graded.

## [2.0.0] — 2026-06-09

The trainer grows from a single-card reflex drill into the full PAO-for-cards pipeline:
encode → drill (three directions) → fuse → full-deck runs → magic stacks.

### Added

- **Triplet fusion drill** — three cards, one scene (person of the 1st + action of the 2nd +
  object of the 3rd), the actual operation used on a real deck. Slots are sampled toward weak
  cards; pace target is the p75 of your last 8 fusions.
- **Reverse drills (image → card)** — person/action/object text shown, name the card. Scheduled
  as its own Leitner track per pair, separate from forward progress.
- **Deck Run view** — memorize a full 52-card deck in 18 self-paced groups (timed from first
  paint to last keypress, per-group splits), then rebuild the order from a suit-organized card
  bank. Results: score, memorize/recall times, per-card pace, first error, every broken position,
  slowest groups. Runs persist with history.
- **Magic stacks** — deck runs can deal a random shuffle (default), **Mnemonica**, **Aronson**,
  **Si Stebbins** (generated: A♣, +3, CHaSeD), or a **custom pasted 52-card order** (validated,
  persisted). Runs are tagged with their order in results and history.
- **Stack quiz** — position → card and card → position prompts on the selected stack, with
  neighbor cards shown on reveal.
- **Encode linter** — live detection of image collisions across cards per facet (normalized, so
  "a headband" ≡ "headband"), with input highlighting and a summary panel.
- **Flag for re-encode** — press **F** mid-drill; flagged cards float to the top of Encode with
  an unflag chip.
- **Undo last grade** — press **U**; deletes the attempt and restores the pair's exact prior
  scheduling state.
- **Session targets & summary** — sessions can auto-end at 25/50/100 reps or 5/10/15 minutes and
  finish with a summary panel (accuracy, percentiles, promotions, slowest items, drill again).
- **Multi-suit filter** — suit chips replace the single-suit dropdown; the guide's two-suit
  phase (♥+♦) launches directly.
- **Backup / restore / print** — full JSON export and import (encodings, scheduling, history,
  deck runs, flags) and a print-friendly PAO reference sheet.
- **Dashboard upgrades** — suit + recency filters; slowest pairs computed over each pair's last
  8 reps with a one-click **▶ Drill these** custom session; Leitner bucket distribution with
  due-now counts (forward and reverse); per-suit "is it done?" table; daily streaks with a
  14-day strip; reverse and fusion latency rows kept separate from the forward trend; deck-run
  bests.
- **start-dev-server.sh** — frees the dev port, clears Astro/Vite caches, starts fresh.

### Changed

- **Scheduler** — Leitner buckets now carry due intervals (1/3/7/21 days); not-yet-due pairs
  rest at near-zero pick weight; the last 4 items never repeat back-to-back; an "instant" within
  2 minutes of the same pair's previous rep no longer advances the promotion streak; an INSTANT
  slower than your own established target is scheduled as SLOW.
- **GenX seed de-duplicated** — image collisions violate PAO's uniqueness rule, so: ALF devours
  a cat, Conan broods on a throne, Rambo carries a bandolier, Annie Lennox pounds a table,
  She-Ra rides a winged horse, Lion-O roars a battle cry.
- Editing a facet in Encode resets that pair's schedule in both directions — a new image is a
  new memory.
- IndexedDB schema v2 (adds `deckruns`); existing v1 data carries over unchanged.

### Fixed

- Leaving the Drill or Deck view now ends the live session — the global Space/1·2·3 handler can
  no longer grade an invisible card or swallow spaces typed into Encode inputs.
- Re-encoded facets no longer inherit the old image's graduated scheduling state.

## [1.0.0] — 2026-06-04

- Initial release: Astro 6 + Tailwind v4 + Alpine port of the single-file prototype — Drill,
  Encode, Progress, and Start Here views; IndexedDB persistence; honest render→keypress latency
  measurement; Leitner-weighted rep picking; Netlify deploy config.
