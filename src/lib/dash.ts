/* ====================== DASHBOARD ======================
   Returns HTML strings consumed by the Alpine `dash` component.
   Latency headline + trend cover the forward (card → image) reflex; reverse
   and fusion get their own rows so scales don't pollute each other.
   Slowest-pairs p75 uses each pair's last 8 attempts — same window the drill
   engine races against — so the list shows current state, not week-one ghosts. */
import { quantile } from './stats';
import { CARDS, LEITNER, KEY } from './db';
import type { Attempt, DeckRun } from './db';
import { SUITS, RANKS, SUIT_META, FACETS, FACET_LABEL, cardId, type Suit, type Facet } from './data';
import { esc } from './svg';
import type { PairRef } from './drill';

export interface DashOpts {
  suit: string; // '' = all
  days: number; // 0 = all time
}
export interface DashData {
  empty: boolean;
  statCardsHTML: string;
  trendSVG: string;
  slowListHTML: string;
  facetStatsHTML: string;
  bucketHTML: string;
  habitHTML: string;
  suitTableHTML: string;
  deckHTML: string;
  slowPairs: PairRef[];
}
interface TrendPoint {
  med: number;
  p75: number;
  p90: number;
}

// Shared utility-class sets for the injected tables (kept DRY; Tailwind scans these literals).
const TABLE = 'w-full border-collapse text-[13px]';
const TH = 'text-left px-1.5 py-2 border-b border-line font-mono text-[11px] text-dim uppercase tracking-[.5px]';
const TD = 'text-left px-1.5 py-2 border-b border-line font-mono';
const EMPTY = 'text-dim font-mono text-[13px] text-center p-[30px]';
const STAT = (v: string | number, l: string): string =>
  `<div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${v}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">${l}</div></div>`;

const dirOf = (a: Attempt): string => a.dir || (a.facet === 'triplet' ? 'fusion' : 'fwd');
const ms = (v: number | null): string => (v ? Math.round(v) + 'ms' : '—');

