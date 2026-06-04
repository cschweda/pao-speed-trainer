/* ====================== DASHBOARD ======================
   Ported from the original renderDash/drawTrend. Refactored to return HTML
   strings (consumed by the Alpine `dash` component) instead of writing to
   fixed elements. CSS var names updated to the Tailwind v4 @theme equivalents;
   hard-coded hex colors (trend lines, legend) kept as-is. */
import { quantile } from './stats';
import { CARDS } from './db';
import type { Attempt } from './db';
import { SUIT_META, FACETS, FACET_LABEL, type Suit, type Facet } from './data';
import { esc } from './svg';

export interface DashData {
  empty: boolean;
  statCardsHTML: string;
  slowListHTML: string;
  facetStatsHTML: string;
  trendSVG: string;
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

export function computeDash(all: Attempt[]): DashData {
  if (!all.length) {
    return {
      empty: true,
      statCardsHTML: '',
      slowListHTML: `<div class="${EMPTY}">No reps yet. Run a drill session.</div>`,
      facetStatsHTML: `<div class="${EMPTY}">—</div>`,
      trendSVG: '',
    };
  }

  // ---- stat cards ----
  const good = all.filter((a) => a.grade !== '3').map((a) => a.latencyMs);
  const acc = (all.filter((a) => a.grade !== '3').length / all.length) * 100;
  const cards: [string, string | number][] = [
    ['Total reps', all.length],
    ['Median latency', Math.round(quantile(good, 0.5) || 0) + 'ms'],
    ['p75', Math.round(quantile(good, 0.75) || 0) + 'ms'],
    ['p90', Math.round(quantile(good, 0.9) || 0) + 'ms'],
    ['Accuracy', acc.toFixed(0) + '%'],
  ];
  const statCardsHTML = cards
    .map(
      ([l, v]) =>
        `<div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${v}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">${l}</div></div>`
    )
    .join('');

  // ---- trend by session ----
  const bySess: Record<string, Attempt[]> = {};
  for (const a of all) (bySess[a.session] = bySess[a.session] || []).push(a);
  const sessOrder = Object.keys(bySess).sort();
  const pts: TrendPoint[] = sessOrder.map((sid) => {
    const lats = bySess[sid].filter((a) => a.grade !== '3').map((a) => a.latencyMs);
    return { med: quantile(lats, 0.5) || 0, p75: quantile(lats, 0.75) || 0, p90: quantile(lats, 0.9) || 0 };
  });
  const trendSVG = drawTrend(pts);

  // ---- slowest (card,facet) ----
  const cf: Record<string, Attempt[]> = {};
  for (const a of all) {
    const k = a.card + '|' + a.facet;
    (cf[k] = cf[k] || []).push(a);
  }
  const rows = Object.entries(cf)
    .map(([k, arr]) => {
      const [id, f] = k.split('|');
      const lats = arr.filter((a) => a.grade !== '3').map((a) => a.latencyMs);
      return { id, f: f as Facet, p75: quantile(lats, 0.75) || 0, n: arr.length, miss: arr.filter((a) => a.grade === '3').length };
    })
    .filter((r) => r.n >= 2)
    .sort((a, b) => b.p75 - a.p75)
    .slice(0, 12);
  const maxP = Math.max(...rows.map((r) => r.p75), 1);
  const slowListHTML = rows.length
    ? `<table class="${TABLE}"><tr><th class="${TH}">Card</th><th class="${TH}">Facet</th><th class="${TH}">p75 latency</th><th class="${TH}">reps</th><th class="${TH}">miss</th></tr>${rows
        .map((r) => {
          const c = CARDS[r.id];
          const nm = c ? c[r.f] : '';
          return `<tr><td class="${TD}">${r.id.slice(1) === '10' ? '10' : r.id.slice(1)}${SUIT_META[r.id[0] as Suit].sym} <span class="text-dim">${esc(nm)}</span></td><td class="${TD}">${FACET_LABEL[r.f]}</td><td class="bar-cell ${TD}"><div class="b" style="width:${(r.p75 / maxP) * 100}%"></div><span>${Math.round(r.p75)}ms</span></td><td class="${TD}">${r.n}</td><td class="${TD}">${r.miss}</td></tr>`;
        })
        .join('')}</table>`
    : `<div class="${EMPTY}">Need ≥2 reps per pair.</div>`;

  // ---- per-facet p75 ----
  const fac: Record<string, number[]> = {};
  for (const a of all) if (a.grade !== '3') (fac[a.facet] = fac[a.facet] || []).push(a.latencyMs);
  const facetStatsHTML = `<table class="${TABLE}"><tr><th class="${TH}">Facet</th><th class="${TH}">median</th><th class="${TH}">p75</th><th class="${TH}">p90</th><th class="${TH}">reps</th></tr>${FACETS.map(
    (f) => {
      const l = fac[f] || [];
      return `<tr><td class="${TD}">${FACET_LABEL[f]}</td><td class="${TD}">${l.length ? Math.round(quantile(l, 0.5)!) + 'ms' : '—'}</td><td class="${TD}">${l.length ? Math.round(quantile(l, 0.75)!) + 'ms' : '—'}</td><td class="${TD}">${l.length ? Math.round(quantile(l, 0.9)!) + 'ms' : '—'}</td><td class="${TD}">${l.length}</td></tr>`;
    }
  ).join('')}</table>`;

  return { empty: false, statCardsHTML, slowListHTML, facetStatsHTML, trendSVG };
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
