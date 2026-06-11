/* ====================== DRILL ENGINE ======================
   Honest-latency-first vanilla logic. No framework indirection.
   Clock starts in rAF after prompt paint; stops as first line of keydown.

   Three rep kinds share the session machinery:
     fwd    — card shown, one facet asked            (card → image)
     rev    — facet text shown, card asked           (image → card, own Leitner track)
     fusion — three cards shown, fuse P+A+O into one scene (no Leitner; global pace target) */
import { CARDS, LEITNER, KEY, DB, saveLeitner, toggleFlag, type Dir, type LeitnerEntry } from './db';
import { quantile } from './stats';
import { cardSVG, cardBackSVG, cardPAOBackSVG, esc } from './svg';
import { SUITS, SUIT_META, FACETS, FACET_LABEL, allCards, type Card, type Facet, type Suit } from './data';
import { showToast } from './toast';

type Kind = 'fwd' | 'rev' | 'fusion';
export interface PairRef {
  card: string;
  facet: Facet;
  dir: 'fwd' | 'rev';
}

interface RepLog {
  label: string;
  lat: number;
  grade: number;
}
interface Session {
  id: string;
  reps: number;
  instant: number;
  slow: number;
  missed: number;
  lat: number[];
  promoted: number;
  startedAt: number;
  items: RepLog[];
}
interface RepPick {
  card: Card;
  facet: Facet;
  dir: 'fwd' | 'rev';
  w: number;
}
interface Cur {
  kind: Kind;
  cards: Card[]; // 1 for fwd/rev, 3 for fusion (P-card, A-card, O-card)
  facet: Facet | null;
  dir: Dir;
  deadline: number;
  calibrating: boolean;
  answered: boolean;
  _lat?: number;
}
interface UndoSnap {
  aid: IDBValidKey;
  key: string | null; // leitner key (null for fusion)
  prev: LeitnerEntry | null; // entry before this grade (null = was absent)
  grade: number;
  lat: number;
  fusion: boolean;
  promoted: boolean;
}

/* ---- scheduling constants ---- */
const DAY = 86400000;
// bucket → re-ask interval; an item isn't "due" again until this has elapsed
const BUCKET_DUE_MS: Record<number, number> = { 1: 0, 2: 1 * DAY, 3: 3 * DAY, 4: 7 * DAY, 5: 21 * DAY };
const PROMO_GAP_MS = 120000; // instants within 2 min of the pair's last rep don't advance the streak (working-memory echo)
const MIN_GAP = 4; // never re-ask any of the last 4 items while the pool allows

let session: Session | null = null;
let cur: Cur | null = null;
let clockStart = 0;
let overTimer: ReturnType<typeof setTimeout> | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
let recentKeys: string[] = [];
let customPool: PairRef[] | null = null;
let activeSuits: Set<Suit> = new Set(SUITS);
let fusionLats: number[] = []; // chronological non-miss fusion latencies (seeded from store at session start)
let lastUndo: UndoSnap | null = null;
let running = false;

/* ---- stage elements (assigned in init()) ---- */
let stage!: HTMLElement;
let singleWrap!: HTMLElement;
let flip!: HTMLElement;
let cardFront!: HTMLElement;
let cardBack!: HTMLElement;
let tripletRow!: HTMLElement;
let tFlips: HTMLElement[] = [];
let tFronts: HTMLElement[] = [];
let tBacks: HTMLElement[] = [];
let facetAsk!: HTMLElement;
let deadbar!: HTMLElement;
let targetLabel!: HTMLElement;
let revealPanel!: HTMLElement;
let gradebar!: HTMLElement;
let latReadout!: HTMLElement;
let sessionbar!: HTMLElement;
let summaryEl!: HTMLElement;
let startBtn!: HTMLElement;
let endBtn!: HTMLElement;
let undoBtn!: HTMLElement;
let flagBtn!: HTMLElement;
let modeSel!: HTMLSelectElement;
let sessTargetSel!: HTMLSelectElement;
let customChip!: HTMLElement;
let customChipLabel!: HTMLElement;
let suitChipEls: HTMLButtonElement[] = [];

