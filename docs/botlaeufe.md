# Bot-Läufe

Stand: 2026-10-03 · Version 0.1.14

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Ø Imperiumswert |
| --- | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 1.839 $ |
| gierig | 1.000 | 1,1 % | 5.641 $ |
| zufaellig | 1.000 | 0,0 % | 76 $ |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, nimmt nie einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer, pachtet, solange Kasse und Bankrahmen reichen, leiht fehlendes Geld.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall.

Hinweis: Die Zahlen in content/balance.yaml sind Platzhalter, die Balance folgt in 1.15.
