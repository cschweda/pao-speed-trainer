/* ====================== DRILL ENGINE ======================
   Honest-latency-first vanilla logic. No framework indirection.
   Clock starts in rAF after prompt paint; stops as first line of keydown. */
import { CARDS, LEITNER, KEY, DB, saveLeitner } from './db';
import { quantile } from './stats';
import { cardSVG, cardBackSVG, esc } from './svg';
import { SUIT_META, FACETS, FACET_LABEL, allCards, type Card, type Facet } from './data';
import { showToast } from './toast';

interface Session {
  id: string;
  reps: number;
  instant: number;
  slow: number;
  missed: number;
  lat: number[];
}
interface Pick {
  card: Card;
  facet: Facet;
  w: number;
}
interface Cur extends Pick {
  deadline: number;
  answered: boolean;
  _lat?: number;
}

let session: Session | null = null;
let cur: Cur | null = null;
let clockStart = 0;
let deadlineRAF: number | null = null;

// Stage elements (assigned in init()).
let flip!: HTMLElement;
let cardFront!: HTMLElement;
let cardBack!: HTMLElement;
let facetAsk!: HTMLElement;
let deadbar!: HTMLElement;
let targetLabel!: HTMLElement;
let revealPanel!: HTMLElement;
let gradebar!: HTMLElement;
let latReadout!: HTMLElement;
let sessionbar!: HTMLElement;

function eligibleCards(): Card[] {
  const suit = (document.getElementById('suitFilter') as HTMLSelectElement).value;
  return allCards().filter((c) => {
    const cc = CARDS[c.id];
    if (!cc.person || !cc.action || !cc.object) return false;
    if (suit !== 'all' && c.suit !== suit) return false;
    return true;
  });
}
function facetsForMode(): Facet[] {
  const m = (document.getElementById('mode') as HTMLSelectElement).value;
  return m === 'mixed' ? FACETS : [m as Facet];
}

// rolling p75 from last 8 attempts of this (card,facet)
function p75For(card: string, facet: Facet): Promise<number | null> {
  const idx = DB.tx('attempts').index('byCardFacet');
  return new Promise((res) => {
    const out: number[] = [];
    const rq = idx.openCursor(IDBKeyRange.only([card, facet]), 'prev');
    rq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor && out.length < 8) {
        if (cursor.value.grade !== '3') out.push(cursor.value.latencyMs);
        cursor.continue();
      } else res(out.length >= 3 ? quantile(out, 0.75) : null);
    };
    rq.onerror = () => res(null);
  });
}
function bucketOf(id: string, f: Facet): number {
  const k = KEY(id, f);
  return LEITNER[k] ? LEITNER[k].bucket : 1;
}

// weighted pick: lower bucket => higher weight; skip "graduated" (bucket 5 streak) probabilistically
function pickRep(elig: Card[], facets: Facet[]): Pick {
  const pool: Pick[] = [];
  for (const c of elig)
    for (const f of facets) {
      const b = bucketOf(c.id, f);
      let w = Math.pow(2, 5 - b); // bucket1=16 ... bucket5=1
      if (b >= 5) w = 0.4; // graduated: rests, occasional refresh
      pool.push({ card: c, facet: f, w });
    }
  let tot = pool.reduce((s, x) => s + x.w, 0),
    r = Math.random() * tot;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return pool[pool.length - 1];
}

async function nextRep(): Promise<void> {
  clearAnim();
  const elig = eligibleCards();
  const facets = facetsForMode();
  if (!elig.length) {
    endSession();
    showToast('No fully-assigned cards match this filter');
    return;
  }
  const pick = pickRep(elig, facets);
  const p75 = await p75For(pick.card.id, pick.facet);
  const deadline = p75 ? Math.min(6000, Math.max(400, p75 * 0.9)) : 6000;
  cur = { ...pick, deadline, answered: false };

  // reset visuals BEFORE paint
  flip.classList.remove('flipped');
  gradebar.style.display = 'none';
  revealPanel.innerHTML = '<div class="font-mono text-[12px] text-dim text-center">— recall, then press <b>Space</b> —</div>';
  latReadout.textContent = '';
  facetAsk.textContent = FACET_LABEL[pick.facet] + '?';
  targetLabel.textContent = p75
    ? `target ≈ ${Math.round(deadline)}ms  (your p75 ${Math.round(p75)}ms)`
    : 'target — (calibrating)';
  cardFront.innerHTML = cardSVG(pick.card.suit, pick.card.rank, {});
  cardBack.innerHTML = cardBackSVG('', '');
  deadbar.style.transition = 'none';
  deadbar.style.transform = 'scaleX(1)';

  // CLOCK START: after the prompt card's first confirmed paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      clockStart = performance.now();
      // animate deadline bar
      deadbar.style.transition = `transform ${deadline}ms linear`;
      requestAnimationFrame(() => {
        deadbar.style.transform = 'scaleX(0)';
      });
    });
  });
}

function reveal(): void {
  if (!cur || cur.answered) return;
  // (latency already captured in keydown handler for Space)
  flip.classList.add('flipped');
  const c = CARDS[cur.card.id];
  const ans = c[cur.facet];
  const ctx = `${cur.card.rank}${SUIT_META[cur.card.suit].sym} · P:${c.person} · A:${c.action} · O:${c.object}`;
  cardBack.innerHTML = cardBackSVG(ans, FACET_LABEL[cur.facet]);
  revealPanel.innerHTML = `<div class="font-disp text-[30px] leading-[1.1]">${esc(ans)}</div><div class="font-mono text-[12px] text-muted mt-1.5">${esc(ctx)}</div>`;
  gradebar.style.display = 'flex';
  deadbar.style.transition = 'none';
}