export function computeDash(all: Attempt[], runs: DeckRun[], opts: DashOpts): DashData {
  const now = Date.now();
  let win = all;
  if (opts.days) {
    const cut = now - opts.days * 86400000;
    win = win.filter((a) => a.timestamp >= cut);
  }
  if (opts.suit) win = win.filter((a) => a.facet !== 'triplet' && a.card[0] === opts.suit);

  const fus = win.filter((a) => dirOf(a) === 'fusion');
  const singles = win.filter((a) => dirOf(a) !== 'fusion');
  const fwd = singles.filter((a) => dirOf(a) === 'fwd');
  const rev = singles.filter((a) => dirOf(a) === 'rev');

  const habitHTML = habit(all); // habit + scheduling are global state,
  const bucketHTML = buckets(); // not affected by the view filters
  const deckHTML = deckStats(runs);
  const suitTableHTML = opts.suit ? '' : suitTable(fwd);

  if (!win.length) {
    return {
      empty: true,
      statCardsHTML: '',
      trendSVG: '',
      slowListHTML: `<div class="${EMPTY}">No reps match this filter. Run a drill session.</div>`,
      facetStatsHTML: `<div class="${EMPTY}">—</div>`,
      bucketHTML,
      habitHTML,
      suitTableHTML,
      deckHTML,
      slowPairs: [],
    };
  }

  // ---- stat cards: headline latency = forward reflex; reps/accuracy = everything in window ----
  const fwdGood = fwd.filter((a) => a.grade !== '3').map((a) => a.latencyMs);
  const acc = (win.filter((a) => a.grade !== '3').length / win.length) * 100;
  const statCardsHTML = [
    STAT(win.length, 'Total reps'),
    STAT(ms(quantile(fwdGood, 0.5)), 'Median (card→image)'),
    STAT(ms(quantile(fwdGood, 0.75)), 'p75'),
    STAT(ms(quantile(fwdGood, 0.9)), 'p90'),
    STAT(acc.toFixed(0) + '%', 'Accuracy'),
  ].join('');

  // ---- trend by session (forward only) ----
  const bySess: Record<string, Attempt[]> = {};
  for (const a of fwd) (bySess[a.session] = bySess[a.session] || []).push(a);
  const sessOrder = Object.keys(bySess).sort();
  const pts: TrendPoint[] = sessOrder.map((sid) => {
    const lats = bySess[sid].filter((a) => a.grade !== '3').map((a) => a.latencyMs);
    return { med: quantile(lats, 0.5) || 0, p75: quantile(lats, 0.75) || 0, p90: quantile(lats, 0.9) || 0 };
  });
  const trendSVG = drawTrend(pts);

  // ---- slowest (card, facet, dir) — p75 over each pair's last 8 attempts ----
  const cf: Record<string, Attempt[]> = {};
  for (const a of singles) {
    const k = a.card + '|' + a.facet + '|' + dirOf(a);
    (cf[k] = cf[k] || []).push(a);
  }
  const rows = Object.entries(cf)
    .map(([k, arr]) => {
      const [id, f, dir] = k.split('|');
      arr.sort((x, y) => x.timestamp - y.timestamp);
      const recent = arr.slice(-8);
      const lats = recent.filter((a) => a.grade !== '3').map((a) => a.latencyMs);
      return {
        id,
        f: f as Facet,
        dir: dir as 'fwd' | 'rev',
        p75: quantile(lats, 0.75) || 0,
        n: arr.length,
        miss: arr.filter((a) => a.grade === '3').length,
      };
    })
    .filter((r) => r.n >= 2 && r.p75 > 0)
    .sort((a, b) => b.p75 - a.p75)
    .slice(0, 12);
  const slowPairs: PairRef[] = rows.map((r) => ({ card: r.id, facet: r.f, dir: r.dir }));
  const maxP = Math.max(...rows.map((r) => r.p75), 1);
  const slowListHTML = rows.length
    ? `<table class="${TABLE}"><tr><th class="${TH}">Card</th><th class="${TH}">Asked</th><th class="${TH}">p75 (last 8)</th><th class="${TH}">reps</th><th class="${TH}">miss</th></tr>${rows
        .map((r) => {
          const c = CARDS[r.id];
          const nm = c ? c[r.f] : '';
          return `<tr><td class="${TD}">${r.id.slice(1)}${SUIT_META[r.id[0] as Suit].sym} <span class="text-dim">${esc(nm)}</span></td><td class="${TD}">${FACET_LABEL[r.f]}${r.dir === 'rev' ? '<span class="text-dim">→CARD</span>' : ''}</td><td class="bar-cell ${TD}"><div class="b" style="width:${(r.p75 / maxP) * 100}%"></div><span>${Math.round(r.p75)}ms</span></td><td class="${TD}">${r.n}</td><td class="${TD}">${r.miss}</td></tr>`;
        })
        .join('')}</table>`
    : `<div class="${EMPTY}">Need ≥2 reps per pair.</div>`;

  // ---- per-facet latency, forward + reverse + fusion rows ----
  const facetRow = (label: string, l: number[]): string =>
    `<tr><td class="${TD}">${label}</td><td class="${TD}">${l.length ? ms(quantile(l, 0.5)) : '—'}</td><td class="${TD}">${l.length ? ms(quantile(l, 0.75)) : '—'}</td><td class="${TD}">${l.length ? ms(quantile(l, 0.9)) : '—'}</td><td class="${TD}">${l.length}</td></tr>`;
  const latsOf = (arr: Attempt[], f?: Facet): number[] =>
    arr.filter((a) => a.grade !== '3' && (!f || a.facet === f)).map((a) => a.latencyMs);
  let facetStatsHTML = `<table class="${TABLE}"><tr><th class="${TH}">Asked</th><th class="${TH}">median</th><th class="${TH}">p75</th><th class="${TH}">p90</th><th class="${TH}">reps</th></tr>`;
  for (const f of FACETS) facetStatsHTML += facetRow(FACET_LABEL[f], latsOf(fwd, f));
  if (rev.length) for (const f of FACETS) facetStatsHTML += facetRow(`${FACET_LABEL[f]}<span class="text-dim">→CARD</span>`, latsOf(rev, f));
  if (fus.length) facetStatsHTML += facetRow('FUSION <span class="text-dim">(3→1)</span>', latsOf(fus));
  facetStatsHTML += '</table>';

  return { empty: false, statCardsHTML, trendSVG, slowListHTML, facetStatsHTML, bucketHTML, habitHTML, suitTableHTML, deckHTML, slowPairs };
}