function eligibleCards(): Card[] {
  return allCards().filter((c) => {
    const cc = CARDS[c.id];
    if (!cc.person || !cc.action || !cc.object) return false;
    return activeSuits.has(c.suit);
  });
}

function modeKind(): { kind: Kind; facets: Facet[] } {
  const m = modeSel.value;
  if (m === 'fusion') return { kind: 'fusion', facets: FACETS };
  if (m[0] === 'r') {
    const f = m.slice(1);
    return { kind: 'rev', facets: f === 'mixed' ? FACETS : [f as Facet] };
  }
  return { kind: 'fwd', facets: m === 'mixed' ? FACETS : [m as Facet] };
}

// rolling p75 from last 8 attempts of this (card, facet, direction)
function p75For(card: string, facet: Facet, dir: 'fwd' | 'rev'): Promise<number | null> {
  const idx = DB.tx('attempts').index('byCardFacet');
  return new Promise((res) => {
    const out: number[] = [];
    const rq = idx.openCursor(IDBKeyRange.only([card, facet]), 'prev');
    rq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor && out.length < 8) {
        const v = cursor.value;
        if (v.grade !== '3' && (v.dir || 'fwd') === dir) out.push(v.latencyMs);
        cursor.continue();
      } else res(out.length >= 3 ? quantile(out, 0.75) : null);
    };
    rq.onerror = () => res(null);
  });
}

/* ---- weighting: lower bucket => higher weight; graduated rests; not-yet-due rests hard ---- */
function weightFor(st: LeitnerEntry | undefined, now: number): number {
  const b = st ? st.bucket : 1;
  let w = Math.pow(2, 5 - b); // bucket1=16 ... bucket5=1
  if (b >= 5) w = 0.4; // graduated: occasional refresh
  if (st && st.due && st.due > now) w = Math.min(w, 0.08); // not due yet: heavy rest
  return w;
}

function buildPool(): RepPick[] {
  const now = Date.now();
  if (customPool) {
    return customPool
      .filter((p) => {
        const c = CARDS[p.card];
        return c && c.person && c.action && c.object;
      })
      .map((p) => ({
        card: { suit: p.card[0] as Suit, rank: p.card.slice(1), id: p.card },
        facet: p.facet,
        dir: p.dir,
        w: weightFor(LEITNER[KEY(p.card, p.facet, p.dir)], now),
      }));
  }
  const { kind, facets } = modeKind();
  const dir: 'fwd' | 'rev' = kind === 'rev' ? 'rev' : 'fwd';
  const pool: RepPick[] = [];
  for (const c of eligibleCards()) for (const f of facets) pool.push({ card: c, facet: f, dir, w: weightFor(LEITNER[KEY(c.id, f, dir)], now) });
  return pool;
}

// weighted pick with a no-immediate-repeat guard
function pickWeighted(pool: RepPick[]): RepPick {
  const fresh = pool.filter((x) => !recentKeys.includes(KEY(x.card.id, x.facet, x.dir)));
  const usable = fresh.length ? fresh : pool;
  let tot = usable.reduce((s, x) => s + x.w, 0),
    r = Math.random() * tot;
  for (const x of usable) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return usable[usable.length - 1];
}
function markRecent(k: string): void {
  recentKeys.push(k);
  if (recentKeys.length > MIN_GAP) recentKeys.shift();
}

/* ---- fusion: sample each slot weighted by that slot-facet's forward bucket ---- */
function pickFusion(elig: Card[]): Card[] {
  const now = Date.now();
  const out: Card[] = [];
  for (const f of FACETS) {
    const cands = elig.filter((c) => !out.some((o) => o.id === c.id));
    let tot = 0;
    const ws = cands.map((c) => {
      const w = weightFor(LEITNER[KEY(c.id, f, 'fwd')], now);
      tot += w;
      return w;
    });
    let r = Math.random() * tot,
      picked = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) {
      r -= ws[i];
      if (r <= 0) {
        picked = cands[i];
        break;
      }
    }
    out.push(picked);
  }
  return out;
}

