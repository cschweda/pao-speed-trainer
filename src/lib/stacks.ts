/* ====================== MAGIC STACKS ======================
   Published memorized-deck orders, for deck runs and the stack quiz.
   Tokens are written rank-then-suit ("4C", "10S") for readability and
   converted to the app's suit-then-rank ids ("C4", "S10"). */
import { SUITS, RANKS, type Suit } from './data';

export interface StackInfo {
  name: string;
  ids: string[]; // app card ids, index 0 = position 1 (top)
}

/** "4C" / "10S" / "qh" → app id "C4" / "S10" / "HQ"; null if not a real card. */
export function tokenToId(tok: string): string | null {
  const t = tok.trim().toUpperCase();
  if (t.length < 2) return null;
  const suit = t.slice(-1) as Suit;
  const rank = t.slice(0, -1) === 'T' ? '10' : t.slice(0, -1);
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null;
  return suit + rank;
}

/** Parse a whole 52-card order; returns ids or a human-readable error. */
export function parseStack(text: string): { ids?: string[]; error?: string } {
  const toks = (text || '').trim().split(/[\s,;]+/).filter(Boolean);
  if (toks.length !== 52) return { error: `Need exactly 52 cards — got ${toks.length}` };
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const tok of toks) {
    const id = tokenToId(tok);
    if (!id) return { error: `"${tok}" isn't a card (use rank then suit, like 4C or 10S)` };
    if (seen.has(id)) return { error: `${tok.toUpperCase()} appears twice` };
    seen.add(id);
    ids.push(id);
  }
  return { ids };
}

const fromRaw = (raw: string): string[] => {
  const r = parseStack(raw);
  if (r.error) throw new Error('Bad built-in stack: ' + r.error);
  return r.ids!;
};

// Juan Tamariz — Mnemonica (verified against published order)
const MNEMONICA =
  '4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H 10C 5D KD 2C 3H 8D 5C KS JD 8C 10S KH JC 7S 10H AD 4S 7H 4D AC 9C JS QD 7C QS 10D 6C AH 9D';

// Simon Aronson (verified against published order; bottom card 9D)
const ARONSON =
  'JS KC 5C 2H 9S AS 3H 6C 8D AC 10S 5H 2D KD 7D 8C 3S AD 7S 5S QD AH 8S 3D 7H QH 5D 7C 4H KH 4D 10D JC JH 10C JD 4S 10H 6H 3C 2S 9H KS 6S 4C 8H 9C QS 6D QC 2C 9D';

// Si Stebbins: value +3 each card, suits cycling CHaSeD, starting A♣.
function siStebbins(): string[] {
  const suitCycle: Suit[] = ['C', 'H', 'S', 'D'];
  const seq = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ids: string[] = [];
  let v = 1;
  for (let i = 0; i < 52; i++) {
    ids.push(suitCycle[i % 4] + seq[v - 1]);
    v = ((v + 2) % 13) + 1; // +3 with 1-based wrap
  }
  return ids;
}

export const STACKS: Record<string, StackInfo> = {
  mnemonica: { name: 'Mnemonica', ids: fromRaw(MNEMONICA) },
  aronson: { name: 'Aronson', ids: fromRaw(ARONSON) },
  stebbins: { name: 'Si Stebbins', ids: siStebbins() },
};

export const stackName = (key: string | undefined): string => (key && STACKS[key] ? STACKS[key].name : key === 'custom' ? 'Custom stack' : 'Random');
