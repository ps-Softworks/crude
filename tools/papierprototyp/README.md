# Papierprototyp (Roadmap 0.7)

Erzeugt `docs/papierprototyp.html`: Regeln, Karte 6×6, 36 Geologiekarten, Preis- und Schuldenleiste, Fördertabelle, Rundenbogen. Zahlen kommen aus den Startwerten des Tabellenmodells (`tools/tabellenmodell`); reine Papier-Werte (Kartenmix, Würfeltabellen, Preisleiste) stehen oben im Skript als ANNAHME.

```bash
.venv/bin/python tools/papierprototyp/build_papierprototyp.py                   # Bogen neu bauen
.venv/bin/python -m unittest tools/papierprototyp/test_papierprototyp.py        # Tests
```

Drucken: HTML im Browser öffnen → Drucken → A4, „Hintergrundgrafiken“ an. Den Rundenbogen je Partie einmal drucken.

Hinweis: Die Startwerte werden aus dem Python-Skript des Tabellenmodells gelesen, nicht aus der Excel-Datei. Wer Zahlen in der Excel-Datei ändert, muss sie für den Bogen auch im Skript (`STARTWERTE`, `LAGEN`, `BESITZER`, `KREDIT`) nachziehen.