function fusionDeadline(): { deadline: number; p75: number | null } {
  const recent = fusionLats.slice(-8);
  const p75 = recent.length >= 3 ? quantile(recent, 0.75) : null;
  return { deadline: p75 ? Math.min(15000, Math.max(600, p75 * 0.9)) : 12000, p75 };
}

function loadFusionLats(): Promise<number[]> {
  return new Promise((res) => {
    const out: number[] = [];
    const rq = DB.tx('attempts').openCursor(null, 'prev');
    rq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor && out.length < 8) {
        const v = cursor.value;
        if ((v.dir || '') === 'fusion' && v.grade !== '3') out.push(v.latencyMs);
        cursor.continue();
      } else res(out.reverse());
    };
    rq.onerror = () => res(out.reverse());
  });
}

const HINT: Record<Kind, string> = {
  fwd: '— recall, then press <b>Space</b> —',
  rev: '— name the card, then press <b>Space</b> —',
  fusion: '— fuse one scene, then press <b>Space</b> —',
};

async function nextRep(): Promise<void> {
  clearAnim();
  if (!customPool && modeKind().kind === 'fusion') {
    const elig = eligibleCards();
    if (elig.length < 3) {
      endSession();
      showToast('Fusion needs ≥3 fully-assigned cards in this filter');
      return;
    }
    const cards = pickFusion(elig);
    const { deadline, p75 } = fusionDeadline();
    cur = { kind: 'fusion', cards, facet: null, dir: 'fusion', deadline, calibrating: !p75, answered: false };
    renderPrompt(p75);
    return;
  }
  const pool = buildPool();
  if (!pool.length) {
    endSession();
    showToast(customPool ? 'Custom pool has no drillable pairs' : 'No fully-assigned cards match this filter');
    return;
  }
  const pick = pickWeighted(pool);
  markRecent(KEY(pick.card.id, pick.facet, pick.dir));
  const p75 = await p75For(pick.card.id, pick.facet, pick.dir);
  const deadline = p75 ? Math.min(6000, Math.max(400, p75 * 0.9)) : 6000;
  cur = { kind: pick.dir, cards: [pick.card], facet: pick.facet, dir: pick.dir, deadline, calibrating: !p75, answered: false };
  renderPrompt(p75);
}

function renderPrompt(p75: number | null): void {
  const c = cur!;
  // reset visuals BEFORE paint
  gradebar.style.display = 'none';
  revealPanel.innerHTML = `<div class="font-mono text-[12px] text-dim text-center">${HINT[c.kind]}</div>`;
  latReadout.textContent = '';
  targetLabel.style.color = '';
  deadbar.style.transition = 'none';
  deadbar.style.transform = 'scaleX(1)';

  if (c.kind === 'fusion') {
    singleWrap.style.display = 'none';
    tripletRow.style.display = 'flex';
    facetAsk.textContent = 'FUSE → ONE SCENE';
    c.cards.forEach((card, i) => {
      tFlips[i].classList.remove('flipped');
      tFronts[i].innerHTML = cardSVG(card.suit, card.rank, {});
      tBacks[i].innerHTML = cardBackSVG('', '');
    });
  } else {
    singleWrap.style.display = 'block';
    tripletRow.style.display = 'none';
    flip.classList.remove('flipped');
    const card = c.cards[0];
    if (c.kind === 'rev') {
      facetAsk.textContent = 'WHICH CARD?';
      cardFront.innerHTML = cardBackSVG(esc(CARDS[card.id][c.facet!]), FACET_LABEL[c.facet!]);
    } else {
      facetAsk.textContent = FACET_LABEL[c.facet!] + '?';
      cardFront.innerHTML = cardSVG(card.suit, card.rank, {});
    }
    cardBack.innerHTML = cardBackSVG('', '');
  }
  targetLabel.textContent = p75 ? `target ≈ ${Math.round(c.deadline)}ms  (your p75 ${Math.round(p75)}ms)` : 'target — (calibrating)';

  // CLOCK START: after the prompt's first confirmed paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      clockStart = performance.now();
      deadbar.style.transition = `transform ${c.deadline}ms linear`;
      requestAnimationFrame(() => {
        deadbar.style.transform = 'scaleX(0)';
      });
      overTimer = setTimeout(() => {
        if (cur === c && !c.answered && c._lat == null) {
          targetLabel.style.color = 'var(--color-miss)';
          targetLabel.textContent += '  · OVER';
        }
      }, c.deadline);
    });
  });
}