/* ---- daily habit: streaks + last 14 days ---- */
function habit(all: Attempt[]): string {
  if (!all.length) return `<div class="${EMPTY}">—</div>`;
  const dayKey = (t: number): string => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const counts: Record<string, number> = {};
  for (const a of all) {
    const k = dayKey(a.timestamp);
    counts[k] = (counts[k] || 0) + 1;
  }
  const today = new Date();
  const k0 = dayKey(today.getTime());
  let cur = 0;
  const d = new Date(today);
  if (!counts[k0]) d.setDate(d.getDate() - 1); // a streak may be "alive" until today is drilled
  while (counts[dayKey(d.getTime())]) {
    cur++;
    d.setDate(d.getDate() - 1);
  }
  // best streak: day keys as UTC timestamps are uniformly 24h apart (DST-safe)
  const days = Object.keys(counts).sort();
  let best = 0,
    runLen = 0,
    prev = 0;
  for (const ds of days) {
    const t = new Date(ds + 'T00:00:00Z').getTime();
    runLen = prev && t - prev === 86400000 ? runLen + 1 : 1;
    best = Math.max(best, runLen);
    prev = t;
  }
  const bars: string[] = [];
  let mx = 1;
  const seq: { k: string; n: number; label: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(today);
    dd.setDate(dd.getDate() - i);
    const k = dayKey(dd.getTime());
    const n = counts[k] || 0;
    mx = Math.max(mx, n);
    seq.push({ k, n, label: String(dd.getDate()) });
  }
  for (const b of seq)
    bars.push(
      `<div class="flex flex-col items-center gap-1" title="${b.k}: ${b.n} reps"><div class="w-3 rounded-[2px] ${b.n ? 'bg-accent2' : 'bg-surface2'}" style="height:${Math.max(3, Math.round((b.n / mx) * 40))}px"></div><span class="font-mono text-[9px] text-dim">${b.label}</span></div>`
    );
  return `<div class="flex gap-[26px] flex-wrap items-end">
    <div class="font-mono text-[13px] text-muted flex flex-col gap-1.5">
      <span>current streak <b class="text-ink">${cur} day${cur === 1 ? '' : 's'}</b></span>
      <span>best streak <b class="text-ink">${best} day${best === 1 ? '' : 's'}</b></span>
      <span>today <b class="text-ink">${counts[k0] || 0}</b> reps</span>
    </div>
    <div class="flex gap-1 items-end">${bars.join('')}</div>
  </div>`;
}

/* ---- Leitner bucket distribution + due-now ---- */
function buckets(): string {
  const assigned = Object.values(CARDS).filter((c) => c.person && c.action && c.object);
  if (!assigned.length) return `<div class="${EMPTY}">—</div>`;
  const now = Date.now();
  const seg = (dir: 'fwd' | 'rev') => {
    const counts = [0, 0, 0, 0, 0, 0]; // [never-seen, b1..b5]
    let due = 0;
    for (const c of assigned)
      for (const f of FACETS) {
        const st = LEITNER[KEY(c.id, f, dir)];
        if (!st) {
          counts[0]++;
          due++;
        } else {
          counts[st.bucket] = (counts[st.bucket] || 0) + 1;
          if (!st.due || st.due <= now) due++;
        }
      }
    return { counts, due, total: assigned.length * 3 };
  };
  const COLS = ['#3a3f4f', '#e0414b', '#f5a623', '#ffb000', '#9bd96a', '#39d98a'];
  const row = (label: string, s: { counts: number[]; due: number; total: number }): string => {
    const bar = s.counts
      .map((n, i) => (n ? `<div title="${i === 0 ? 'new' : 'bucket ' + i}: ${n}" style="width:${(n / s.total) * 100}%;background:${COLS[i]}"></div>` : ''))
      .join('');
    return `<div class="mb-3.5">
      <div class="flex justify-between flex-wrap gap-1 font-mono text-[11px] text-muted mb-1.5"><span>${label}</span><span>graduated <b class="text-ink">${s.counts[5]}/${s.total}</b> · due now <b class="text-ink">${s.due}</b></span></div>
      <div class="flex h-2.5 rounded-[99px] overflow-hidden bg-surface2">${bar}</div>
      <div class="flex gap-3 flex-wrap font-mono text-[10px] text-dim mt-1.5"><span>new ${s.counts[0]}</span><span>b1 ${s.counts[1]}</span><span>b2 ${s.counts[2]}</span><span>b3 ${s.counts[3]}</span><span>b4 ${s.counts[4]}</span><span>b5 ${s.counts[5]}</span></div>
    </div>`;
  };
  const fwdS = seg('fwd');
  const revS = seg('rev');
  const revAny = revS.counts.slice(1).some((n) => n > 0);
  return row('card → image', fwdS) + (revAny ? row('image → card', revS) : '');
}

