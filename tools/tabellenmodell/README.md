# Tabellenmodell (Roadmap 0.6)

Erzeugt `docs/tabellenmodell.xlsx`: Bohren, Pacht und Kredit über die 16 Runden von Kapitel 1, Startwerte aus GDD §15.

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/tabellenmodell/requirements.txt
.venv/bin/python tools/tabellenmodell/build_tabellenmodell.py        # Tabelle neu bauen
.venv/bin/python -m unittest tools/tabellenmodell/test_tabellenmodell.py   # Tests
```

Zahlen lieber direkt in der Excel-Datei ändern (gelbe Zellen). Das Skript braucht man nur, wenn sich der Aufbau der Tabelle ändert. Achtung: Neu bauen überschreibt Änderungen in der Datei.