function captureReveal(): void {
  if (cur && !cur.answered && cur._lat == null) {
    cur._lat = performance.now() - clockStart;
    reveal();
  }
}

function reveal(): void {
  if (!cur || cur.answered) return;
  const c = cur;
  if (c.kind === 'fusion') {
    const vals = [CARDS[c.cards[0].id].person, CARDS[c.cards[1].id].action, CARDS[c.cards[2].id].object];
    c.cards.forEach((_, i) => {
      tBacks[i].innerHTML = cardBackSVG(esc(vals[i]), FACET_LABEL[FACETS[i]]);
      tFlips[i].classList.add('flipped');
    });
    const ctx = c.cards.map((card) => card.rank + SUIT_META[card.suit].sym).join(' ');
    revealPanel.innerHTML = `<div class="font-disp text-[22px] leading-[1.25]">${esc(vals[0])} <span class="text-dim">·</span> ${esc(vals[1])} <span class="text-dim">·</span> ${esc(vals[2])}</div><div class="font-mono text-[12px] text-muted mt-1.5">${esc(ctx)} · person of 1st + action of 2nd + object of 3rd</div>`;
  } else {
    const card = c.cards[0];
    const rec = CARDS[card.id];
    const ctx = `${card.rank}${SUIT_META[card.suit].sym} · P:${rec.person} · A:${rec.action} · O:${rec.object}`;
    if (c.kind === 'rev') {
      cardBack.innerHTML = cardSVG(card.suit, card.rank, {});
      const col = SUIT_META[card.suit].color === 'red' ? 'var(--color-cardred)' : 'var(--color-ink)';
      revealPanel.innerHTML = `<div class="font-disp text-[30px] leading-[1.1]" style="color:${col}">${card.rank}${SUIT_META[card.suit].sym}</div><div class="font-mono text-[12px] text-muted mt-1.5">${esc(ctx)}</div>`;
    } else {
      const ans = rec[c.facet!];
      cardBack.innerHTML = cardPAOBackSVG(rec.person, rec.action, rec.object, c.facet!);
      revealPanel.innerHTML = `<div class="font-disp text-[30px] leading-[1.1]">${esc(ans)}</div><div class="font-mono text-[12px] text-muted mt-1.5">${esc(ctx)}</div>`;
    }
    flip.classList.add('flipped');
  }
  gradebar.style.display = 'flex';
  deadbar.style.transition = 'none';
  if (overTimer) {
    clearTimeout(overTimer);
    overTimer = null;
  }
}

function repLabel(c: Cur): string {
  if (c.kind === 'fusion') return c.cards.map((card) => card.rank + SUIT_META[card.suit].sym).join(' ') + '·FUSE';
  const card = c.cards[0];
  const base = `${card.rank}${SUIT_META[card.suit].sym}·${FACET_LABEL[c.facet!]}`;
  return c.kind === 'rev' ? base + '→CARD' : base;
}

function sessionTarget(): { reps?: number; ms?: number } | null {
  const v = sessTargetSel.value;
  if (!v) return null;
  return v[0] === 'r' ? { reps: Number(v.slice(1)) } : { ms: Number(v.slice(1)) * 60000 };
}

