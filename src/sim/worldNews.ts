// Frühwarnzeichen (4.1, GDD §7.2): Die Zeitung zeigt Weltgrößen nie als Zahl,
// sondern als Meldung. Hier steht nur, WELCHE Meldung erscheint; wie sie klingt,
// steht in content/newspaper.yaml (Schlüssel world_…).

import type { WorldModelBalance } from './balance';
import { pollLeader } from './politics';
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
  'world_reelected_handel',
  'world_reelected_volksbund',
  'world_reelected_provinz',
  'world_credit_tight',
  'world_credit_easy',
  'world_mood_angry',
  'world_tension',
  'world_poll_handel',
  'world_poll_volksbund',
  'world_poll_provinz',
] as const;
export type WorldHeadline = (typeof WORLD_HEADLINES)[number];

const ELECTION: Record<Party, WorldHeadline> = {
  handel: 'world_election_handel',
  volksbund: 'world_election_volksbund',
  provinz: 'world_election_provinz',
};

const POLL: Record<Party, WorldHeadline> = {
  handel: 'world_poll_handel',
  volksbund: 'world_poll_volksbund',
  provinz: 'world_poll_provinz',
};

const REELECTED: Record<Party, WorldHeadline> = {
  handel: 'world_reelected_handel',
  volksbund: 'world_reelected_volksbund',
  provinz: 'world_reelected_provinz',
};

/**
 * Große Weltereignisse: Sie stehen in der Zeitung vor den Meldungen aus Salt Hill,
 * damit die einzige Ankündigung eines Crashs oder Kriegs nie wegen Platzmangels fehlt.
 */
export const MAJOR_WORLD_HEADLINES: readonly WorldHeadline[] = ['world_crash', 'world_war', 'world_nationalization', 'world_glut'];

/**
 * Höchstens eine Meldung aus der Welt: zuerst, was in der letzten Runde geschah
 * (Crash vor Krieg vor Verstaatlichung vor Riesenfund vor Frieden …), sonst kurz vor der Wahl eine Umfrage (4.2),
 * sonst ein Zustand jenseits der Schwellen aus balance.yaml (worldModel.news). Ruhige Welt → keine Meldung.
 */
export function worldHeadline(world: WorldState | undefined, wb: WorldModelBalance): WorldHeadline | null {
  if (!world) return null;
  const n = world.news;
  if (n.includes('crash')) return 'world_crash';
  if (n.includes('war')) return 'world_war';
  if (n.includes('nationalization')) return 'world_nationalization';
  if (n.includes('glut')) return 'world_glut';
  if (n.includes('peace')) return 'world_peace';
  if (n.includes('election')) return ELECTION[world.government];
  if (n.includes('reelection')) return REELECTED[world.government];
  if (n.includes('recovery')) return 'world_recovery';
  const s = wb.news;
  // Umfrage (4.2): kurz vor der Wahl, wer vorn liegt – ein Frühwarnzeichen wie volle Tanks.
  const umfrage = pollLeader(world, s.pollFrom);
  if (umfrage) return POLL[umfrage];
  if (world.crash > 0 || world.credit <= s.creditTight) return 'world_credit_tight';
  if (world.credit >= s.creditEasy) return 'world_credit_easy';
  if (world.tension >= s.tensionHigh) return 'world_tension';
  if (world.mood <= s.moodAngry) return 'world_mood_angry';
  return null;
}
