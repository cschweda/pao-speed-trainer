/* ====================== BACKUP / RESTORE / PRINT ======================
   Everything lives in IndexedDB; one cleared site-data wipes months of
   encodings and history. Export is a single self-describing JSON file. */
import { DB, CARDS, LEITNER, FLAGS, loadCards, type CardRecord, type Attempt, type DeckRun, type LeitnerEntry } from './db';
import { SUITS, RANKS, SUIT_META, cardId, type Suit } from './data';

interface Backup {
  app: 'pao-speed-trainer';
  version: number;
  exportedAt: string;
  cards: CardRecord[];
  leitner: Record<string, LeitnerEntry>;
  flags: string[];
  attempts: Attempt[];
  deckruns: DeckRun[];
}

export async function exportBackup(): Promise<void> {
  const [attempts, deckruns] = await Promise.all([DB.getAll<Attempt>('attempts'), DB.getAll<DeckRun>('deckruns')]);
  const data: Backup = {
    app: 'pao-speed-trainer',
    version: 2,
    exportedAt: new Date().toISOString(),
    cards: Object.values(CARDS),
    leitner: LEITNER,
    flags: [...FLAGS],
    attempts,
    deckruns,
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pao-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Full restore — replaces encodings, scheduling, flags, attempts, and deck runs. */
export async function importBackup(file: File): Promise<string> {
  let j: Backup;
  try {
    j = JSON.parse(await file.text());
  } catch {
    throw new Error('Not valid JSON');
  }
  if (!j || j.app !== 'pao-speed-trainer' || !Array.isArray(j.cards)) throw new Error('Not a PAO trainer backup file');
  const validIds = new Set<string>();
  for (const s of SUITS) for (const r of RANKS) validIds.add(cardId(s, r));

  await DB.clear('cards');
  await DB.putAll('cards', j.cards.filter((c) => c && validIds.has(c.id)));
  await DB.put('meta', { k: 'leitner', v: j.leitner || {} });
  await DB.put('meta', { k: 'flags', v: Array.isArray(j.flags) ? j.flags : [] });
  await DB.put('meta', { k: 'seeded', v: true });
  await DB.clear('attempts');
  await DB.putAll('attempts', Array.isArray(j.attempts) ? j.attempts : []);
  await DB.clear('deckruns');
  await DB.putAll('deckruns', Array.isArray(j.deckruns) ? j.deckruns : []);
  await loadCards(); // refresh in-memory CARDS / LEITNER / FLAGS
  return `${j.cards.length} cards · ${(j.attempts || []).length} attempts · ${(j.deckruns || []).length} deck runs`;
}

/** Open a print-friendly reference sheet of the full PAO list. */
export function printSheet(): void {
  const esch = (s: string): string => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sections = SUITS.map((s: Suit) => {
    const rows = RANKS.map((r) => {
      const c = CARDS[cardId(s, r)];
      return `<tr><td class="c">${r}${SUIT_META[s].sym}</td><td>${esch(c.person)}</td><td>${esch(c.action)}</td><td>${esch(c.object)}</td></tr>`;
    }).join('');
    return `<h2>${SUIT_META[s].sym} ${SUIT_META[s].cat}</h2>
      <table><tr><th>Card</th><th>Person</th><th>Action</th><th>Object</th></tr>${rows}</table>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PAO reference sheet</title>
    <style>
      body{font:12px/1.5 -apple-system,system-ui,sans-serif;color:#111;margin:24px;}
      h1{font-size:16px;margin:0 0 2px;} .sub{color:#666;font-size:11px;margin:0 0 14px;}
      h2{font-size:13px;margin:14px 0 4px;page-break-after:avoid;}
      table{border-collapse:collapse;width:100%;} th,td{border:1px solid #bbb;padding:3px 7px;text-align:left;font-size:11.5px;}
      th{background:#eee;} .c{font-weight:700;white-space:nowrap;width:42px;}
      @media print{ h2{margin-top:10px;} }
    </style></head><body>
    <h1>PAO reference sheet</h1><p class="sub">printed ${new Date().toLocaleDateString()} — pao-speed-trainer</p>
    ${sections}</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
