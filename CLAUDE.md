# CLAUDE.md – Regeln für CRUDE

## Zusammenarbeit
- Antworte auf Deutsch.
- Philipp programmiert kaum selbst: Code schreibt Claude. Erkläre Änderungen kurz und verständlich, ohne Fachjargon-Wände.
- Vorgehen bei jedem Bau-Schritt: erst Plan zeigen, dann bauen, Tests schreiben, alle Tests laufen lassen, das Spiel starten.
- Nach jedem abgeschlossenen Schritt: Tests grün → Git-Commit mit klarer deutscher Nachricht (z. B. „1.1 Projekt aufgesetzt“).
- Version: steht nur in `package.json`, das Spiel zeigt sie oben neben dem Titel. Schema `0.<Phase>.<Schritt>` nach der Roadmap (Schritt 1.4 → 0.1.4, Schritt 2.3 → 0.2.3); das fertige Spiel ist 1.0.0. Bei jedem abgeschlossenen Roadmap-Schritt oder größeren Änderung die Version im selben Commit anheben; Mini-Änderungen (Tippfehler, Kleinkram) ändern sie nicht. Größere Änderung außerhalb eines Schritts → Zähler anhängen (0.1.4 → 0.1.4+1 → 0.1.4+2), weil package.json keine vierte Ziffer erlaubt.
- Subagents: Du darfst nach eigener Einschätzung Subagents deiner Wahl einsetzen (z. B. Explore, Plan, general-purpose), ohne vorher zu fragen – immer dann, wenn es sinnvoll ist und Tokens spart (z. B. breite Suchen, unabhängige Teilaufgaben parallel). Für Kleinigkeiten, die du direkt erledigen kannst, keine Subagents.

## Projektstand
- Phase 0 und 1 abgeschlossen. Phase 2 läuft: 2.1–2.15 fertig (2.14: Electron-Build – `npm run desktop:win`/`desktop:mac`, Spielstände über `src/ui/storage.ts`; Test auf fremdem Windows-PC steht aus. 2.15: Bot-Läufe mit Ereignissen und viertem Bot „ausgewogen“, Zielwerte in balance.yaml unter `bots.targets`, Ist/Ziel-Tabelle in docs/botlaeufe.md – alle im Rahmen), als Nächstes 2.16 laut Roadmap.
- 0.2.15+1: Bank mit Schiebereglern für Kredit und Tilgung (Grenzen aus `loanSlider`/`repaySlider` in src/sim/credit.ts, Schritt `credit.sliderStep`); Tilgen geht auf den Cent, komplette Tilgung klappt auch bei Notkrediten mit Cent-Beträgen.
- 0.2.15+2 Transport-Entscheidungen: Lager (Tankkapazität, Überlauf, Schwund, Brand), eigene Fuhrwerke, Pipeline mit Wegerechten (Briefe in `content/events/k1-9-transport.yaml`), Thorne-Verträge (Exklusiv/Mengenrabatt) und Drohung, Händler in Port Ellis mit Cranes Groll. Regeln in `src/sim/logistics.ts` und `transport.ts`, Wegevergleich am Schreibtisch; Bots nutzen nur Tanks/Gespanne (ausgewogen ohne Gespanne, gierig nur Tanks, auf Kredit) – Siegquote ausgewogen 39,8 % knapp unter 40 %.
- 0.2.15+3: Jede Ereignis-Antwort spürbar – `npm run check:events` meldet schwache Antworten (Schwelle in balance.yaml `events.relevance`), neue befristete Effekte `price`/`production`/`leaseCost`, Ausnahmen für spätere Kapitel in `content/relevance.yaml`.
- 0.2.15+4: Bots nutzen alle Transportwege nach Charakter (`bots.transport` in balance.yaml: Händler, Gespanne, Pipeline mit Wegerechten, Thorne-Vertrag/Drohung, Timing); docs/botlaeufe.md mit Tabelle je Weg (Anteil Barrel, Gewinn je bbl) und Zielwerten `routeShare`/`pipelineSuccess`. Justiert: Gespanne 0,12 $/220 $ Lohn, Thorne erhöht öfter (0,30, Schritt 0,15, bis 1,00 $) – alle Zielwerte im Rahmen.
- Spielzahlen stehen in `content/balance.yaml` (per Bot-Läufen justiert, `npm run bots`; endgültig erst nach Philipps eigenen Partien).
- 0.2.15+5 Karte: Gebiete, Landmarken, Figuren-Ranches (Moss, Pruitt, Hale) und Namenslisten in `content/map.yaml`. Bohrbares Land = Ranches/Farmen statt Raster (gewichtetes Voronoi je Seed, `src/sim/ranches.ts`), Nachbarn über gemeinsame Grenze, Bohrplätze und Reserven nach Fläche, Pachtbonus je Standardfläche (`ranches.slotArea`), mehrere Bohrlöcher je fündiger Ranch. Kapitel 1: nur Salt Hill offen; Freischalten über `unlocks: [gebiet]` an einer Ereignis-Wahl (`src/sim/regions.ts`). Umrisse nicht im Spielstand (Format 12), kommen aus dem Seed. Karten-UI noch provisorisch (SVG-Vielecke) – die schöne Karte ist das nächste Paket.
- Bot-Läufe: `npm run bots` (schreibt docs/botlaeufe.md).
- Tester-Build: `npm run release` → `release/crude-<version>.zip` (index.html im Wurzelverzeichnis, relative Pfade; release/ nicht committen). Feedback-Link in `content/tester.yaml` (leer = kein Knopf). Debug-Bereich im Build nur mit `?debug=1`.
- Starten: `npm run dev`; Debug-Ansicht über `?seed=abc&debug=1` in der Adresse (mit Seed startet immer eine frische Welt, ohne Seed der gespeicherte Stand).
- Roadmap: https://claude.ai/code/artifact/900e1b6c-0788-449d-a682-0f06781fd49b

## Architektur (ab Phase 1, Details aus GDD §17 ergänzen)
- Stack: TypeScript, React, Vite, Vitest; später Electron + steamworks.js.
- `src/sim`: reine TypeScript-Simulation, kein React, kein DOM, deterministisch und testbar.
- `src/ui`: React-Oberfläche, liest den Zustand aus der Simulation, enthält keine Spielregeln.
- `content/`: Ereignisse, Figuren und Texte als YAML – kein Inhalt fest im Code.
- Jede Spielregel bekommt einen Test.
