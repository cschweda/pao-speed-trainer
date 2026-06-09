/* ====================== DECK RUN ======================
   Full-deck simulation — the thing the drills train for.
   Memorize: a shuffled 52-card deck shown in groups of 3 (17 triplets + 1),
   self-paced. Timing is honest: each group's clock starts on its confirmed
   paint (double rAF) and stops as the first line of the advance handler.
   Recall: rebuild the deck order by clicking cards from a bank.
   Results: correct count, first error, error positions, slowest groups. */
import { DB, CARDS, type DeckRun } from './db';
import { cardSVG, esc } from './svg';
import { SUITS, RANKS, SUIT_META, allCards, cardId, type Card, type Suit } from './data';
import { STACKS, parseStack, stackName } from './stacks';
import { showToast } from './toast';

type Phase = 'idle' | 'mem' | 'recall' | 'done' | 'quiz';
let phase: Phase = 'idle';
let order: Card[] = [];
let groups: Card[][] = [];
let gi = 0;
let memStart = 0; // first group's paint
let groupPaint = 0; // current group's paint (0 = not yet painted)
let memEnd = 0;
let splits: number[] = [];
let recallStart = 0;
let recallEnd = 0;
let answer: string[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let runStack = 'random';

// stack quiz state
let quizOrder: Card[] = [];
let quizCur: { dir: 'p2c' | 'c2p'; pos: number } | null = null;
let quizT = 0;
let quizRevealed = false;
let quizTally = { n: 0, g1: 0, g2: 0, g3: 0 };

let idleEl!: HTMLElement;
let memEl!: HTMLElement;
let recallEl!: HTMLElement;
let doneEl!: HTMLElement;
let quizEl!: HTMLElement;
let memMeta!: HTMLElement;
let memGroup!: HTMLElement;
let recallMeta!: HTMLElement;
let recallSeq!: HTMLElement;
let recallBank!: HTMLElement;
let scoreBtn!: HTMLButtonElement;
let historyEl!: HTMLElement;
let stackSel!: HTMLSelectElement;
let customStack!: HTMLTextAreaElement;
let stackErr!: HTMLElement;
let quizPrompt!: HTMLElement;
let quizReveal!: HTMLElement;
let quizGrades!: HTMLElement;
let quizMeta!: HTMLElement;

const fmt = (ms: number): string => {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s` : `${s.toFixed(1)}s`;
};
const cardLabel = (id: string): string => {
  const c = { suit: id[0] as Card['suit'], rank: id.slice(1) };
  return c.rank + SUIT_META[c.suit].sym;
};
const suitColor = (id: string): string => (SUIT_META[id[0] as Card['suit']].color === 'red' ? 'var(--color-cardred)' : 'var(--color-ink)');

function shuffle<T>(a: T[]): T[] {
  const o = [...a];
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}

function show(p: Phase): void {
  phase = p;
  idleEl.style.display = p === 'idle' ? 'block' : 'none';
  memEl.style.display = p === 'mem' ? 'flex' : 'none';
  recallEl.style.display = p === 'recall' ? 'block' : 'none';
  doneEl.style.display = p === 'done' ? 'block' : 'none';
  quizEl.style.display = p === 'quiz' ? 'flex' : 'none';
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  if (p === 'mem' || p === 'recall') ticker = setInterval(tick, 100);
}

/* ---- order source ---- */
function stackIds(): string[] | null {
  const v = stackSel.value;
  stackErr.style.display = 'none';
  if (v === 'random') return null;
  if (v === 'custom') {
    const r = parseStack(customStack.value);
    if (r.error) {
      stackErr.textContent = '⚠ ' + r.error;
      stackErr.style.display = 'block';
      return null;
    }
    return r.ids!;
  }
  return STACKS[v] ? STACKS[v].ids : null;
}
const idToCard = (id: string): Card => ({ suit: id[0] as Suit, rank: id.slice(1), id });

function tick(): void {
  if (phase === 'mem' && memStart) {
    memMeta.innerHTML = `group <b class="text-ink">${gi + 1}/${groups.length}</b> · <b class="text-ink">${fmt(performance.now() - memStart)}</b>`;
  } else if (phase === 'recall') {
    recallMeta.innerHTML = `recall: <b class="text-ink">${answer.length}/52</b> placed · <b class="text-ink">${fmt(performance.now() - recallStart)}</b> · memorize took <b class="text-ink">${fmt(memEnd - memStart)}</b>`;
  }
}

/* ---------------- memorize ---------------- */
function startRun(): void {
  const v = stackSel.value;
  if (v !== 'random') {
    const ids = stackIds();
    if (!ids) return; // custom parse error already shown
    order = ids.map(idToCard);
    runStack = v;
  } else {
    order = shuffle(allCards());
    runStack = 'random';
  }
  groups = [];
  for (let i = 0; i < order.length; i += 3) groups.push(order.slice(i, i + 3));
  gi = 0;
  splits = [];
  memStart = 0;
  groupPaint = 0;
  answer = [];
  show('mem');
  renderGroup();
}

function renderGroup(): void {
  groupPaint = 0;
  memGroup.innerHTML = groups[gi]
    .map((c) => `<div class="cardbox w-[104px] min-[561px]:w-[150px] max-w-[28vw]">${cardSVG(c.suit, c.rank, {})}</div>`)
    .join('');
  memMeta.innerHTML = `group <b class="text-ink">${gi + 1}/${groups.length}</b>${memStart ? '' : ' · starts on first look'}`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      groupPaint = performance.now();
      if (!memStart) memStart = groupPaint;
    });
  });
}

function advance(): void {
  const t = performance.now(); // <-- first line: honest split, before any DOM work
  if (phase !== 'mem' || !groupPaint) return; // ignore until the group has painted
  splits.push(t - groupPaint);
  gi++;
  if (gi >= groups.length) {
    memEnd = t;
    startRecall();
  } else renderGroup();
}

/* ---------------- recall ---------------- */
function startRecall(): void {
  answer = [];
  recallEnd = 0;
  show('recall');
  recallBank.innerHTML = SUITS.map(
    (s) =>
      `<div class="flex items-center gap-1.5 flex-wrap"><span class="font-mono text-[13px] w-5 shrink-0" style="color:${
        SUIT_META[s].color === 'red' ? 'var(--color-cardred)' : 'var(--color-ink)'
      }">${SUIT_META[s].sym}</span>${RANKS.map(
        (r) =>
          `<button data-cid="${cardId(s, r)}" class="bankcard w-[44px] min-[561px]:w-[52px] bg-transparent border-0 p-0 cursor-pointer transition hover:-translate-y-0.5">${cardSVG(s, r, { mini: true })}</button>`
      ).join('')}</div>`
  ).join('');
  renderSeq();
  recallStart = performance.now();
}

function renderSeq(): void {
  recallSeq.innerHTML = answer.length
    ? answer
        .map(
          (id, i) =>
            `<span class="font-mono text-[12px] bg-surface2 border border-line rounded-[6px] px-1.5 py-[3px]"><span class="text-dim">${i + 1}</span> <b style="color:${suitColor(id)}">${cardLabel(id)}</b></span>`
        )
        .join('')
    : '<span class="font-mono text-[12px] text-dim">click cards below in the memorized order…</span>';
  scoreBtn.disabled = answer.length !== 52;
  tick();
}

function place(cid: string): void {
  if (phase !== 'recall' || answer.includes(cid)) return;
  answer.push(cid);
  const btn = recallBank.querySelector<HTMLButtonElement>(`[data-cid="${cid}"]`);
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.18';
  }
  if (answer.length === 52) recallEnd = performance.now();
  renderSeq();
}

function undoPlace(): void {
  if (phase !== 'recall' || !answer.length) return;
  const cid = answer.pop()!;
  const btn = recallBank.querySelector<HTMLButtonElement>(`[data-cid="${cid}"]`);
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '';
  }
  recallEnd = 0;
  renderSeq();
}

/* ---------------- score ---------------- */
async function score(): Promise<void> {
  if (answer.length !== 52) return;
  const memMs = Math.round(memEnd - memStart);
  const recallMs = Math.round((recallEnd || performance.now()) - recallStart);
  let correct = 0,
    firstError = -1;
  const errors: { pos: number; want: string; got: string }[] = [];
  order.forEach((c, i) => {
    if (answer[i] === c.id) correct++;
    else {
      if (firstError < 0) firstError = i;
      errors.push({ pos: i, want: c.id, got: answer[i] });
    }
  });
  const run: DeckRun = {
    timestamp: Date.now(),
    stack: runStack,
    memMs,
    recallMs,
    correct,
    total: 52,
    firstError,
    splits: splits.map((s) => Math.round(s)),
    order: order.map((c) => c.id),
    answer: [...answer],
  };
  await DB.put('deckruns', run);
  renderDone(run);
  show('done');
  renderHistory();
}

function renderDone(run: DeckRun): void {
  const perfect = run.correct === run.total;
  const slowest = run.splits
    .map((ms, i) => ({ ms, i }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3);
  const groupCards = (i: number): string =>
    run.order
      .slice(i * 3, i * 3 + 3)
      .map((id) => `<b style="color:${suitColor(id)}">${cardLabel(id)}</b>`)
      .join(' ');
  const errors = run.order
    .map((id, i) => ({ pos: i, want: id, got: run.answer[i] }))
    .filter((e) => e.want !== e.got);
  doneEl.innerHTML = `
    <div class="font-mono text-[12px] text-muted mb-3">order: <b class="text-ink">${esc(stackName(run.stack))}</b>${run.stack && run.stack !== 'random' && run.correct === run.total ? ' — <span class="text-instant">stack memorized at this pace ✓</span>' : ''}</div>
    <div class="grid gap-3 mb-[18px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      <div class="bg-surface border ${perfect ? 'border-[rgba(57,217,138,.5)]' : 'border-line'} rounded-xl p-4"><div class="font-disp text-[30px] ${perfect ? 'text-instant' : ''}">${run.correct}/${run.total}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">correct${perfect ? ' — perfect ✓' : ''}</div></div>
      <div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${fmt(run.memMs)}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">memorize time</div></div>
      <div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${(run.memMs / 1000 / run.total).toFixed(2)}s</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">per card</div></div>
      <div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${fmt(run.recallMs)}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">recall time</div></div>
      <div class="bg-surface border border-line rounded-xl p-4"><div class="font-disp text-[30px]">${run.firstError < 0 ? '—' : '#' + (run.firstError + 1)}</div><div class="font-mono text-[11px] text-muted uppercase tracking-[1px] mt-1">first error</div></div>
    </div>
    ${
      errors.length
        ? `<div class="bg-surface border border-line rounded-xl p-[18px] mb-[18px]"><h3 class="font-mono text-[13px] uppercase tracking-[1px] text-muted mt-0 mb-3">Errors — re-encode or re-drill these</h3><div class="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto font-mono text-[13px]">${errors
            .map(
              (e) =>
                `<div><span class="text-dim">#${e.pos + 1}</span> expected <b style="color:${suitColor(e.want)}">${cardLabel(e.want)}</b> <span class="text-dim">(${esc((CARDS[e.want] || {}).person || '—')})</span> · you placed <b style="color:${suitColor(e.got)}">${cardLabel(e.got)}</b></div>`
            )
            .join('')}</div></div>`
        : ''
    }
    <div class="bg-surface border border-line rounded-xl p-[18px] mb-[18px]"><h3 class="font-mono text-[13px] uppercase tracking-[1px] text-muted mt-0 mb-3">Slowest groups (memorize)</h3><div class="flex flex-col gap-1.5 font-mono text-[13px]">${slowest
      .map((s) => `<div><span class="text-dim">group ${s.i + 1}</span> ${groupCards(s.i)} — <b class="text-ink">${fmt(s.ms)}</b></div>`)
      .join('')}</div></div>
    <button id="deckAgainBtn" class="font-mono text-[13px] bg-accent text-bg border border-accent font-semibold px-3.5 py-[9px] rounded-[9px] cursor-pointer">▶ Run another deck</button>
    <button id="deckDoneBtn" class="font-mono text-[13px] bg-transparent text-ink border border-line px-3.5 py-[9px] rounded-[9px] cursor-pointer ml-2">Done</button>`;
  (doneEl.querySelector('#deckAgainBtn') as HTMLElement).onclick = startRun;
  (doneEl.querySelector('#deckDoneBtn') as HTMLElement).onclick = () => show('idle');
}

