// Eigene Bestätigung im Spiel (0.4.20+1): window.confirm, alert und prompt sind im
// abgeschotteten iframe (Claude-Artefakt, itch.io) gesperrt und liefern dort einfach
// „nein“ – „Neues Spiel“ tat darum nichts. Die Tastenregel steht hier, ohne React testbar.

export type ConfirmKey = 'confirm' | 'cancel' | null;

/**
 * Was eine Taste in der offenen Rückfrage bewirkt: Esc bricht ab. Enter bestätigt nur,
 * wenn der Fokus nicht auf „Abbrechen“ liegt – dort löst Enter den Knopf selbst aus.
 */
export function confirmKey(key: string, focusOnCancel: boolean): ConfirmKey {
  if (key === 'Escape' || key === 'Esc') return 'cancel';
  if (key === 'Enter' && !focusOnCancel) return 'confirm';
  return null;
}
