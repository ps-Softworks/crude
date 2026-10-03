# Ereignisse schreiben – die Vorlage (Schritt 2.2)

Ein Ereignis ist eine Karte auf Jacobs Schreibtisch: Es passiert etwas, Jacob
entscheidet, das hat Folgen – manchmal sofort, manchmal Runden später.
**Für ein neues Ereignis braucht es keinen Code**, nur eine Textdatei.

## In drei Schritten ins Spiel

1. `docs/ereignis-beispiel.yaml` nach `content/events/` kopieren und umbenennen,
   z. B. `content/events/k1-6-salzwasser.yaml`. (Kapitel vorn im Namen hilft beim Ordnen.)
2. Texte ändern. Jede `id` muss im ganzen Spiel einmalig sein – also auch die
   kopierten `beispiel_…`-Namen ändern.
3. Im Terminal `npm run check:content`. „Inhalte in Ordnung“ heißt: Das Ereignis ist
   im Spiel. Sonst steht da **Datei, Zeile und was fehlt**, z. B.
   `content/events/k1-6-salzwasser.yaml:9: … „chance“ fehlt …`

Zum Ausprobieren: `npm run dev`, dann im Browser `?seed=abc&debug=1`.

## Die vier Teile eines Ereignisses

| Teil | Feld | Frage beim Schreiben |
|---|---|---|
| **Anlass** | `title`, `text`, `conditions`, `chance` | Wer steht vor Jacob, und warum gerade jetzt? |
| **Optionen** | `choices` (2–3 Stück, je `label`) | Was kann Jacob tun? Keine Option darf „offensichtlich richtig“ sein. |
| **Folgen** | `result`, `effects`, `requires` | Was passiert sofort – im Protokoll und in der Kasse? |
| **Nachwirkung** | `marks` → `marked`, `delay` | Was merkt sich die Welt, und wann kommt es zurück? |

### Anlass
- `title`: kurze Überschrift. `text`: 2–4 Sätze, konkret, mit Namen und Ort aus der
  Weltbibel (`docs/weltbibel.md`). Zeigen statt erklären: „Er hält den Hut in der Hand“
  statt „Er ist verzweifelt“.
- `conditions` (optional, alle müssen stimmen):
  `minRound`/`maxRound` (Runde 1–16 in Kapitel 1), `minCash`/`maxCash` ($),
  `minOilStock` (Barrel im Tank), `minProducingWells`/`maxProducingWells`, `minLeases`.
- `chance`: Chance je Runde zwischen 0 und 1 (0.3 = 30 %), sobald die Bedingungen stimmen.
- Ein Ereignis kommt höchstens einmal je Partie (`once: false` erlaubt Wiederholung).
  Pro Runde kommt höchstens ein neues Ereignis (Zahl in `content/balance.yaml`).

### Optionen
- 2–3 Wahlen unter `choices`, jede mit `id` und `label` (Knopftext; Kosten in Klammern nennen).
- `default: true` bei der Wahl, die gilt, wenn Jacob nicht antwortet – meist die
  bequemste oder schlechteste.
- `requires` sperrt einen Knopf, solange die Bedingung nicht stimmt (gleiche Namen wie
  bei `conditions`, z. B. `requires: { minCash: 200 }`).

### Folgen
- `result`: ein, zwei Sätze fürs Protokoll – was Jacob sieht, nicht was er fühlt.
- `effects` (optional, Zahlen werden addiert, minus = weniger):
  `cash` ($), `oilStock` (Barrel), `railTariff` ($ je Barrel Bahnfracht), `strength` (Kraft).
  Andere Folgen (Ruf, Beziehungen, Pachten) kommen mit späteren Schritten dazu;
  bis dahin trägt die Nachwirkung sie.

### Termine (ab 2.3)
- Jede Antwort kostet Zeit: `appointments` am Ereignis (Standard 1 Termin) oder an einer
  einzelnen Wahl (z. B. `appointments: 0` für „abwinken“, 2 für eine Feldinspektion,
  2–3 für eine Reise – Richtwerte aus GDD §3). Jacob hat 5 Termine je Runde, mit
  Überstunden bis zu 7; jede Überstunde kostet Kraft.
- Kraft ändert `effects: { strength: 5 }` (Familie, Ruhe: plus; Reisen, Krisen: minus).
  `conditions: { maxStrength: 60 }` lässt ein Ereignis nur kommen, wenn Jacob müde ist.
- `routine: true` macht einen **festen Termin**: kein Würfeln, er steht jede Runde im
  Terminkalender (Beispiele in `content/events/k1-termine.yaml`).

### Nachwirkung
- `marks: [name]` an einer Wahl setzt ein **Merkzeichen**. Der Spieler sieht es nicht.
- Ein späteres Ereignis mit `marked: [name]` kommt **nur**, wenn das Merkzeichen gesetzt
  ist, und frühestens `delay` Runden danach (Standard 1).
- `notMarked: [name]` heißt umgekehrt: kommt nur, wenn das Merkzeichen **nicht** gesetzt ist.
- Merkzeichen gelten für die ganze Partie und sind für spätere Kapitel gedacht
  (z. B. `moss_betrogen` → Daniel Moss in Kapitel 3).
- Tippfehler fallen auf: Wartet ein Ereignis auf ein Merkzeichen, das keine Wahl setzt,
  meldet `npm run check:content` den Fehler.
- Namen: `figur_was` – z. B. `moss_fair`, `silas_gedeckt`, `vale_geld`.

## Ton (aus der Weltbibel)
- Westmark ist erfunden, an die USA um 1890 angelehnt. Keine echten Orte oder Personen.
- Kurze Sätze, trockener Ton, kein Moralisieren. Die Figuren haben Ziele und Ängste –
  das Ereignis zeigt eins davon.
- Jacob ist kein Held und kein Schurke; jede Option soll für irgendwen vernünftig sein.

## Die Probe-Ereignisse für Kapitel 1
`content/events/k1-…yaml` – Entwürfe von Claude, bitte in eigener Stimme umschreiben:

| Datei | Ereignis | Nachwirkung |
|---|---|---|
| `k1-1-ruth-buecher` | Ruth will die Bücher führen | `ruth_buchhalterin` / `ruth_beiseite` (für später) |
| `k1-2-silas-schnaps` | Silas betrunken, Seil gerissen | `silas_gedeckt` / `silas_gedemuetigt` (für später) |
| `k1-3-moss-schulden` | Ezekiel Moss braucht 300 $ | `moss_wagenweg` (betrogen) oder `moss_dank` (fair) |
| `k1-4-nora-brand` | Nora Whitlock nach dem Brand | `nora_ehrlich` / `nora_bestechung` / `nora_abgewiesen` |
| `k1-5-vale-umschlag` | 500 $ „von einem Freund“ | `vale_geld` / `vale_abgelehnt` (für später) |

Erfunden und nicht in der Weltbibel: Krämer Pell, der *Port Ellis Courier*, Nachbarin/Witwe Pruitt.