async function grade(g: number): Promise<void> {
  if (!cur || cur.answered || cur._lat == null) return;
  const s = session;
  if (!s) return;
  cur.answered = true;
  const c = cur;
  const lat = c._lat;
  const now = Date.now();
  // latency-aware scheduling: an INSTANT slower than your own established target schedules as SLOW
  const over = !c.calibrating && lat > c.deadline;
  const gSched = g === 1 && over ? 2 : g;

  const isFusion = c.kind === 'fusion';
  const cardKey = isFusion ? c.cards.map((x) => x.id).join('+') : c.cards[0].id;
  const facetKey: Facet | 'triplet' = isFusion ? 'triplet' : c.facet!;
  const aid = await DB.put('attempts', {
    card: cardKey,
    facet: facetKey,
    dir: c.dir,
    latencyMs: Math.round(lat),
    grade: String(g),
    timestamp: now,
    session: s.id,
  });

  let k: string | null = null,
    prev: LeitnerEntry | null = null,
    promoted = false,
    bucket: number | null = null;
  if (!isFusion) {
    k = KEY(cardKey, c.facet!, c.dir as 'fwd' | 'rev');
    const st0 = LEITNER[k];
    prev = st0 ? { ...st0 } : null;
    const st: LeitnerEntry = st0 ? { ...st0 } : { bucket: 1, streak: 0 };
    if (gSched === 1) {
      if (!st.lastAt || now - st.lastAt >= PROMO_GAP_MS) {
        st.streak++;
        if (st.streak >= 2) {
          st.bucket = Math.min(5, st.bucket + 1);
          st.streak = 0;
          promoted = true;
        }
      } // unspaced instants are practice, not promotion evidence
    } else if (gSched === 2) {
      st.streak = 0; /* hold */
    } else {
      st.bucket = 1;
      st.streak = 0;
    }
    st.lastAt = now;
    st.due = now + BUCKET_DUE_MS[st.bucket];
    LEITNER[k] = st;
    bucket = st.bucket;
    await saveLeitner();
  } else if (g !== 3) {
    fusionLats.push(lat);
  }

  lastUndo = { aid, key: k, prev, grade: g, lat, fusion: isFusion, promoted };

  s.reps++;
  s.lat.push(lat);
  if (g === 1) s.instant++;
  if (g === 2) s.slow++;
  if (g === 3) s.missed++;
  if (promoted) s.promoted++;
  s.items.push({ label: repLabel(c), lat, grade: g });

  const verdict = c.calibrating ? '· calibrating' : !over ? '· beat target ✓' : g === 1 ? '· over target — <b class="text-slow">scheduled as SLOW</b>' : '· over target';
  latReadout.innerHTML = `recall <b class="text-accent2">${Math.round(lat)}ms</b> ${verdict}${bucket ? ` · bucket ${bucket}${promoted ? ' ↑' : ''}` : ''}`;
  undoBtn.style.display = 'inline-block';
  updateSessionbar();

  const t = sessionTarget();
  if (t && ((t.reps && s.reps >= t.reps) || (t.ms && now - s.startedAt >= t.ms))) {
    advanceTimer = setTimeout(endSession, 600);
  } else {
    advanceTimer = setTimeout(nextRep, 260);
  }
}

async function undoLast(): Promise<void> {
  if (!session) return;
  if (!lastUndo) {
    showToast('Nothing to undo');
    return;
  }
  const u = lastUndo;
  lastUndo = null;
  await DB.delete('attempts', u.aid);
  if (!u.fusion && u.key) {
    if (u.prev) LEITNER[u.key] = u.prev;
    else delete LEITNER[u.key];
    await saveLeitner();
  } else if (u.fusion && u.grade !== 3) {
    fusionLats.pop();
  }
  const s = session;
  if (!s) return;
  s.reps--;
  s.lat.pop();
  s.items.pop();
  if (u.grade === 1) s.instant--;
  if (u.grade === 2) s.slow--;
  if (u.grade === 3) s.missed--;
  if (u.promoted) s.promoted--;
  updateSessionbar();
  undoBtn.style.display = 'none';
  latReadout.innerHTML = '<span class="text-slow">last rep undone</span>';
  showToast('Last grade undone');
}

