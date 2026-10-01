# CLAUDE.md – Regeln für CRUDE

## Zusammenarbeit
- Antworte auf Deutsch.
- Philipp programmiert kaum selbst: Code schreibt Claude. Erkläre Änderungen kurz und verständlich, ohne Fachjargon-Wände.
- Vorgehen bei jedem Bau-Schritt: erst Plan zeigen, dann bauen, Tests schreiben, alle Tests laufen lassen, das Spiel starten.
- Nach jedem abgeschlossenen Schritt: Tests grün → Git-Commit mit klarer deutscher Nachricht (z. B. „1.1 Projekt aufgesetzt“).
- Subagents: Du darfst nach eigener Einschätzung Subagents deiner Wahl einsetzen (z. B. Explore, Plan, general-purpose), ohne vorher zu fragen – immer dann, wenn es sinnvoll ist und Tokens spart (z. B. breite Suchen, unabhängige Teilaufgaben parallel). Für Kleinigkeiten, die du direkt erledigen kannst, keine Subagents.

## Projektstand
- Aktuell Phase 0 (Fundament): noch kein Spielcode – nur Welt, Zahlen, Papierprototyp.
- Roadmap: https://claude.ai/code/artifact/900e1b6c-0788-449d-a682-0f06781fd49b

## Architektur (ab Phase 1, Details aus GDD §17 ergänzen)
- Stack: TypeScript, React, Vite, Vitest; später Electron + steamworks.js.
- `src/sim`: reine TypeScript-Simulation, kein React, kein DOM, deterministisch und testbar.
- `src/ui`: React-Oberfläche, liest den Zustand aus der Simulation, enthält keine Spielregeln.
- `content/`: Ereignisse, Figuren und Texte als YAML – kein Inhalt fest im Code.
- Jede Spielregel bekommt einen Test.
