# Stil der Platzhaltergrafik (2.12)

Gilt für Kapitel 1 „Der Wildcatter“ (GDD §16: Holzstich, Sepia, Braun, Ocker), bis echte Grafik kommt.

- **Schrift:** nur EB Garamond (SIL Open Font License 1.1), lokal über das Paket `@fontsource/eb-garamond` eingebunden – kein CDN, läuft offline und in Electron. Geladen werden nur die lateinischen Schnitte 400, 400 kursiv, 600, 700 (`src/ui/main.tsx`).
- **Papier-Look:** dunkle Tischplatte, darauf ein großer Papierbogen; Zeitung, Briefe, Familie und Ergebnisse sind hellere Blätter mit leichtem Schatten. Nur CSS, keine Bilddateien.
- **Farben:** feste Palette als CSS-Variablen oben in `src/ui/style.css` (Papier, Tinte, Ocker, Siegelrot, gedämpftes Grün/Blau/Rost für die Karte). Komponenten und Karte benutzen nur diese Variablen – für spätere Kapitel reicht ein neuer Variablensatz.
- **Figuren:** Silhouetten im Oval (Scherenschnitt-Medaillon) statt Porträts, gezeichnet in `src/ui/Silhouette.tsx`. Wer welche Silhouette bekommt, steht in `content/figures.yaml`.
- **Prüfen:** `npm run screenshots` legt 14 Bildschirme in `docs/screenshots/` ab (Schreibtisch Start/Mitte/spät, Post mit Dokument, Fracht/Wege, Kassenbuch, Karte mit Ranch-Fenster, Besuch, Szene, Zeitung, Glocke, Rundgang, Kapitelende, Pleite) und prüft, dass bei 1280×800, 1440×900 und 1920×1080 nichts scrollt.
