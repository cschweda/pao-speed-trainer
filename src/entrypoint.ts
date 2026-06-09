import type { Alpine } from 'alpinejs';
import { DB, loadCards, applySeed, assignedCount, clearAll, saveCard, saveLeitner, CARDS, LEITNER, KEY, FLAGS, toggleFlag, type Attempt, type DeckRun } from './lib/db';
import { SUITS, RANKS, SUIT_META, cardId, type Suit } from './lib/data';
import { exportBackup, importBackup, printSheet } from './lib/backup';
import { drillPairs, type PairRef } from './lib/drill';
import { cardSVG } from './lib/svg';
import { computeDash } from './lib/dash';
import * as drill from './lib/drill';
import * as deckrun from './lib/deck';

interface DeckStore {
  ready: boolean;
  assigned: number;
  refresh(): void;
  readonly assignText: string;
}
interface ToastStore {
  visible: boolean;
  msg: string;
  _t: ReturnType<typeof setTimeout>;
  show(msg: string): void;
}
interface AlpineWatch {
  $watch(expr: string, cb: (v: unknown) => void): void;
}
interface BuilderCard {
  id: string;
  suit: Suit;
  rank: string;
  person: string;
  action: string;
  object: string;
}

export default (Alpine: Alpine) => {
  // ---- Stores ----
  Alpine.store('ui', { view: 'drill' as 'drill' | 'deck' | 'builder' | 'dash' | 'guide' });

  const toastStore: ToastStore = {
    visible: false,
    msg: '',
    _t: 0 as unknown as ReturnType<typeof setTimeout>,
    show(msg) {
      this.msg = msg;
      this.visible = true;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        this.visible = false;
      }, 2200);
    },
  };
  Alpine.store('toast', toastStore);

  const deckStore: DeckStore = {
    ready: false,
    assigned: 0,
    refresh() {
      this.assigned = assignedCount();
    },
    get assignText() {
      return this.assigned < 52 ? `${52 - this.assigned} cards unassigned` : 'all 52 assigned ✓';
    },
  };
  Alpine.store('deck', deckStore);

  // ---- Builder (Encode) component ----
  Alpine.data('builder', () => ({
    cards: [] as BuilderCard[],
    flagged: [] as string[],
    _build() {
      const list: BuilderCard[] = [];
      for (const s of SUITS)
        for (const r of RANKS) {
          const c = CARDS[cardId(s, r)];
          list.push({ id: c.id, suit: s, rank: r, person: c.person, action: c.action, object: c.object });
        }
      // cards flagged during a drill float to the top for rework
      list.sort((a, b) => Number(FLAGS.has(b.id)) - Number(FLAGS.has(a.id)));
      this.flagged = [...FLAGS];
      this.cards = list;
    },
    init() {
      const rebuild = () => this._build();
      if ((Alpine.store('deck') as DeckStore).ready) rebuild();
      (this as unknown as AlpineWatch).$watch('$store.deck.ready', (v) => {
        if (v) rebuild();
      });
      // re-sort on entry — flags may have changed mid-drill
      (this as unknown as AlpineWatch).$watch('$store.ui.view', (v) => {
        if (v === 'builder' && (Alpine.store('deck') as DeckStore).ready) rebuild();
      });
    },
    mini(card: BuilderCard): string {
      return cardSVG(card.suit, card.rank, { mini: true });
    },
    isFlagged(card: BuilderCard): boolean {
      return this.flagged.includes(card.id);
    },
    async unflag(card: BuilderCard) {
      await toggleFlag(card.id);
      this._build();
    },
    norm(s: string): string {
      return (s || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^(a|an|the) /, '');
    },
    // duplicate images across cards, per facet ("a headband" ≡ "headband")
    get lint(): { keys: Set<string>; list: { facet: string; text: string; cards: string[] }[] } {
      const keys = new Set<string>();
      const list: { facet: string; text: string; cards: string[] }[] = [];
      for (const f of ['person', 'action', 'object'] as const) {
        const by: Record<string, BuilderCard[]> = {};
        for (const c of this.cards) {
          const n = this.norm(c[f]);
          if (n) (by[n] = by[n] || []).push(c);
        }
        for (const cs of Object.values(by))
          if (cs.length > 1) {
            list.push({ facet: f, text: cs[0][f], cards: cs.map((c) => c.rank + SUIT_META[c.suit].sym) });
            for (const c of cs) keys.add(f + '|' + c.id);
          }
      }
      return { keys, list };
    },
    dupe(card: BuilderCard, f: 'person' | 'action' | 'object'): boolean {
      return this.lint.keys.has(f + '|' + card.id);
    },
    async save(card: BuilderCard, f: 'person' | 'action' | 'object') {
      const next = (card[f] || '').trim();
      const prev = CARDS[card.id][f];
      CARDS[card.id][f] = next;
      card[f] = next;
      await saveCard(card.id);
      if (prev !== next) {
        // a rewritten image is a new memory item — restart its schedule (both directions)
        delete LEITNER[KEY(card.id, f, 'fwd')];
        delete LEITNER[KEY(card.id, f, 'rev')];
        await saveLeitner();
      }
      (Alpine.store('deck') as DeckStore).refresh();
    },
    async seed() {
      if (assignedCount() > 0 && !confirm('Reset all 52 cards to the GenX defaults? This overwrites your current edits.')) return;
      await applySeed();
      this._build();
      (Alpine.store('deck') as DeckStore).refresh();
      (Alpine.store('toast') as ToastStore).show('GenX defaults loaded — edit freely');
    },
    async clear() {
      if (!confirm('Clear all P/A/O assignments? Your drill history is kept.')) return;
      await clearAll();
      this._build();
      (Alpine.store('deck') as DeckStore).refresh();
      (Alpine.store('toast') as ToastStore).show('Cleared');
    },
    async exportData() {
      await exportBackup();
      (Alpine.store('toast') as ToastStore).show('Backup downloaded');
    },
    async importData(e: Event) {
      const input = e.target as HTMLInputElement;
      const f = input.files && input.files[0];
      if (!f) return;
      if (confirm('Restore from backup? This REPLACES your encodings, scheduling, drill history, and deck runs.')) {
        try {
          const sum = await importBackup(f);
          this._build();
          (Alpine.store('deck') as DeckStore).refresh();
          (Alpine.store('toast') as ToastStore).show('Restored: ' + sum);
        } catch (err) {
          (Alpine.store('toast') as ToastStore).show('Import failed — ' + (err as Error).message);
        }
      }
      input.value = '';
    },
    print() {
      printSheet();
    },
  }));

  // ---- Dashboard (Progress) component ----
  Alpine.data('dash', () => ({
    statCards: '',
    trend: '',
    slowList: '',
    facetStats: '',
    bucketDist: '',
    habit: '',
    suitTable: '',
    deckStats: '',
    suit: '',
    days: '0',
    slowPairs: [] as PairRef[],
    async load() {
      const [all, runs] = await Promise.all([DB.getAll<Attempt>('attempts'), DB.getAll<DeckRun>('deckruns')]);
      const r = computeDash(all, runs, { suit: this.suit, days: Number(this.days) || 0 });
      this.statCards = r.statCardsHTML;
      this.trend = r.trendSVG;
      this.slowList = r.slowListHTML;
      this.facetStats = r.facetStatsHTML;
      this.bucketDist = r.bucketHTML;
      this.habit = r.habitHTML;
      this.suitTable = r.suitTableHTML;
      this.deckStats = r.deckHTML;
      this.slowPairs = r.slowPairs;
    },
    drillSlow() {
      drillPairs(this.slowPairs);
    },
    init() {
      (this as unknown as AlpineWatch).$watch('$store.ui.view', (v) => {
        if (v === 'dash') this.load();
      });
      if ((Alpine.store('ui') as { view: string }).view === 'dash') this.load();
    },
  }));

  // ---- Boot ----
  // Runs during alpine:init: stores are registered above and the DOM is parsed.
  (async () => {
    await DB.open();
    await loadCards();
    const seededFlag = await DB.get('meta', 'seeded');
    // First-ever launch with nothing assigned: auto-load the GenX starter set.
    if (assignedCount() === 0 && !seededFlag) {
      await applySeed();
      await DB.put('meta', { k: 'seeded', v: true });
      (Alpine.store('toast') as ToastStore).show('Loaded GenX defaults — edit any in the Encode tab');
    }
    const deck = Alpine.store('deck') as DeckStore;
    deck.ready = true;
    deck.refresh();
    // Wire the vanilla drill and deck engines now that the DOM and stores are ready.
    drill.init();
    deckrun.init();
    // Leaving a view aborts its live session — otherwise the global key
    // handlers keep acting on an invisible stage (and eat spaces typed
    // into Encode inputs).
    Alpine.effect(() => {
      const v = (Alpine.store('ui') as { view: string }).view;
      if (v !== 'drill' && drill.isRunning()) drill.end();
      if (v !== 'deck' && deckrun.isRunning()) deckrun.abort();
    });
  })();
};
