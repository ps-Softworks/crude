# CLAUDE.md – Regeln für CRUDE

## Zusammenarbeit
- Antworte auf Deutsch.
- Philipp programmiert kaum selbst: Code schreibt Claude. Erkläre Änderungen kurz und verständlich, ohne Fachjargon-Wände.
- Vorgehen bei jedem Bau-Schritt: erst Plan zeigen, dann bauen, Tests schreiben, alle Tests laufen lassen, das Spiel starten.
- Nach jedem abgeschlossenen Schritt: Tests grün → Git-Commit mit klarer deutscher Nachricht (z. B. „1.1 Projekt aufgesetzt“).
- Version: steht nur in `package.json`, das Spiel zeigt sie oben neben dem Titel. Schema `0.<Phase>.<Schritt>` nach der Roadmap (Schritt 1.4 → 0.1.4, Schritt 2.3 → 0.2.3); das fertige Spiel ist 1.0.0. Bei jedem abgeschlossenen Roadmap-Schritt oder größeren Änderung die Version im selben Commit anheben; Mini-Änderungen (Tippfehler, Kleinkram) ändern sie nicht. Größere Änderung außerhalb eines Schritts → Zähler anhängen (0.1.4 → 0.1.4+1 → 0.1.4+2), weil package.json keine vierte Ziffer erlaubt.
- Subagents: Du darfst nach eigener Einschätzung Subagents deiner Wahl einsetzen (z. B. Explore, Plan, general-purpose), ohne vorher zu fragen – immer dann, wenn es sinnvoll ist und Tokens spart (z. B. breite Suchen, unabhängige Teilaufgaben parallel). Für Kleinigkeiten, die du direkt erledigen kannst, keine Subagents.

## Projektstand
- Phase 0 abgeschlossen (Papierpartien 0.8/0.9 vorerst übersprungen). Phase 1 läuft: 1.1–1.13 fertig (zuletzt Speichern und Laden: der Spielstand liegt im localStorage und das Spiel macht dort weiter), als Nächstes 1.14 (siehe Roadmap).
- Spielzahlen stehen in `content/balance.yaml` (viele noch Platzhalter; Balance klärt sich mit 1.14/1.15).
- Starten: `npm run dev`; Debug-Ansicht über `?seed=abc&debug=1` in der Adresse (mit Seed startet immer eine frische Welt, ohne Seed der gespeicherte Stand).
- Roadmap: https://claude.ai/code/artifact/900e1b6c-0788-449d-a682-0f06781fd49b

## Architektur (ab Phase 1, Details aus GDD §17 ergänzen)
- Stack: TypeScript, React, Vite, Vitest; später Electron + steamworks.js.
- `src/sim`: reine TypeScript-Simulation, kein React, kein DOM, deterministisch und testbar.
- `src/ui`: React-Oberfläche, liest den Zustand aus der Simulation, enthält keine Spielregeln.
- `content/`: Ereignisse, Figuren und Texte als YAML – kein Inhalt fest im Code.
- Jede Spielregel bekommt einen Test.
