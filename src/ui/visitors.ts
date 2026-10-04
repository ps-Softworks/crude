// Besucher und Szenen (0.2.15+10): Welche Ereignisse als Person vor dem
// Schreibtisch stehen (Feld „visitor“ in content/events) und welche als
// Vollbild-Szene kommen („tableau: true“). Reine Zuordnung für die Darstellung –
// was eine Antwort bewirkt, entscheidet weiter resolveEvent in src/sim.

import type { EventDef } from '../sim/events';
import { localize } from '../sim/i18n';
import type { FigureCatalog } from './figures';
import type { Appearance } from './inbox';

/** Auftritt je Ereignis-id – nur für Ereignisse mit „visitor“ oder „tableau“. */
export function appearancesOf(catalog: readonly EventDef[], figures: FigureCatalog): Record<string, Appearance> {
  const result: Record<string, Appearance> = {};
  for (const e of catalog) {
    if (e.tableau) result[e.id] = { kind: 'tableau' };
    else if (e.visitor) result[e.id] = { kind: 'visitor', figure: e.visitor, name: figures.names[e.visitor] ?? e.visitor };
  }
  return result;
}

/**
 * Prüft die Besetzung (für Tests und npm run check:content): Jede Figur aus
 * „visitor“ steht in content/figures.yaml und hat einen Namen; Briefe und feste
 * Termine haben keinen Auftritt (das prüft auch schon der Ereignis-Leser).
 */
export function visitorErrors(catalog: readonly EventDef[], figures: FigureCatalog): string[] {
  const fehler: string[] = [];
  for (const e of catalog) {
    if ((e.visitor || e.tableau) && (e.mail || e.routine)) fehler.push(`Ereignis „${e.id}“: Briefe und feste Termine haben keinen Auftritt.`);
    if (!e.visitor) continue;
    if (!(e.visitor in figures.forms)) fehler.push(`Ereignis „${e.id}“: Besucher „${e.visitor}“ fehlt in content/figures.yaml.`);
    else if (!figures.names[e.visitor]) fehler.push(`Ereignis „${e.id}“: Besucher „${e.visitor}“ braucht in content/figures.yaml einen Namen ({ form: …, name: … }).`);
  }
  return fehler;
}

/** Der Nachsatz nach einer Antwort: der „result“-Text der gewählten Wahl. */
export function resultText(catalog: readonly EventDef[], eventId: string, choiceId: string): string | null {
  const choice = catalog.find((e) => e.id === eventId)?.choices.find((c) => c.id === choiceId);
  return choice ? localize(choice.result) : null;
}

/** „Silas wartet“, „Silas und 2 weitere warten“ – für die Plakette an der Tür. */
export function waitingText(names: readonly string[]): string {
  if (names.length === 0) return 'Niemand wartet';
  if (names.length === 1) return `${names[0]} wartet`;
  const rest = names.length - 1;
  return `${names[0]} und ${rest === 1 ? 'ein weiterer' : `${rest} weitere`} warten`;
}
