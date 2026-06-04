import type { Alpine } from 'alpinejs';
import { DB, loadCards, applySeed, assignedCount, clearAll, saveCard, CARDS } from './lib/db';
import { SUITS, RANKS, cardId, type Suit } from './lib/data';
import { cardSVG } from './lib/svg';
import * as drill from './lib/drill';

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
  Alpine.store('ui', { view: 'drill' as 'drill' | 'builder' | 'dash' | 'guide' });

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
    _build() {
      const list: BuilderCard[] = [];
      for (const s of SUITS)
        for (const r of RANKS) {
          const c = CARDS[cardId(s, r)];
          list.push({ id: c.id, suit: s, rank: r, person: c.person, action: c.action, object: c.object });
        }
      this.cards = list;
    },
    init() {
      const rebuild = () => this._build();
      if ((Alpine.store('deck') as DeckStore).ready) rebuild();
      (this as unknown as AlpineWatch).$watch('$store.deck.ready', (v) => {
        if (v) rebuild();
      });
    },
    mini(card: BuilderCard): string {
      return cardSVG(card.suit, card.rank, { mini: true });
    },
    async save(card: BuilderCard, f: 'person' | 'action' | 'object') {
      CARDS[card.id][f] = (card[f] || '').trim();
      card[f] = CARDS[card.id][f];
      await saveCard(card.id);
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
    // Wire the vanilla drill engine now that the DOM and stores are ready.
    drill.init();
  })();
};
