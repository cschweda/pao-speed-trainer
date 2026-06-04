// Static deck data, ported verbatim from the original prototype.

export type Suit = 'H' | 'S' | 'D' | 'C';
export type Facet = 'person' | 'action' | 'object';
export interface Card {
  suit: Suit;
  rank: string;
  id: string;
}

export const SUITS: Suit[] = ['H', 'S', 'D', 'C'];
export const RANKS: string[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export const SUIT_META: Record<Suit, { sym: string; color: 'red' | 'black'; cat: string }> = {
  H: { sym: '♥', color: 'red', cat: 'Musicians' },
  S: { sym: '♠', color: 'black', cat: 'Action heroes' },
  D: { sym: '♦', color: 'red', cat: 'TV / movie' },
  C: { sym: '♣', color: 'black', cat: 'Cartoons / toys' },
};

export const FACETS: Facet[] = ['person', 'action', 'object'];
export const FACET_LABEL: Record<Facet, string> = { person: 'PERSON', action: 'ACTION', object: 'OBJECT' };

export const SEED: Record<Suit, Record<string, [string, string, string]>> = {
  H: { A: ["Michael Jackson", "moonwalking", "a sequined glove"], K: ["Prince", "playing a guitar solo", "a purple guitar"], Q: ["Madonna", "vogueing", "a cone bra"], J: ["David Bowie", "striking a pose", "a lightning-bolt face"], "10": ["Freddie Mercury", "punching the air", "a half-mic stand"], "9": ["Cyndi Lauper", "spinning around", "neon-dyed hair"], "8": ["Boy George", "swaying", "a big floppy hat"], "7": ["Run-DMC", "crossing arms", "fat Adidas laces"], "6": ["Annie Lennox", "saluting", "an orange flattop"], "5": ["Axl Rose", "snake-dancing", "a bandana"], "4": ["Phil Collins", "drumming", "a drum kit"], "3": ["Debbie Harry", "pointing", "a zebra dress"], "2": ["Rick Astley", "finger-point dancing", "a trench coat"] },
  S: { A: ["Terminator", "cocking a shotgun", "sunglasses"], K: ["Rocky Balboa", "throwing a jab", "boxing gloves"], Q: ["Ellen Ripley", "firing a flamethrower", "a power loader"], J: ["Indiana Jones", "cracking a whip", "a fedora"], "10": ["John McClane", "crawling through a vent", "a white tank top"], "9": ["Rambo", "drawing a bowstring", "a headband"], "8": ["Mr. T", "flexing", "gold chains"], "7": ["Mad Max", "revving an engine", "a sawed-off shotgun"], "6": ["Snake Plissken", "sneering", "an eyepatch"], "5": ["Conan", "raising a sword", "a broadsword"], "4": ["RoboCop", "holstering a pistol", "a visor"], "3": ["Bruce Lee", "throwing a kick", "nunchucks"], "2": ["Evel Knievel", "jumping a ramp", "a star helmet"] },
  D: { A: ["Ferris Bueller", "lip-syncing on a float", "a red Ferrari"], K: ["Magnum P.I.", "driving fast", "a thick mustache"], Q: ["Princess Leia", "firing a blaster", "cinnamon-bun hair"], J: ["Marty McFly", "riding a hoverboard", "a DeLorean"], "10": ["E.T.", "pointing a glowing finger", "a glowing fingertip"], "9": ["The Fonz", "thumbs-up", "a leather jacket"], "8": ["MacGyver", "defusing a bomb", "a paperclip"], "7": ["Pee-wee Herman", "doing a tiny dance", "a red bow tie"], "6": ["Hannibal Smith", "lighting a cigar", "a cigar"], "5": ["Dr. Venkman", "blasting a proton stream", "a proton pack"], "4": ["Daniel-san", "doing the crane kick", "a headband"], "3": ["ALF", "chomping", "a furry snout"], "2": ["Gizmo", "singing", "big mogwai ears"] },
  C: { A: ["Pac-Man", "chomping", "a power pellet"], K: ["He-Man", "raising a sword", "Battle Cat"], Q: ["She-Ra", "lifting a sword skyward", "a tiara"], J: ["Optimus Prime", "transforming", "a truck grille"], "10": ["Mario", "jumping", "a mushroom"], "9": ["Donkey Kong", "throwing a barrel", "a barrel"], "8": ["Smurf", "painting", "a white floppy hat"], "7": ["Lion-O", "raising the Sword of Omens", "a claw shield"], "6": ["Strawberry Shortcake", "skipping", "a striped bonnet"], "5": ["Rubik's Cube", "twisting", "a Rubik's cube"], "4": ["G.I. Joe", "saluting", "a bazooka"], "3": ["Care Bear", "beaming a tummy ray", "a heart belly"], "2": ["My Little Pony", "prancing", "a rainbow mane"] },
};

export const cardId = (s: string, r: string): string => s + r;

export const allCards = (): Card[] => {
  const o: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) o.push({ suit: s, rank: r, id: cardId(s, r) });
  return o;
};
