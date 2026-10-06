// Sprachschlüssel (2.1): Jeder Text aus content/ kommt als { de, en }. Deutsch
// ist Pflicht, Englisch darf vorerst leer sein – dann wird Deutsch gezeigt.
// So wird eine Übersetzung später Arbeit an den YAML-Dateien, kein Umbau.

export const LANGUAGES = ['de', 'en'] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Ein Text in allen Sprachen des Spiels. */
export type LocalizedText = Record<Lang, string>;

/** Die Sprache, in der das Spiel gerade läuft. Bis es eine Auswahl gibt: Deutsch. */
export const DEFAULT_LANG: Lang = 'de';

/** Der Text in der gewünschten Sprache; fehlt er dort, der deutsche. */
export function localize(text: LocalizedText, lang: Lang = DEFAULT_LANG): string {
  const value = text[lang];
  return value && value.trim() !== '' ? value : text.de;
}

/** Der Text in der gewünschten Sprache, Platzhalter wie {name} durch `values` ersetzt (unbekannte bleiben stehen). */
export function fillText(text: LocalizedText, values: Record<string, string | number> = {}, lang: Lang = DEFAULT_LANG): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => (values[key] !== undefined ? String(values[key]) : ganz));
}
