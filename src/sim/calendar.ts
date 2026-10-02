// Kalender: jede Runde ist ein Quartal.

export const SEASONS = ['Frühjahr', 'Sommer', 'Herbst', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export function dateOf(state: { round: number; startYear: number }): { season: Season; year: number } {
  const index = state.round - 1;
  return { season: SEASONS[index % 4], year: state.startYear + Math.floor(index / 4) };
}

export function formatDate(state: { round: number; startYear: number }): string {
  const { season, year } = dateOf(state);
  return `${season} ${year}`;
}
