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
  `minOilStock` (Barrel im Tank), `minProducingWells`/`maxProducingWells`, `minLeases`,
  `minChapter`/`maxChapter` (Kapitel; Ereignisse für spätere Kapitel immer mit beiden, z. B.
  `{ minChapter: 3, maxChapter: 3 }` – ohne Angabe im Spielstand gilt Kapitel 1). Ein Ereignis ohne
  `minChapter` gilt als Kapitel-1-Ereignis und kommt nach dem Zeitsprung nicht mehr.
  Ab Kapitel 2: `minRefineryLevel: 1` (eigene Raffinerie steht), `minPipelines: 1` (eigene Leitung
  läuft – kleine Pipeline oder Fernleitung), `minPublicShare: 1` (Harlan Oil ist Aktiengesellschaft).
- `chance`: Chance je Runde zwischen 0 und 1 (0.3 = 30 %), sobald die Bedingungen stimmen.
- Ein Ereignis kommt höchstens einmal je Partie (`once: false` erlaubt Wiederholung –
  frühestens nach `cooldown` Runden, Standard aus balance.yaml). Varianten desselben Anlasses
  bekommen dieselbe `group`, dann halten sie gemeinsam Abstand (2.10a).
- `draft: true` = Schlüsselszene, noch Entwurf (ändert nichts am Spiel).
  Pro Runde kommt höchstens ein neues Ereignis (Zahl in `content/balance.yaml`); welches zuerst
  gewürfelt wird, ist zufällig (2.10b). Muss etwas sicher kommen: `certain: true`.

### Optionen
- 2–3 Wahlen unter `choices`, jede mit `id` und `label` (Knopftext; Kosten in Klammern nennen).
- `default: true` bei der Wahl, die gilt, wenn Jacob nicht antwortet – meist die
  bequemste oder schlechteste.
- `requires` sperrt einen Knopf, solange die Bedingung nicht stimmt (gleiche Namen wie
  bei `conditions`, z. B. `requires: { minCash: 200 }`).

### Folgen
- `result`: ein, zwei Sätze fürs Protokoll – was Jacob sieht, nicht was er fühlt.
- `effects` (optional, Zahlen werden addiert, minus = weniger):
  `cash` ($), `oilStock` (Barrel), `railTariff` ($ je Barrel Bahnfracht), `strength` (Kraft),
  `ruth`/`thomas`/`clara` (Beziehung; `clara` wirkt erst ab Claras Geburt im Zeitsprung I), `teams`/`teamsIdle` (eigene Fuhrwerke). Befristet für
  `events.timedRounds` Runden (0.2.15+3): `price` ($ je Barrel beim Trust), `production`
  (Anteil der eigenen Förderung, 0,1 = +10 %), `leaseCost` (Anteil am Pachtbonus, −0,2 = 20 % billiger).
- Jede Antwort soll spürbar sein (0.2.15+3): `npm run check:events` listet alle Antworten mit
  ihrer Wirkung und meldet schwache – unter 200 $ Wirkung, ohne dauerhafte Folge und ohne
  Merkzeichen, das später etwas abfragt. Eine einzelne „lieber nicht“-Antwort neben einer
  starken ist erlaubt. Merkzeichen für spätere Kapitel stehen begründet in `content/relevance.yaml`.

### Termine (ab 2.3)
- Jede Antwort kostet Zeit: `appointments` am Ereignis (Standard 1 Termin) oder an einer
  einzelnen Wahl (z. B. `appointments: 0` für „abwinken“, 2 für eine Feldinspektion,
  2–3 für eine Reise – Richtwerte aus GDD §3). Jacob hat 5 Termine je Runde, mit
  Überstunden bis zu 7; jede Überstunde kostet Kraft.
- Kraft ändert `effects: { strength: 5 }` (Familie, Ruhe: plus; Reisen, Krisen: minus).
  `conditions: { maxStrength: 60 }` lässt ein Ereignis nur kommen, wenn Jacob müde ist.
- Kapitel und Alter (4.5): `minChapter`/`maxChapter` (z. B. `maxChapter: 1` für alles, was nur in
  die ersten Jahre passt – Pension, Taufe), `minThomasAge`/`maxThomasAge` (Thomas' Alter in ganzen
  Jahren; vor der Geburt −1). `minRound`/`maxRound` zählen ab dem Beginn des laufenden Kapitels.
- `mail: offer` (oder `demand`, `info`, `personal`) macht einen **Brief** für den Posteingang:
  Angebot, Forderung, Information oder Persönliches. Ein Brief bleibt ein paar Runden liegen
  (`deadline: 2` = zwei Runden; ohne Angabe gilt der Wert aus balance.yaml); in der letzten Runde
  trägt er ein rotes Siegel. Beispiele: `content/events/k1-post.yaml`.
- `document:` legt dem Brief ein **Dokument zum Prüfen** bei (2.5): `title` (z. B. Pachturkunde),
  `reference` (das Vergleichsstück, z. B. „dem Grundbuchauszug“) und `fields` mit `id`, `label`,
  `value` (echter Wert), `reference` (Wert im Vergleichsstück) und `forged` (so steht es da, wenn
  genau dieses Feld gefälscht ist). Ob gefälscht wird, würfelt das Spiel (`forgeryChance`, sonst
  balance.yaml). An der Wahl: `requiresFound: true` = geht nur nach gefundener Fälschung,
  `marksIfForged: [name]` = Merkzeichen nur, wenn das Dokument gefälscht war – damit kostet eine
  übersehene Fälschung später. Beispiele: `content/events/k1-dokumente.yaml`.
- `routine: true` macht einen **festen Termin**: kein Würfeln, er steht jede Runde im
  Terminkalender (Beispiele in `content/events/k1-termine.yaml`).

### Auftritt am Schreibtisch (ab 0.2.15+10)
- `visitor: silas` lässt das Ereignis als **Besuch** kommen: Die Person klopft an die Tür,
  tritt als Silhouette vor Jacobs Schreibtisch und redet mit ihm (Antworten wie immer).
  Die Figur muss in `content/figures.yaml` mit Namen stehen, z. B.
  `silas: { form: muetze, name: Silas }` – der Name steht an der Tür („Silas wartet“).
- `tableau: true` lässt es als **Vollbild-Szene** kommen (Geburt, Brand, Blitz, Sturm).
- Beides nur für Ereignisse ohne `mail` und ohne `routine` – Briefe liegen im Posteingang,
  feste Termine im Kalender. Alles andere hängt als Vorfall am Notizspieß.
- Das ist reine Darstellung: Was die Antworten bewirken, ändert sich dadurch nicht.
  `npm run check:content` prüft, dass jede Figur aus `visitor` einen Namen hat.

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
| `k1-2-silas` | Story-Bogen Silas (2.9): Seil, Abrechnung, Folgen | Ausgang in `content/arcs.yaml`: Freund, ausgekauft, versöhnt, verbittert, Kronzeuge |
| `k1-3-moss` | Story-Bogen Moss (2.9): Schulden, Bank, Daniel | Ausgang in `content/arcs.yaml`: Freund, Feind, Farm verloren |
| `k1-4-nora-brand` | Nora Whitlock nach dem Brand | `nora_ehrlich` / `nora_bestechung` / `nora_abgewiesen` |
| `k1-5-vale-umschlag` | 500 $ „von einem Freund“ | `vale_geld` / `vale_abgelehnt` (für später) |

Erfunden und nicht in der Weltbibel: Krämer Pell, der *Port Ellis Courier*, Nachbarin/Witwe Pruitt.
