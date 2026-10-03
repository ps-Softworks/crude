# Ereignisse

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen und kommt automatisch ins Spiel –
ohne Codeänderung. Prüfen: `npm run check:content` (meldet Fehler mit Datei und Zeile).

- Anleitung zum Schreiben: `docs/ereignis-vorlage.md`
- Kommentiertes Beispiel zum Kopieren: `docs/ereignis-beispiel.yaml`

Kurzreferenz der Felder:
- Ereignis: `id`, `title`, `text`, `conditions`, `marked`, `notMarked`, `delay`, `chance`, `once`, `choices`
- Wahl: `id`, `label`, `result`, `requires`, `effects`, `marks`, `default`
- Bedingungen: `minRound`, `maxRound`, `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`
- Effekte: `cash`, `oilStock`, `railTariff`
- Dateien werden alphabetisch gewürfelt, höchstens `events.maxPerRound` (balance.yaml) neue je Runde.
- Die Bots spielen (noch) ohne Ereignisse.