async function grade(g: number): Promise<void> {
  if (!cur || cur.answered || cur._lat == null) return;
  const s = session;
  if (!s) return;
  cur.answered = true;
  const gradeStr = String(g);
  const lat = cur._lat;
  // persist attempt
  await DB.put('attempts', {
    card: cur.card.id,
    facet: cur.facet,
    latencyMs: Math.round(lat),
    grade: gradeStr,
    timestamp: Date.now(),
    session: s.id,
  });
  // leitner update
  const k = KEY(cur.card.id, cur.facet);
  const st = LEITNER[k] || { bucket: 1, streak: 0 };
  if (g === 1) {
    st.streak++;
    if (st.streak >= 2) {
      st.bucket = Math.min(5, st.bucket + 1);
      st.streak = 0;
    }
  } else if (g === 2) {
    st.streak = 0; /* hold */
  } else {
    st.bucket = 1;
    st.streak = 0;
  }
  LEITNER[k] = st;
  await saveLeitner();
  // session tally
  s.reps++;
  s.lat.push(lat);
  if (g === 1) s.instant++;
  if (g === 2) s.slow++;
  if (g === 3) s.missed++;
  const beat = lat <= cur.deadline;
  latReadout.innerHTML = `recall <b class="text-accent2">${Math.round(lat)}ms</b> ${beat ? '· beat target ✓' : '· over target'} · bucket ${st.bucket}`;
  updateSessionbar();
  setTimeout(nextRep, 260);
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
  if (deadlineRAF) cancelAnimationFrame(deadlineRAF);
}

function startSession(): void {
  const elig = eligibleCards();
  if (!elig.length) {
    showToast('Assign some cards first (Encode tab)');
    return;
  }
  session = { id: 's' + Date.now(), reps: 0, instant: 0, slow: 0, missed: 0, lat: [] };
  (document.getElementById('drillStage') as HTMLElement).style.display = 'flex';
  (document.getElementById('startBtn') as HTMLElement).style.display = 'none';
  (document.getElementById('endBtn') as HTMLElement).style.display = 'inline-block';
  updateSessionbar();
  nextRep();
}
function endSession(): void {
  (document.getElementById('drillStage') as HTMLElement).style.display = 'none';
  (document.getElementById('startBtn') as HTMLElement).style.display = 'inline-block';
  (document.getElementById('endBtn') as HTMLElement).style.display = 'none';
  cur = null;
  if (session && session.reps) showToast(`Session: ${session.reps} reps · median ${Math.round(quantile(session.lat, 0.5)!)}ms`);
}

// Guide: any [data-go] button presets the drill (suit+mode), switches to Drill, and auto-starts.
function setView(v: string): void {
  const A = (window as unknown as { Alpine?: { store(n: string): { view: string } } }).Alpine;
  if (A) A.store('ui').view = v;
}
function goToDrill(suit: string, mode: string, autostart: boolean): void {
  const modeEl = document.getElementById('mode') as HTMLSelectElement | null;
  const suitEl = document.getElementById('suitFilter') as HTMLSelectElement | null;
  if (mode && modeEl) modeEl.value = mode;
  if (suit && suitEl) suitEl.value = suit;
  setView('drill');
  if (autostart) {
    if (session) endSession();
    startSession();
  }
}

export function init(): void {
  flip = document.getElementById('flip') as HTMLElement;
  cardFront = document.getElementById('cardFront') as HTMLElement;
  cardBack = document.getElementById('cardBack') as HTMLElement;
  facetAsk = document.getElementById('facetAsk') as HTMLElement;
  deadbar = document.getElementById('deadbar') as HTMLElement;
  targetLabel = document.getElementById('targetLabel') as HTMLElement;
  revealPanel = document.getElementById('revealPanel') as HTMLElement;
  gradebar = document.getElementById('gradebar') as HTMLElement;
  latReadout = document.getElementById('latReadout') as HTMLElement;
  sessionbar = document.getElementById('sessionbar') as HTMLElement;

  (document.getElementById('startBtn') as HTMLElement).onclick = startSession;
  (document.getElementById('endBtn') as HTMLElement).onclick = endSession;
  gradebar.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => {
    b.onclick = () => grade(Number(b.dataset.g));
  });

  /* ---- keyboard: capture latency as FIRST line on Space ---- */
  window.addEventListener('keydown', (e) => {
    if (!session || !cur) return;
    if (e.code === 'Space') {
      if (!cur.answered && cur._lat == null && !flip.classList.contains('flipped')) {
        cur._lat = performance.now() - clockStart; // <-- honest latency, before any DOM work
        e.preventDefault();
        reveal();
      } else e.preventDefault();
      return;
    }
    if (flip.classList.contains('flipped') && !cur.answered) {
      if (e.key === '1') grade(1);
      else if (e.key === '2') grade(2);
      else if (e.key === '3') grade(3);
    }
  });

  // mobile: tap card to reveal
  flip.addEventListener('click', () => {
    if (cur && !cur.answered && cur._lat == null && !flip.classList.contains('flipped')) {
      cur._lat = performance.now() - clockStart;
      reveal();
    }
  });

  // Guide launch bridge (buttons live in GuideView; null-safe until present).
  document.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
    el.onclick = () => goToDrill(el.dataset.suit || 'all', el.dataset.mode || 'mixed', el.dataset.autostart === '1');
  });
  document.getElementById('guideEncodeBtn')?.addEventListener('click', () => setView('builder'));
  document.getElementById('guideDashBtn')?.addEventListener('click', () => setView('dash'));
  document.getElementById('pathDashBtn')?.addEventListener('click', () => setView('dash'));
}

export const start = startSession;
export const end = endSession;
