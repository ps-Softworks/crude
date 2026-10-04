// Frühwarnzeichen (4.1, GDD §7.2): Die Zeitung zeigt Weltgrößen nie als Zahl,
// sondern als Meldung. Hier steht nur, WELCHE Meldung erscheint; wie sie klingt,
// steht in content/newspaper.yaml (Schlüssel world_…).

import type { WorldModelBalance } from './balance';
import type { Party, WorldState } from './world';

export const WORLD_HEADLINES = [
  'world_crash',
  'world_recovery',
  'world_war',
  'world_peace',
  'world_nationalization',
  'world_glut',
  'world_election_handel',
  'world_election_volksbund',
  'world_election_provinz',
  'world_credit_tight',
  'world_credit_easy',
  'world_mood_angry',
  'world_tension',
] as const;
export type WorldHeadline = (typeof WORLD_HEADLINES)[number];

const ELECTION: Record<Party, WorldHeadline> = {
  handel: 'world_election_handel',
  volksbund: 'world_election_volksbund',
  provinz: 'world_election_provinz',
};

/**
 * Höchstens eine Meldung aus der Welt: zuerst, was in der letzten Runde geschah
 * (Crash vor Krieg vor Frieden …), sonst ein Zustand jenseits der Schwellen aus
 * balance.yaml (worldModel.news). Ruhige Welt → keine Meldung.
 */
export function worldHeadline(world: WorldState | undefined, wb: WorldModelBalance): WorldHeadline | null {
  if (!world) return null;
  const n = world.news;
  if (n.includes('crash')) return 'world_crash';
  if (n.includes('war')) return 'world_war';
  if (n.includes('peace')) return 'world_peace';
  if (n.includes('nationalization')) return 'world_nationalization';
  if (n.includes('glut')) return 'world_glut';
  if (n.includes('election')) return ELECTION[world.government];
  if (n.includes('recovery')) return 'world_recovery';
  const s = wb.news;
  if (world.crash > 0 || world.credit <= s.creditTight) return 'world_credit_tight';
  if (world.credit >= s.creditEasy) return 'world_credit_easy';
  if (world.tension >= s.tensionHigh) return 'world_tension';
  if (world.mood <= s.moodAngry) return 'world_mood_angry';
  return null;
}
