# CRUDE

Ein Öl-Tycoon mit Story: Man spielt Jacob Harlan und baut in der erfundenen Föderation Westmark (angelehnt an die USA um 1900) ein Ölimperium auf – mit riskanten Entscheidungen, Schulden und Krisen, die aus Politik und Ölindustrie entstehen. Ton ernst, Orientierung: *The Life and Suffering of Sir Brante*.

Ziel: kommerzieller Release auf Steam, PC zuerst.

## Dokumente

- Game Design Document + Entwicklungs-Roadmap: https://claude.ai/code/artifact/4acc1eda-ee3e-4ed2-9d85-657913bf86d1
- Roadmap bis Early Access (abhakbar): https://claude.ai/code/artifact/900e1b6c-0788-449d-a682-0f06781fd49b
- Konzeptüberblick: [docs/konzept-ueberblick.md](docs/konzept-ueberblick.md)
- Weltbibel (Schritt 0.5): [docs/weltbibel.md](docs/weltbibel.md)
- Tabellenmodell (Schritt 0.6): [docs/tabellenmodell.xlsx](docs/tabellenmodell.xlsx)
- Papierprototyp zum Ausdrucken (Schritt 0.7): [docs/papierprototyp.html](docs/papierprototyp.html)

## Technik (geplant ab Phase 1)

TypeScript + React + Vite, reine TS-Simulation, YAML-Inhalte, Vitest, Electron + steamworks.js.

Geplante Ordner: `src/sim` (Simulation), `src/ui` (Oberfläche), `content/` (YAML-Inhalte), `docs/` (Design).

## Desktop-Fassung (Schritt 2.14)

- `npm run desktop` – baut das Spiel und öffnet es in einem Electron-Fenster.
- `npm run desktop:win` – Windows-Fassung als ZIP: `release/desktop-<version>/CRUDE-<version>-windows-x64.zip`. Entpacken, `CRUDE.exe` starten; läuft ohne Internet. Auf dem Mac gebaut, ohne Installer und ohne Signatur (Windows zeigt beim ersten Start evtl. „Computer geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“).
- `npm run desktop:mac` – Mac-Fassung zum Testen: `release/desktop-<version>/mac-arm64/CRUDE.app`.
- Spielstände liegen als Datei im Benutzerordner: Windows `%APPDATA%\CRUDE\spielstaende\`, macOS `~/Library/Application Support/CRUDE/spielstaende/`. Im Browser bleibt es beim localStorage.
- Selbsttest: `CRUDE_SMOKE=1 release/desktop-<version>/mac-arm64/CRUDE.app/Contents/MacOS/CRUDE` startet die App, prüft Anzeige und Spielstand-Speicher und beendet sich.
- F12 öffnet die Entwicklerwerkzeuge (zum Fehlersuchen).
