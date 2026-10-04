// Ruf (4.12, GDD §4): vier Achsen – Öffentlichkeit, Politik, Arbeiter, Branche (geteilt in
// Respekt und Furcht) –, dazu der Stand in der Gesellschaft. Intern −100 … 100, für den Spieler
// nur als Wort. Eigene kleine Datei ohne Abhängigkeiten, damit jedes System den Ruf lesen kann
// (Marke, Gericht, Förderung, Diplomatie). Ändern tun ihn die Systemwirkungen der Ereignisse
// (src/sim/eventSystems.ts, Wirkung „reputation“).

export const REPUTATION_AXES = ['public', 'politics', 'workers', 'industryRespect', 'industryFear', 'standing'] as const;
export type ReputationAxis = (typeof REPUTATION_AXES)[number];
export type Reputation = Record<ReputationAxis, number>;

export const NEUTRAL_REPUTATION: Reputation = { public: 0, politics: 0, workers: 0, industryRespect: 0, industryFear: 0, standing: 0 };

function endlich(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Ruf auf einer Achse (−100…100); ohne Ruf-Zustand (Kapitel 1, alte Spielstände) 0. */
export function reputationOf(state: object, axis: ReputationAxis): number {
  const r = (state as { reputation?: Partial<Record<string, unknown>> }).reputation;
  const v = r?.[axis];
  return endlich(v) ? Math.max(-100, Math.min(100, v)) : 0;
}

/** Ruf als Wort (GDD §4): verhasst, misstrauisch, neutral, geachtet, verehrt. */
export const REPUTATION_WORDS = ['verhasst', 'misstrauisch', 'neutral', 'geachtet', 'verehrt'] as const;
export type ReputationWord = (typeof REPUTATION_WORDS)[number];

export function reputationWord(value: number): ReputationWord {
  if (value <= -50) return 'verhasst';
  if (value <= -15) return 'misstrauisch';
  if (value < 15) return 'neutral';
  if (value < 50) return 'geachtet';
  return 'verehrt';
}

/** Prüft state.reputation beim Laden (darf fehlen). */
export function validReputation(v: unknown): boolean {
  if (v === undefined) return true;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return Object.keys(r).every((k) => (REPUTATION_AXES as readonly string[]).includes(k) && endlich(r[k]));
}
