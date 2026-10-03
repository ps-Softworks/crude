# Ereignisse

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen und kommt automatisch ins Spiel –
ohne Codeänderung. Prüfen: `npm run check:content` (meldet Fehler mit Datei und Zeile).

- Anleitung zum Schreiben: `docs/ereignis-vorlage.md`
- Kommentiertes Beispiel zum Kopieren: `docs/ereignis-beispiel.yaml`

Kurzreferenz der Felder:
- Ereignis: `id`, `title`, `text`, `conditions`, `marked`, `notMarked`, `delay`, `chance`, `once`,
  `routine`, `appointments`, `choices`
- Wahl: `id`, `label`, `result`, `requires`, `effects`, `marks`, `default`, `appointments`
- Bedingungen: `minRound`, `maxRound`, `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100)
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft)
- Termine (2.3): `appointments` = Termine, die eine Antwort kostet (Standard 1; an einer Wahl
  überschreibt es den Wert des Ereignisses, z. B. `appointments: 0` für „abwinken“).
  Bleibt ein Ereignis liegen, gilt die Standard-Wahl und kostet keine Termine.
- Feste Termine: `routine: true` – nicht gewürfelt (`chance` darf fehlen), stehen jede Runde im
  Terminkalender, solange die Bedingungen stimmen; einmal je Runde; liegen lassen hat keine Folgen.
  Beispiele: `k1-termine.yaml`.
- Dateien werden alphabetisch gewürfelt, höchstens `events.maxPerRound` (balance.yaml) neue je Runde.
- Die Bots spielen (noch) ohne Ereignisse.
