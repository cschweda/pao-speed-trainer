import { SUITS, RANKS, SEED, cardId, allCards, type Facet } from './data';

export interface CardRecord {
  id: string;
  suit: string;
  rank: string;
  person: string;
  action: string;
  object: string;
}

/** Drill direction: card→image (fwd), image→card (rev), 3-card triplet fusion. */
export type Dir = 'fwd' | 'rev' | 'fusion';

export interface LeitnerEntry {
  bucket: number;
  streak: number;
  lastAt?: number; // timestamp of this pair's most recent graded rep
  due?: number; // timestamp when the pair is next due (bucket interval)
}

export interface Attempt {
  aid?: number;
  card: string; // single id, or 'QH+JS+4C' for fusion triplets
  facet: Facet | 'triplet';
  dir?: Dir; // absent on legacy rows = 'fwd'
  latencyMs: number;
  grade: string;
  timestamp: number;
  session: string;
}

export interface DeckRun {
  rid?: number;
  timestamp: number;
  stack?: string; // 'random' (default) | 'mnemonica' | 'aronson' | 'stebbins' | 'custom'
  memMs: number; // memorize phase: first paint → last keypress
  recallMs: number;
  correct: number;
  total: number;
  firstError: number; // 0-based position of first wrong card, -1 if perfect
  splits: number[]; // per-group memorize times
  order: string[]; // dealt order
  answer: string[]; // user-entered order
}

/* ---------------- IndexedDB ----------------
   v1 schema is byte-identical to the original prototype so existing data
   (and the `seeded` flag) carries over unchanged. v2 adds `deckruns`. */
export const DB = {
  _db: null as IDBDatabase | null,
  open(): Promise<void> {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('pao-speed', 2);
      rq.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('attempts')) {
          const a = db.createObjectStore('attempts', { keyPath: 'aid', autoIncrement: true });
          a.createIndex('byCardFacet', ['card', 'facet']);
          a.createIndex('bySession', 'session');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('deckruns')) db.createObjectStore('deckruns', { keyPath: 'rid', autoIncrement: true });
      };
      rq.onsuccess = (e) => {
        this._db = (e.target as IDBOpenDBRequest).result;
        res();
      };
      rq.onerror = (e) => rej(e);
    });
  },
  tx(store: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    return this._db!.transaction(store, mode).objectStore(store);
  },
  getAll<T = any>(store: string): Promise<T[]> {
    return new Promise((res, rej) => {
      const r = this.tx(store).getAll();
      r.onsuccess = () => res(r.result as T[]);
      r.onerror = () => rej(r.error);
    });
  },
  get<T = any>(store: string, k: IDBValidKey): Promise<T | undefined> {
    return new Promise((res, rej) => {
      const r = this.tx(store).get(k);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror = () => rej(r.error);
    });
  },
  put(store: string, v: any): Promise<IDBValidKey> {
    return new Promise((res, rej) => {
      const r = this.tx(store, 'readwrite').put(v);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  delete(store: string, k: IDBValidKey): Promise<void> {
    return new Promise((res, rej) => {
      const r = this.tx(store, 'readwrite').delete(k);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },
  // bulk write in a single transaction (imports would crawl one-tx-per-row)
  putAll(store: string, rows: any[]): Promise<void> {
    return new Promise((res, rej) => {
      const t = this._db!.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      for (const r of rows) os.put(r);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
  clear(store: string): Promise<void> {
    return new Promise((res, rej) => {
      const r = this.tx(store, 'readwrite').clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },
};

/* ---------------- State ---------------- */
export let CARDS: Record<string, CardRecord> = {}; // id -> {id,suit,rank,person,action,object}
export let LEITNER: Record<string, LeitnerEntry> = {}; // key -> {bucket, streak, lastAt?, due?}
export let FLAGS: Set<string> = new Set(); // card ids flagged for re-encoding
// Forward keys stay "id|facet" so pre-existing Leitner state carries over; reverse is its own item.
export const KEY = (id: string, f: string, dir: Dir = 'fwd'): string => (dir === 'rev' ? id + '|' + f + '|rev' : id + '|' + f);

export async function loadCards(): Promise<void> {
  const rows = await DB.getAll<CardRecord>('cards');
  CARDS = {};
  for (const c of allCards()) CARDS[c.id] = { ...c, person: '', action: '', object: '' };
  for (const r of rows) if (CARDS[r.id]) CARDS[r.id] = { ...CARDS[r.id], ...r };
  const lz = await DB.get<{ k: string; v: Record<string, LeitnerEntry> }>('meta', 'leitner');
  LEITNER = lz ? lz.v : {};
  const fz = await DB.get<{ k: string; v: string[] }>('meta', 'flags');
  FLAGS = new Set(fz ? fz.v : []);
}

export async function saveFlags(): Promise<void> {
  await DB.put('meta', { k: 'flags', v: [...FLAGS] });
}

export async function toggleFlag(id: string): Promise<boolean> {
  const on = !FLAGS.has(id);
  if (on) FLAGS.add(id);
  else FLAGS.delete(id);
  await saveFlags();
  return on;
}

export async function saveCard(id: string): Promise<void> {
  const c = CARDS[id];
  await DB.put('cards', { id: c.id, suit: c.suit, rank: c.rank, person: c.person, action: c.action, object: c.object });
}

export async function saveLeitner(): Promise<void> {
  await DB.put('meta', { k: 'leitner', v: LEITNER });
}

export function assignedCount(): number {
  let n = 0;
  for (const id in CARDS) {
    const c = CARDS[id];
    if (c.person && c.action && c.object) n++;
  }
  return n;
}

export async function applySeed(): Promise<void> {
  for (const s of SUITS)
    for (const r of RANKS) {
      const [p, a, o] = SEED[s][r];
      const id = cardId(s, r);
      CARDS[id].person = p;
      CARDS[id].action = a;
      CARDS[id].object = o;
      await saveCard(id);
    }
}

export async function clearAll(): Promise<void> {
  for (const id in CARDS) {
    CARDS[id].person = CARDS[id].action = CARDS[id].object = '';
    await saveCard(id);
  }
}
