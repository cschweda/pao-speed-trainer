import { SUIT_META, FACETS, FACET_LABEL, type Suit, type Facet } from './data';

// Minimal, sub-300ms-legible card faces. Ported from the original; the only change
// is CSS variable names, updated to the Tailwind v4 @theme-emitted equivalents
// (var(--card-red) -> var(--color-cardred), var(--disp) -> var(--font-disp), ...).
export function cardSVG(suit: Suit, rank: string, { mini = false }: { mini?: boolean } = {}): string {
  const m = SUIT_META[suit];
  const col = m.color === 'red' ? 'var(--color-cardred)' : 'var(--color-cardblack)';
  const pip = m.sym;
  const rankFont = mini ? 34 : 84,
    pipFont = mini ? 30 : 76,
    cornerFont = mini ? 14 : 30;
  // Clean face: big rank center-left, big pip center-right; corner indices. No court art.
  return `<svg class="card-svg" viewBox="0 0 240 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${rank} of ${m.cat}">
    <rect x="3" y="3" width="234" height="330" rx="18" fill="#fbfbf7" stroke="#d9d9d2" stroke-width="2"/>
    <g fill="${col}" font-family="var(--font-disp)" font-weight="900">
      <text x="20" y="${cornerFont + 18}" font-size="${cornerFont}" text-anchor="middle">${rank}</text>
      <text x="20" y="${cornerFont + 18 + cornerFont * 0.95}" font-size="${cornerFont}" text-anchor="middle">${pip}</text>
      <text x="220" y="${336 - 18}" font-size="${cornerFont}" text-anchor="middle" transform="rotate(180 220 ${336 - 30})">${rank}</text>
      <text x="220" y="${336 - 18 - cornerFont * 0.95}" font-size="${cornerFont}" text-anchor="middle" transform="rotate(180 220 ${336 - 30 - cornerFont * 0.95})">${pip}</text>
      <text x="92" y="200" font-size="${rankFont}" text-anchor="middle" dominant-baseline="middle">${rank}</text>
      <text x="160" y="172" font-size="${pipFont}" text-anchor="middle" dominant-baseline="middle">${pip}</text>
    </g>
  </svg>`;
}

export function cardBackSVG(text: string, sub: string): string {
  return `<svg class="card-svg" viewBox="0 0 240 336" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="234" height="330" rx="18" fill="#181a21" stroke="#2c3040" stroke-width="2"/>
    <foreignObject x="16" y="120" width="208" height="160">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:var(--font-disp);color:#ffb000;font-size:26px;line-height:1.1;text-align:center">${text || '—'}
      <div style="font-family:var(--font-mono);font-size:12px;color:#9aa0ad;margin-top:10px;font-weight:400">${sub || ''}</div></div>
    </foreignObject>
  </svg>`;
}

export function esc(s: string): string {
  return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Reveal back for single-card drills: the full P·A·O triplet, asked facet accented.
export function cardPAOBackSVG(person: string, action: string, object: string, asked: Facet): string {
  const val: Record<Facet, string> = { person, action, object };
  const rows = FACETS.map((f) => {
    const hit = f === asked;
    return `<div data-facet="${f}">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;font-weight:400;color:${hit ? '#ffb000' : '#6b7080'}">${FACET_LABEL[f]}</div>
      <div style="font-family:var(--font-disp);font-size:${hit ? 23 : 16}px;line-height:1.12;margin-top:2px;color:${hit ? '#ffb000' : '#c8ccd6'}">${esc(val[f]) || '—'}</div>
    </div>`;
  }).join('');
  return `<svg class="card-svg" viewBox="0 0 240 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(person)} · ${esc(action)} · ${esc(object)}">
    <rect x="3" y="3" width="234" height="330" rx="18" fill="#181a21" stroke="#2c3040" stroke-width="2"/>
    <foreignObject x="16" y="18" width="208" height="300">
      <div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:16px;text-align:center">${rows}</div>
    </foreignObject>
  </svg>`;
}
