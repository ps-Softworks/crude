# Bot-Läufe

Stand: 2026-10-03 · Version 0.2.11

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 23,7 % | 27.995 $ | 56,2 % | 33.378 $ | 8,5 |
| gierig | 1.000 | 28,4 % | 34,2 % | 42.104 $ | 42,9 % | 28.288 $ | 8,3 |
| zufaellig | 1.000 | 0,0 % | 0,1 % | 479 $ | 0,9 % | 40.918 $ | 8,8 |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 50.000 $ oder 5 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt.

## Justierung 1.15

Ziel: Kapitel 1 sinnvoll spielbar, Gate 1 „keine Strategie gewinnt immer“. Vorher (0.1.14): vorsichtig 0,0 % Pleiten / 1.839 $, gierig 1,1 % / 5.641 $, zufällig 0,0 % / 76 $ – der vorsichtige Bot hat nie gebohrt, der Ölpreis fiel allein durch die Nachbarn auf 0,20 $.

Weitere Kennzahlen nach der Justierung (1.000 Seeds): Kapitelziel (≥ 50.000 $ oder 5 Quellen) erreichen vorsichtig 22 %, gierig 34 %. Ölpreis ohne Jacob: Runde 1 etwa 1,31 $, Runde 16 etwa 0,69 $, nie unter 0,59 $. Mit dem gierigen Bot fällt er in 22 % der Partien unter das Fuhrwerk (0,60 $), nie unter 0,45 $.

| Wert | vorher | nachher | Warum |
| --- | ---: | ---: | --- |
| Startkasse | 2.000 $ | 2.500 $ | Zwei Startoptionen anbohren muss drin sein (Problem 2). |
| Bohrstufen 300/600/900 m | 1.500/2.400/3.800 $ | 1.000/1.100/1.400 $ | Tieferbohren mit der Startkasse möglich; Stufe 1 liegt damit unter dem GDD-Rahmen (1.500–3.000 $). |
| Öl je Stufe | 0,6/0,3/0,1 | 0,7/0,2/0,1 | Mehr Funde schon in Stufe 1, Tieferbohren bleibt Glücksspiel. |
| trocken Ring/Rand | 50 %/75 % | 40 %/55 % | Sonst fand auch gutes Spiel in den meisten Partien kein Öl. |
| Reserve klein / Gusher | 2.000–12.000 / 30.000–120.000 bbl | 18.000–45.000 / 60.000–200.000 bbl | Anfangsrate jetzt im GDD-Rahmen: klein 50–125 bbl/Tag, Gusher 200–650 bbl/Tag (Problem 3). |
| Anfangsrate klein / Gusher | 20 %/15 % | 25 %/30 % | Gusher hat mehr Druck und fördert jetzt anteilig mehr (Problem 3). |
| Nachfrage | 5.000 bbl | 150.000 bbl | Markt passend zur neuen Förderung: eine kleine Quelle ist etwa 5 % des Angebots. |
| Elastizität | 1,5 | 1,2 | Preis fällt bei Überbohrung spürbar, aber nicht ins Bodenlose. |
| Nachbarn Start / je Runde / Rate | 12 / +2 / 400 bbl | 30 / +1 / 4.000 bbl | Nachbarn wachsen um 50 % statt 250 %: Preis ohne Jacob 1,31 $ → 0,69 $, nicht mehr 0,20 $ (Problem 1). |
| Fuhrwerk / Bahn Kapazität | 600 / 3.000 bbl | 3.000 / 20.000 bbl | Passend zur neuen Förderung; ein Gusher sprengt die Bahn trotzdem. |
| Nachbarland-Bonus | 2.000 $ | 1.000 $ | Nachbarland soll vor dem ersten Fund bezahlbar sein. |
| Bankrahmen ohne Pfand | 3.000 $ | 5.000 $ | Platz für 3–4 Wildcat-Bohrungen auf Kredit (GDD: 3.000 $). |
| Geldverleiher | 2.000 $ | 1.000 $ | Wer sich verschuldet und nichts findet, geht jetzt pleite statt mit Minus durchzukommen (Problem 4; GDD: 2.000 $). |
| Bullard Rate / Einkommen je Quelle | 400 bbl / 300 $ | 4.000 bbl / 3.000 $ | Gleiche Skala wie die Nachbarn. |
| Bot vorsichtig: Rücklage | 1.500 $ | 500 $ | Mit 1.500 $ Rücklage konnte er nie bohren. |
| Bot gierig: höchstens ungebohrte Pachten | – | 1 | Neu: sonst pachtete er mehr Land, als der eine Turm bohren kann, und ließ es verfallen. |

Code-Korrekturen (je mit Test):

- **Imperiumswert:** Reserven zählen nur noch, was Jacobs eigene Quellen noch fördern (Rate der nächsten Runde / Rückgang, höchstens der Feldrest). Vorher zählte das ganze Feld – am Salt Hill hängen 30+ Parzellen zusammen, eine einzige Quelle brachte so 300.000 $ „Imperium“.
- **Bot gierig:** gab eine Bohrung nie auf, wenn auch ein Kredit das Weiterbohren nicht zahlte – der Turm blieb bis Kapitelende blockiert. Pachtete nur die teuerste Spitzenprognose und gab auf, statt die beste bezahlbare zu nehmen. Gab das letzte Bargeld für Pachten aus, die dann am Rundenende mangels Verzögerungszins sofort verfielen.
- **Bot vorsichtig:** kaufte Optionen, deren Bonus er nie zahlen konnte, und ließ sie Runde für Runde verfallen.
- **Siegquote** als neue Spalte (Pleite zählt immer als letzter Platz).

