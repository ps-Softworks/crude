// Die drei Parteien der Föderation (GDD §7.1, Weltbibel „Parteien“). Eigene kleine
// Datei, damit Weltmodell (world.ts) und Gesetze (laws.ts) sie beide nutzen können,
// ohne sich gegenseitig zu laden.

export const PARTIES = ['handel', 'volksbund', 'provinz'] as const;
/** Handelspartei, Volksbund, Provinzliga (GDD §7.1). */
export type Party = (typeof PARTIES)[number];
