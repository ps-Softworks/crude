# Ereignisse (ab 2.1)

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen. Prüfen: `npm run check:content`
(meldet Fehler mit Datei und Zeile). Jeder Text hat `de` (Pflicht) und `en` (darf `""` sein).

```yaml
- id: kurzer_name            # Kleinbuchstaben, Ziffern, _ – einmalig über alle Dateien
  title: { de: "…", en: "" }
  text:  { de: "…", en: "" }
  conditions: { minRound: 2, maxCash: 1000 }   # optional, alle müssen stimmen
  chance: 0.3                # Chance je Runde (0–1), sobald die Bedingungen stimmen
  once: true                 # optional, Standard true: höchstens einmal je Partie
  choices:                   # mindestens eine
    - id: ja
      label:  { de: "Knopftext", en: "" }
      result: { de: "Text fürs Protokoll", en: "" }
      requires: { minCash: 200 }    # optional: sonst ist der Knopf gesperrt
      effects:  { cash: -200 }      # optional: wird addiert
      default: true                 # optional: gilt, wenn die Runde ohne Antwort endet
```

- **Bedingungen** (`conditions`, `requires`): `minRound`, `maxRound`, `minCash`, `maxCash`,
  `minOilStock`, `minProducingWells`, `maxProducingWells`, `minLeases`.
- **Effekte**: `cash` ($), `oilStock` (Barrel, nie unter 0), `railTariff` ($ je Barrel, nie unter 0).
- Ohne Antwort am Rundenende gilt die Wahl mit `default: true`, sonst die erste mögliche.
- Höchstens `events.maxPerRound` (balance.yaml) neue Ereignisse je Runde, in Datei-Reihenfolge gewürfelt.
- Die Bots spielen (noch) ohne Ereignisse.
