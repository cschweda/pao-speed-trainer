import type { Alpine } from 'alpinejs';
import { DB, loadCards, applySeed, assignedCount } from './lib/db';
import * as drill from './lib/drill';

export default (Alpine: Alpine) => {
  // ---- Stores ----
  Alpine.store('ui', {
    view: 'drill' as 'drill' | 'builder' | 'dash' | 'guide',
  });

  Alpine.store('toast', {
    visible: false,
    msg: '',
    _t: 0 as unknown as ReturnType<typeof setTimeout>,
    show(msg: string) {
      this.msg = msg;
      this.visible = true;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        this.visible = false;
      }, 2200);
    },
  });

  Alpine.store('deck', {
    ready: false,
    assigned: 0,
    refresh() {
      this.assigned = assignedCount();
    },
    get assignText(): string {
      return this.assigned < 52 ? `${52 - this.assigned} cards unassigned` : 'all 52 assigned ✓';
    },
  });

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
      (Alpine.store('toast') as { show(m: string): void }).show('Loaded GenX defaults — edit any in the Encode tab');
    }
    const deck = Alpine.store('deck') as { ready: boolean; refresh(): void };
    deck.ready = true;
    deck.refresh();
    // Wire the vanilla drill engine now that the DOM and stores are ready.
    drill.init();
  })();
};