async function flagCurrent(): Promise<void> {
  if (!cur) return;
  if (cur.kind === 'fusion') {
    showToast('Flag works in single-card drills');
    return;
  }
  const card = cur.cards[0];
  const on = await toggleFlag(card.id);
  const label = card.rank + SUIT_META[card.suit].sym;
  showToast(on ? `${label} flagged for re-encode (Encode tab)` : `${label} unflagged`);
}

function updateSessionbar(): void {
  const s = session;
  if (!s) return;
  const med = quantile(s.lat, 0.5);
  sessionbar.innerHTML = `<span>reps <b class="text-ink">${s.reps}</b></span>
    <span class="text-instant">instant <b class="text-ink">${s.instant}</b></span>
    <span class="text-slow">slow <b class="text-ink">${s.slow}</b></span>
    <span class="text-miss">missed <b class="text-ink">${s.missed}</b></span>
    <span>session median <b class="text-ink">${med ? Math.round(med) + 'ms' : '—'}</b></span>`;
}

function clearAnim(): void {
  if (overTimer) {
    clearTimeout(overTimer);
    overTimer = null;
  }
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

async function startSession(): Promise<void> {
  if (running) return;
  if (!customPool && modeKind().kind === 'fusion') {
    if (eligibleCards().length < 3) {
      showToast('Fusion needs ≥3 fully-assigned cards');
      return;
    }
    fusionLats = await loadFusionLats();
  } else if (!buildPool().length) {
    showToast(customPool ? 'Custom pool has no drillable pairs' : 'Assign some cards first (Encode tab)');
    return;
  }
  session = { id: 's' + Date.now(), reps: 0, instant: 0, slow: 0, missed: 0, lat: [], promoted: 0, startedAt: Date.now(), items: [] };
  running = true;
  recentKeys = [];
  lastUndo = null;
  summaryEl.style.display = 'none';
  undoBtn.style.display = 'none';
  stage.style.display = 'flex';
  startBtn.style.display = 'none';
  endBtn.style.display = 'inline-block';
  updateSessionbar();
  nextRep();
}

function endSession(): void {
  clearAnim();
  stage.style.display = 'none';
  startBtn.style.display = 'inline-block';
  endBtn.style.display = 'none';
  cur = null;
  running = false;
  const s = session;
  session = null;
  lastUndo = null;
  if (s && s.reps) renderSummary(s);
}

function renderSummary(s: Session): void {
  const med = quantile(s.lat, 0.5),
    p75 = quantile(s.lat, 0.75);
  const mins = (Date.now() - s.startedAt) / 60000;
  const acc = Math.round(((s.instant + s.slow) / s.reps) * 100);
  const slowest = [...s.items].sort((a, b) => b.lat - a.lat).slice(0, 3);
  summaryEl.innerHTML = `
    <h3 class="font-mono text-[13px] uppercase tracking-[1px] text-accent mb-3 mt-0">Session complete</h3>
    <div class="flex gap-x-[18px] gap-y-1.5 flex-wrap font-mono text-[13px] text-muted">
      <span>reps <b class="text-ink">${s.reps}</b></span>
      <span class="text-instant">instant <b class="text-ink">${s.instant}</b></span>
      <span class="text-slow">slow <b class="text-ink">${s.slow}</b></span>
      <span class="text-miss">missed <b class="text-ink">${s.missed}</b></span>
      <span>accuracy <b class="text-ink">${acc}%</b></span>
      <span>median <b class="text-ink">${med ? Math.round(med) + 'ms' : '—'}</b></span>
      <span>p75 <b class="text-ink">${p75 ? Math.round(p75) + 'ms' : '—'}</b></span>
      <span>promotions <b class="text-ink">${s.promoted}</b></span>
      <span>${mins < 1 ? '<1' : Math.round(mins)} min</span>
    </div>
    ${slowest.length ? `<div class="font-mono text-[12px] text-dim mt-3">slowest this session: ${slowest.map((i) => `${esc(i.label)} <b class="text-ink">${Math.round(i.lat)}ms</b>`).join(' · ')}</div>` : ''}
    <div class="mt-3.5"><button id="againBtn" class="font-mono text-[13px] bg-accent text-bg border border-accent font-semibold px-3.5 py-[9px] rounded-[9px] cursor-pointer">▶ Drill again</button></div>`;
  summaryEl.style.display = 'block';
  (document.getElementById('againBtn') as HTMLElement).onclick = startSession;
}

/* ---- suit chips ---- */
function renderSuitChips(): void {
  for (const b of suitChipEls) {
    const v = b.dataset.schip!;
    const on = v === 'all' ? activeSuits.size === 4 : activeSuits.has(v as Suit);
    b.classList.toggle('schip-on', on);
  }
}
function setSuits(spec: string): void {
  if (!spec || spec === 'all') activeSuits = new Set(SUITS);
  else {
    const picked = spec.split(',').filter((s) => SUITS.includes(s as Suit)) as Suit[];
    activeSuits = picked.length ? new Set(picked) : new Set(SUITS);
  }
  renderSuitChips();
}
/** Pure suit-chip transition: given the active set and the clicked chip, return the next active set.
    From the full deck a suit click SOLOS that suit (click ♦ → drill diamonds); within a subset it
    toggles membership so multi-suit blends stay reachable; emptying the set restores the full deck. */
export function nextSuitState(active: ReadonlySet<Suit>, clicked: string): Set<Suit> {
  if (clicked === 'all') return new Set(SUITS);
  const s = clicked as Suit;
  if (!SUITS.includes(s)) return new Set(active);
  if (active.size === SUITS.length) return new Set([s]);
  const next = new Set(active);
  if (next.has(s)) next.delete(s);
  else next.add(s);
  return next.size ? next : new Set(SUITS);
}

function toggleSuit(v: string): void {
  const before = activeSuits;
  activeSuits = nextSuitState(activeSuits, v);
  if (v !== 'all' && before.size === 1 && activeSuits.size === SUITS.length) showToast('All suits back in the pool');
  renderSuitChips();
  syncRepToFilter();
}

/* if the prompt on screen was dealt under an older filter, replace it with one that matches */
function syncRepToFilter(): void {
  if (!running || !cur || customPool) return;
  if (cur.cards.every((c) => activeSuits.has(c.suit))) return;
  nextRep();
}

/* ---- custom pool (e.g. "drill my slowest" from the dashboard) ---- */
function setCustomPool(pairs: PairRef[] | null): void {
  customPool = pairs && pairs.length ? pairs : null;
  customChip.style.display = customPool ? 'inline-flex' : 'none';
  if (customPool) customChipLabel.textContent = `custom pool · ${customPool.length} pairs`;
  modeSel.disabled = !!customPool;
  for (const b of suitChipEls) b.disabled = !!customPool;
}

export function drillPairs(pairs: PairRef[]): void {
  const valid = pairs.filter((p) => {
    const c = CARDS[p.card];
    return c && c.person && c.action && c.object;
  });
  if (!valid.length) {
    showToast('No drillable pairs');
    return;
  }
  if (running) endSession();
  setCustomPool(valid);
  setView('drill');
  startSession();
}

/* ---- Guide bridge: any [data-go] button presets the drill (suits+mode), switches, optionally starts ---- */
function setView(v: string): void {
  const A = (window as unknown as { Alpine?: { store(n: string): { view: string } } }).Alpine;
  if (A) A.store('ui').view = v;
}
function goToDrill(suit: string, mode: string, autostart: boolean): void {
  setCustomPool(null);
  if (mode) modeSel.value = mode;
  setSuits(suit || 'all');
  setView('drill');
  if (autostart) {
    if (running) endSession();
    startSession();
  }
}

export function init(): void {
  stage = document.getElementById('drillStage') as HTMLElement;
  singleWrap = document.getElementById('singleWrap') as HTMLElement;
  flip = document.getElementById('flip') as HTMLElement;
  cardFront = document.getElementById('cardFront') as HTMLElement;
  cardBack = document.getElementById('cardBack') as HTMLElement;
  tripletRow = document.getElementById('tripletRow') as HTMLElement;
  tFlips = [0, 1, 2].map((i) => document.getElementById('tflip' + i) as HTMLElement);
  tFronts = [0, 1, 2].map((i) => document.getElementById('tfront' + i) as HTMLElement);
  tBacks = [0, 1, 2].map((i) => document.getElementById('tback' + i) as HTMLElement);
  facetAsk = document.getElementById('facetAsk') as HTMLElement;
  deadbar = document.getElementById('deadbar') as HTMLElement;
  targetLabel = document.getElementById('targetLabel') as HTMLElement;
  revealPanel = document.getElementById('revealPanel') as HTMLElement;
  gradebar = document.getElementById('gradebar') as HTMLElement;
  latReadout = document.getElementById('latReadout') as HTMLElement;
  sessionbar = document.getElementById('sessionbar') as HTMLElement;
  summaryEl = document.getElementById('sessionSummary') as HTMLElement;
  startBtn = document.getElementById('startBtn') as HTMLElement;
  endBtn = document.getElementById('endBtn') as HTMLElement;
  undoBtn = document.getElementById('undoBtn') as HTMLElement;
  flagBtn = document.getElementById('flagBtn') as HTMLElement;
  modeSel = document.getElementById('mode') as HTMLSelectElement;
  sessTargetSel = document.getElementById('sessTarget') as HTMLSelectElement;
  customChip = document.getElementById('customChip') as HTMLElement;
  customChipLabel = document.getElementById('customChipLabel') as HTMLElement;
  suitChipEls = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-schip]'));

  startBtn.onclick = startSession;
  endBtn.onclick = endSession;
  undoBtn.onclick = undoLast;
  flagBtn.onclick = flagCurrent;
  (document.getElementById('customClear') as HTMLElement).onclick = () => setCustomPool(null);
  for (const b of suitChipEls) b.onclick = () => toggleSuit(b.dataset.schip!);
  renderSuitChips();
  gradebar.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => {
    b.onclick = () => grade(Number(b.dataset.g));
  });

  /* ---- keyboard: capture latency as FIRST line on Space ---- */
  window.addEventListener('keydown', (e) => {
    if (!session || !cur) return;
    if (e.code === 'Space') {
      if (!cur.answered && cur._lat == null) {
        cur._lat = performance.now() - clockStart; // <-- honest latency, before any DOM work
        e.preventDefault();
        reveal();
      } else e.preventDefault();
      return;
    }
    if (e.key === 'u' || e.key === 'U') {
      undoLast();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      flagCurrent();
      return;
    }
    if (cur._lat != null && !cur.answered) {
      if (e.key === '1') grade(1);
      else if (e.key === '2') grade(2);
      else if (e.key === '3') grade(3);
    }
  });

  // mobile: tap the card(s) to reveal
  flip.addEventListener('click', captureReveal);
  tripletRow.addEventListener('click', captureReveal);

  // Guide launch bridge (buttons live in GuideView; null-safe until present).
  document.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
    el.onclick = () => goToDrill(el.dataset.suit || 'all', el.dataset.mode || 'mixed', el.dataset.autostart === '1');
  });
  document.getElementById('guideEncodeBtn')?.addEventListener('click', () => setView('builder'));
  document.getElementById('guideDashBtn')?.addEventListener('click', () => setView('dash'));
  document.getElementById('pathDashBtn')?.addEventListener('click', () => setView('dash'));
  document.getElementById('pathDeckBtn')?.addEventListener('click', () => setView('deck'));
}

export const start = startSession;
export const end = endSession;
export const isRunning = (): boolean => running;