async function renderHistory(): Promise<void> {
  const runs = await DB.getAll<DeckRun>('deckruns');
  if (!runs.length) {
    historyEl.innerHTML = '<div class="text-dim font-mono text-[13px] text-center p-[30px]">No deck runs yet. This is the real test — try one.</div>';
    return;
  }
  runs.sort((a, b) => b.timestamp - a.timestamp);
  const best = [...runs].sort((a, b) => b.correct - a.correct || a.memMs - b.memMs)[0];
  const TH = 'text-left px-1.5 py-2 border-b border-line font-mono text-[11px] text-dim uppercase tracking-[.5px]';
  const TD = 'text-left px-1.5 py-2 border-b border-line font-mono';
  historyEl.innerHTML = `
    <div class="font-mono text-[12px] text-muted mb-2">best so far: <b class="text-ink">${best.correct}/52</b> at <b class="text-ink">${fmt(best.memMs)}</b> <span class="text-dim">(${esc(stackName(best.stack))})</span></div>
    <table class="w-full border-collapse text-[13px]"><tr><th class="${TH}">When</th><th class="${TH}">Order</th><th class="${TH}">Correct</th><th class="${TH}">Memorize</th><th class="${TH}">Per card</th><th class="${TH}">Recall</th></tr>${runs
      .slice(0, 10)
      .map(
        (r) =>
          `<tr><td class="${TD}">${new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td class="${TD} text-dim">${esc(stackName(r.stack))}</td><td class="${TD} ${r.correct === 52 ? 'text-instant' : ''}">${r.correct}/52</td><td class="${TD}">${fmt(r.memMs)}</td><td class="${TD}">${(r.memMs / 1000 / 52).toFixed(2)}s</td><td class="${TD}">${fmt(r.recallMs)}</td></tr>`
      )
      .join('')}</table>`;
}

/* ---------------- stack quiz: position ↔ card ----------------
   The skill that makes a memorized stack usable in performance.
   Self-graded like the drill; session tally only. */
function startQuiz(): void {
  const ids = stackIds();
  if (!ids) {
    if (stackSel.value === 'random') showToast('Pick a stack first — the quiz needs a fixed order');
    return;
  }
  quizOrder = ids.map(idToCard);
  quizTally = { n: 0, g1: 0, g2: 0, g3: 0 };
  quizMeta.textContent = `${stackName(stackSel.value)} · asked 0`;
  show('quiz');
  nextQuiz();
}

function nextQuiz(): void {
  quizRevealed = false;
  quizCur = { dir: Math.random() < 0.5 ? 'p2c' : 'c2p', pos: Math.floor(Math.random() * 52) };
  const c = quizOrder[quizCur.pos];
  quizPrompt.innerHTML =
    quizCur.dir === 'p2c'
      ? `<div class="font-mono text-[12px] text-muted uppercase tracking-[2px] mb-1.5">position → card</div><div class="font-disp text-[64px] leading-none">${quizCur.pos + 1}</div>`
      : `<div class="font-mono text-[12px] text-muted uppercase tracking-[2px] mb-1.5">card → position</div><div class="font-disp text-[52px] leading-none" style="color:${suitColor(c.id)}">${c.rank}${SUIT_META[c.suit].sym}</div>`;
  quizReveal.innerHTML = '<div class="font-mono text-[12px] text-dim">— recall, then press <b>Space</b> (or tap) —</div>';
  quizGrades.style.display = 'none';
  quizT = performance.now();
}

function revealQuiz(): void {
  if (phase !== 'quiz' || !quizCur || quizRevealed) return;
  const lat = Math.round(performance.now() - quizT);
  quizRevealed = true;
  const c = quizOrder[quizCur.pos];
  const prev = quizCur.pos > 0 ? quizOrder[quizCur.pos - 1] : null;
  const next = quizCur.pos < 51 ? quizOrder[quizCur.pos + 1] : null;
  const lbl = (x: Card | null): string => (x ? `<b style="color:${suitColor(x.id)}">${x.rank}${SUIT_META[x.suit].sym}</b>` : '—');
  const answerHTML =
    quizCur.dir === 'p2c'
      ? `<div class="font-disp text-[40px] leading-none" style="color:${suitColor(c.id)}">${c.rank}${SUIT_META[c.suit].sym}</div>`
      : `<div class="font-disp text-[40px] leading-none">#${quizCur.pos + 1}</div>`;
  quizReveal.innerHTML = `${answerHTML}
    <div class="font-mono text-[12px] text-muted mt-2">${lat}ms · neighbors: ${lbl(prev)} ← <span class="text-dim">#${quizCur.pos + 1}</span> → ${lbl(next)}</div>`;
  quizGrades.style.display = 'flex';
}

function gradeQuiz(g: number): void {
  if (phase !== 'quiz' || !quizCur || !quizRevealed) return;
  quizTally.n++;
  if (g === 1) quizTally.g1++;
  else if (g === 2) quizTally.g2++;
  else quizTally.g3++;
  quizMeta.innerHTML = `${stackName(stackSel.value)} · asked <b class="text-ink">${quizTally.n}</b> · <span class="text-instant">instant ${quizTally.g1}</span> · <span class="text-slow">slow ${quizTally.g2}</span> · <span class="text-miss">missed ${quizTally.g3}</span>`;
  setTimeout(nextQuiz, 220);
}

/* ---------------- wiring ---------------- */
export function init(): void {
  idleEl = document.getElementById('deckIdle') as HTMLElement;
  memEl = document.getElementById('deckMem') as HTMLElement;
  recallEl = document.getElementById('deckRecall') as HTMLElement;
  doneEl = document.getElementById('deckDone') as HTMLElement;
  quizEl = document.getElementById('deckQuiz') as HTMLElement;
  memMeta = document.getElementById('memMeta') as HTMLElement;
  memGroup = document.getElementById('memGroup') as HTMLElement;
  recallMeta = document.getElementById('recallMeta') as HTMLElement;
  recallSeq = document.getElementById('recallSeq') as HTMLElement;
  recallBank = document.getElementById('recallBank') as HTMLElement;
  scoreBtn = document.getElementById('recallScore') as HTMLButtonElement;
  historyEl = document.getElementById('deckHistory') as HTMLElement;
  stackSel = document.getElementById('stackSel') as HTMLSelectElement;
  customStack = document.getElementById('customStack') as HTMLTextAreaElement;
  stackErr = document.getElementById('stackErr') as HTMLElement;
  quizPrompt = document.getElementById('quizPrompt') as HTMLElement;
  quizReveal = document.getElementById('quizReveal') as HTMLElement;
  quizGrades = document.getElementById('quizGrades') as HTMLElement;
  quizMeta = document.getElementById('quizMeta') as HTMLElement;

  // order source: custom textarea persists across sessions
  DB.get<{ k: string; v: string }>('meta', 'customStack').then((r) => {
    if (r) customStack.value = r.v;
  });
  stackSel.onchange = () => {
    customStack.style.display = stackSel.value === 'custom' ? 'block' : 'none';
    stackErr.style.display = 'none';
  };
  customStack.onchange = () => {
    DB.put('meta', { k: 'customStack', v: customStack.value });
  };

  (document.getElementById('deckStartBtn') as HTMLElement).onclick = startRun;
  (document.getElementById('quizBtn') as HTMLElement).onclick = startQuiz;
  (document.getElementById('quizStop') as HTMLElement).onclick = () => show('idle');
  quizPrompt.addEventListener('click', revealQuiz);
  quizGrades.querySelectorAll<HTMLElement>('[data-qg]').forEach((b) => {
    b.onclick = () => gradeQuiz(Number(b.dataset.qg));
  });
  (document.getElementById('memAbort') as HTMLElement).onclick = () => show('idle');
  (document.getElementById('recallAbort') as HTMLElement).onclick = () => {
    show('idle');
    showToast('Run aborted — nothing saved');
  };
  (document.getElementById('recallUndo') as HTMLElement).onclick = undoPlace;
  scoreBtn.onclick = score;
  memGroup.addEventListener('click', advance);
  recallBank.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cid]');
    if (b && !(b as HTMLButtonElement).disabled) place(b.dataset.cid!);
  });

  window.addEventListener('keydown', (e) => {
    if (phase === 'mem') {
      if (e.code === 'Space' && !e.repeat) {
        advance(); // advance() captures its own timestamp first-line
        e.preventDefault();
      }
      return;
    }
    if (phase === 'quiz') {
      if (e.code === 'Space' && !e.repeat) {
        revealQuiz();
        e.preventDefault();
      } else if (quizRevealed && (e.key === '1' || e.key === '2' || e.key === '3')) {
        gradeQuiz(Number(e.key));
      }
    }
  });

  renderHistory();
}

export const isRunning = (): boolean => phase === 'mem' || phase === 'recall' || phase === 'quiz';
export const abort = (): void => show('idle');