/* ---- per-suit summary: answers "is this suit done?" ---- */
function suitTable(fwd: Attempt[]): string {
  if (!fwd.length) return '';
  const bySuit: Record<string, Attempt[]> = {};
  for (const a of fwd) (bySuit[a.card[0]] = bySuit[a.card[0]] || []).push(a);
  let html = `<table class="${TABLE}"><tr><th class="${TH}">Suit</th><th class="${TH}">reps</th><th class="${TH}">median</th><th class="${TH}">p75</th><th class="${TH}">graduated</th></tr>`;
  for (const s of SUITS) {
    const arr = bySuit[s] || [];
    const lats = arr.filter((a) => a.grade !== '3').map((a) => a.latencyMs);
    let grad = 0,
      pairs = 0;
    for (const r of RANKS) {
      const c = CARDS[cardId(s, r)];
      if (!c.person || !c.action || !c.object) continue;
      for (const f of FACETS) {
        pairs++;
        const st = LEITNER[KEY(cardId(s, r), f, 'fwd')];
        if (st && st.bucket >= 5) grad++;
      }
    }
    html += `<tr><td class="${TD}"><span style="color:${SUIT_META[s].color === 'red' ? 'var(--color-cardred)' : 'var(--color-ink)'}">${SUIT_META[s].sym}</span> ${SUIT_META[s].cat}</td><td class="${TD}">${arr.length}</td><td class="${TD}">${arr.length ? ms(quantile(lats, 0.5)) : '—'}</td><td class="${TD}">${arr.length ? ms(quantile(lats, 0.75)) : '—'}</td><td class="${TD}">${grad}/${pairs}</td></tr>`;
  }
  return html + '</table>';
}

/* ---- deck-run mini stats ---- */
function deckStats(runs: DeckRun[]): string {
  if (!runs.length) return '';
  const best = [...runs].sort((a, b) => b.correct - a.correct || a.memMs - b.memMs)[0];
  const last = [...runs].sort((a, b) => b.timestamp - a.timestamp)[0];
  const fmtS = (v: number): string => (v / 1000 >= 60 ? `${Math.floor(v / 60000)}m ${((v % 60000) / 1000).toFixed(0)}s` : (v / 1000).toFixed(1) + 's');
  return [
    STAT(runs.length, 'Deck runs'),
    STAT(`${best.correct}/52`, 'Best score'),
    STAT(fmtS(best.memMs), 'Best memorize'),
    STAT(`${last.correct}/52`, `Last run · ${new Date(last.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}`),
  ].join('');
}

export function drawTrend(pts: TrendPoint[]): string {
  const W = 600,
    H = 160,
    pad = 8;
  if (pts.length < 2) {
    return `<text x="300" y="80" fill="#6b7280" font-family="var(--font-mono)" font-size="13" text-anchor="middle">Need ≥2 sessions to draw a trend</text>`;
  }
  const allv = pts.flatMap((p) => [p.med, p.p75, p.p90]);
  const max = Math.max(...allv) * 1.1,
    min = 0;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const line = (key: keyof TrendPoint, col: string) => {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
    return (
      `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5"/>` +
      pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="3" fill="${col}"/>`).join('')
    );
  };
  return line('p90', '#e0414b') + line('p75', '#ffb000') + line('med', '#39d98a');
}