Offen: Startkasse, Bankrahmen, Geldverleiher und Bohrkosten weichen jetzt vom GDD ab – nach Philipps eigenen Partien entscheiden, ob GDD oder balance.yaml angepasst wird. Bullards Bewertung eines Funds (valuePerFind 8.000 $) ist noch auf der alten Skala.

## Nachbesserung 1.16

| Wert | vorher | nachher | Warum |
| --- | ---: | ---: | --- |
| Bullard: Wert eines Funds | 8.000 $ | 25.000 $ | Noch alte Größenordnung: Ein kleiner Fund bringt seit 1.15 im Schnitt etwa 31.500 bbl × ~0,8 $ ≈ 25.000 $; mit 8.000 $ war Land am Fund (Bonus 8.000 $) für Bullard nie lohnend. Nicht ganz ×10 (80.000 $ läge über dem Ø Imperiumswert der Bots). |
| Bullard: Streuung | 200 $ | 1.000 $ | Mit dem Fundwert mitgezogen. |

Wirkung (300 Seeds je Strategie, vorher → nachher): Bullard bohrt weiter etwa eine Parzelle je Runde (sein Limit ist eine Aktion je Runde), wählt aber etwas bessere Lagen – Ø 8,0 → 8,5 Funde je Partie. Für Jacob ändert sich fast nichts (Tabelle oben). Auffällig, aber noch nicht angefasst: Bullards Kasse wächst bis Kapitelende auf Ø ~185.000 $ (3.000 $ je Quelle und Runde), Geld ist für ihn nie die Grenze.

## Nachbesserung Bullard (0.1.14+3)

Problem: Jede fündige Bullard-Quelle brachte pauschal 3.000 $ je Runde – egal wie tief der Ölpreis stand, ohne Förderzins und Transport und ohne dass die Quelle nachließ. Seine Kasse wuchs bis Kapitelende auf Ø ~185.000 $.

Neue Regel (src/sim/rival.ts, Test in rival.test.ts): Bullard wirtschaftet wie Jacob.

- Eine fündige Quelle startet mit 4.000 bbl je Runde (`ratePerWell`) und fällt jede Runde um denselben Rückgang wie Jacobs Quellen (`production.decline`, 12 %). Über ihr Leben kommen so etwa 33.000 bbl heraus – so viel wie ein mittlerer kleiner Fund.
- Einnahmen je Runde = Förderung · (Posted Price · (1 − Förderzins seiner Pacht) − Transport 0,40 $/bbl). Verkauft wird zum Preis der Runde (wie bei Jacob); fällt der Preis unter die Kosten, verdient er nichts.
- Ein neuer Fund liefert erst ab der nächsten Runde (wie bei Jacob).
- Der Markt rechnet mit Bullards tatsächlicher, fallender Förderung statt 4.000 bbl je Quelle für immer.
- Pacht-Bonus und Bohrkosten zahlt er weiter aus der eigenen Kasse.

| Wert | vorher | nachher |
| --- | ---: | ---: |
| Einkommen je Quelle und Runde | 3.000 $ pauschal | Förderung × (Preis × (1 − Förderzins) − 0,40 $) – neue Quelle bei 0,70–1,30 $ Preis etwa 850–3.100 $, dann fallend |
| Förderung je Quelle | 4.000 bbl, gleichbleibend | 4.000 bbl, −12 % je Runde |
| Ø Bullard-Kasse am Kapitelende | ~185.000 $ | 28.000–41.000 $ (je nach Jacobs Spielweise, Tabelle oben) |
| Ø fündige Bullard-Quellen | ~8,5 | 8,3–8,8 |

Wirkung: Bullards Kasse liegt jetzt in derselben Größenordnung wie Jacobs Imperiumswert. Spielt Jacob gierig, drückt seine Förderung den Preis und damit auch Bullards Einnahmen (28.000 $ statt 41.000 $ gegen den Zufalls-Bot). Bullard pachtet und bohrt weiter etwa eine Parzelle je Runde und schnappt Jacob weiterhin Parzellen weg (Tests unverändert grün). Gate 1 hält: höchste Siegquote 56,2 % (vorsichtig).

Offen: Geld bremst Bullard nur selten (im Schnitt sinkt seine Kasse nie unter ~2.900 $), weil sein Limit eine Aktion je Runde ist. Sollte er sich später mehr Aktionen leisten dürfen (Kapitel 2, „Bullard verschuldet sich“), wird die Kasse zur echten Grenze. `valuePerFind` (25.000 $) liegt über dem, was ein Fund ihm jetzt tatsächlich bringt (übers ganze Leben etwa 8.000–20.000 $, je nach Preis) – er überschätzt Funde also, was zu seinem Draufgänger-Charakter passt.
