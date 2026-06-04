import { SUITS, RANKS, SEED, cardId, allCards, type Facet } from './data';

export interface CardRecord {
  id: string;
  suit: string;
  rank: string;
  person: string;
  action: string;
  object: string;
}

export interface LeitnerEntry {
  bucket: number;
  streak: number;
}

export interface Attempt {
  aid?: number;
  card: string;
  facet: Facet;
  latencyMs: number;
  grade: string;
  timestamp: number;
  session: string;
}

/* ---------------- IndexedDB ----------------
   Schema is byte-identical to the original prototype so existing data
   (and the `seeded` flag) carries over unchanged. */
export const DB = {
  _db: null as IDBDatabase | null,
  open(): Promise<void> {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('pao-speed', 1);
      rq.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('attempts')) {
          const a = db.createObjectStore('attempts', { keyPath: 'aid', autoIncrement: true });
          a.createIndex('byCardFacet', ['card', 'facet']);
          a.createIndex('bySession', 'session');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
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
export let LEITNER: Record<string, LeitnerEntry> = {}; // "id|facet" -> {bucket, streak}
export const KEY = (id: string, f: string): string => id + '|' + f;

export async function loadCards(): Promise<void> {
  const rows = await DB.getAll<CardRecord>('cards');
  CARDS = {};
  for (const c of allCards()) CARDS[c.id] = { ...c, person: '', action: '', object: '' };
  for (const r of rows) if (CARDS[r.id]) CARDS[r.id] = { ...CARDS[r.id], ...r };
  const lz = await DB.get<{ k: string; v: Record<string, LeitnerEntry> }>('meta', 'leitner');
  LEITNER = lz ? lz.v : {};
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
