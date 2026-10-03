# Bot-Läufe

Stand: 2026-10-03 · Version 0.2.15+3

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Mit allen 122 Ereignissen aus content/events/ (Briefe, feste Termine, Rivalen, Story-Bögen)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 17,6 % | 18.736 $ | 11,2 % | 36.819 $ | 8,6 | 5,0 |
| gierig | 1.000 | 10,4 % | 27,6 % | 31.224 $ | 25,2 % | 27.668 $ | 8,6 | 5,0 |
| ausgewogen | 1.000 | 2,0 % | 34,2 % | 37.605 $ | 33,9 % | 29.715 $ | 8,7 | 5,0 |
| zufaellig | 1.000 | 29,2 % | 0,0 % | -1.119 $ | 0,1 % | 35.842 $ | 7,4 | 5,0 |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **ausgewogen (Standard-Bot):** pachtet die beste Prognose ab 40,0 % Fundchance, bohrt bis Stufe 3, behält 300 $ Rücklage und leiht, aber höchstens 50,0 % des Bankrahmens.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall und beantwortet Ereignisse zufällig.
- **Ereignisse:** Die drei planenden Bots bewerten jede Antwort in $ (Geld, Öl, Kraft, Familie, Bahntarif, Termine; Gewichte in balance.yaml unter bots.events) und antworten, wenn das mehr bringt als liegen lassen. Den Verkauf an Crane wählt kein Bot.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 50.000 $ oder 5 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt. Seit 2.15 gewinnt nur, wer mindestens die Startkasse (2.500 $) erreicht – sonst hat niemand gewonnen (diesmal 29,6 % der Seeds).
- **Ø Termine:** Termine je Runde zu Rundenbeginn (krank = 0).

## Zielwerte Kapitel 1

Toleranzbereiche stehen in balance.yaml unter bots.targets; gemessen wird in src/sim/bots.ts (checkTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Höchste Siegquote einer Strategie | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 33,9 % | ja |
| Pleitequote Standard-Bot (ausgewogen) | Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %) | 0,0 % – 15,0 % | 2,0 % | ja |
| Pleitequote gierig | GDD §15: wer im Boom zu viele Schulden macht, stirbt (Krisen erst ab Kapitel 2) | 5,0 % – 45,0 % | 10,4 % | ja |
| Ø Imperium vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,50 | ja |
| Kapitelziel Standard-Bot (ausgewogen) | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 34,2 % | ja |
| Kleine Funde mit 50–500 bbl/Tag | GDD §15: Anfangsrate 50–500 bbl/Tag | 90,0 % – 100,0 % | 99,2 % | ja |
| Ø Anfangsrate Gusher ÷ kleiner Fund | GDD §15: Gusher deutlich mehr | 2,00 – 20,00 | 4,98 | ja |
| Gemessener Rückgang je Quartal | GDD §15: 8–15 % | 8,0 % – 15,0 % | 11,1 % | ja |
| Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m) | GDD §15: etwa 1 von 5 bis 1 von 10 | 5,0 % – 25,0 % | 20,9 % | ja |
| Ø Termine je Runde (Standard-Bot) | GDD §15: 5 je Quartal | 4,50 – 5,00 | 5,00 | ja |

<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->

## Spürbare Entscheidungen (0.2.15+3)

Philipps Rückmeldung: Einige Entscheidungen fühlen sich irrelevant an. Neu: `npm run check:events` bewertet jede Antwort (Schwelle 200 $ = 2 % von 10.000 $ Kapitel-Geld, balance.yaml `events.relevance`). Vorher: 204 von 299 Antworten schwach. Jetzt: 0 – durch neue befristete Effekte (`price`, `production`, `leaseCost`, je 4 Runden), Transport-Effekte, höhere Beträge, Merkzeichen mit Folge (Schutz vor Folgeereignissen) und drei neue Folgeereignisse; vier fast gleiche Antworten entfielen. Alle Zielwerte bleiben im Rahmen (Tabelle oben); der gemessene Rückgang sinkt etwas (12,4 % → 11,1 %), weil Förder-Boni aus Ereignissen mitzählen.

## Balancing Kapitel 1 (2.15)

Ziel: alle Zielwerte aus GDD §15 (und §17 für die Bot-Läufe) im Toleranzbereich – Tabelle oben. Philipp war krank, darum ohne Rückfrage entschieden.

**Neu in den Bot-Läufen**

- Die Bots spielen jetzt mit allen Ereignissen (Briefe, feste Termine, Rivalen, Silas und Moss). Vorher liefen sie ohne – Ereignisse bringen und kosten aber spürbar Geld (Lohnbohren, Rechnungen, Bullard, Thorne) und ändern damit die Balance.
- Vierter Bot **ausgewogen** als Standard-Bot (GDD §17 nennt „ausgewogen“): leiht, aber nur bis zur Hälfte des Bankrahmens.
- Neue Kennzahlen: Anfangsrate der Funde (bbl/Tag), gemessener Rückgang, blinde Wildcat-Trefferquote, Termine je Runde.

**Zielwerte und Toleranzen – Entscheidungen**

- Siegquote ≤ 40 % (GDD §17). Geändert: Ein Seed, in dem keiner auch nur seine Startkasse hält, hat keinen Sieger. Vorher „gewann“ dort der vorsichtige Bot mit ein paar Hundert Dollar, weil er am wenigsten verlor – das ist keine Dominanz. Etwa ein Viertel der Seeds hat jetzt keinen Sieger.
- Pleitequote gierig 5–45 %: GDD §15 „wer im Boom zu viele Schulden macht, stirbt im Crash“. Krisen (Kreditcrash, Bankenpanik) gibt es erst ab Kapitel 2, darum reicht in Kapitel 1 ein spürbares Risiko (mindestens jede 20. Partie).
- Pleitequote Standard-Bot ≤ 15 % und Kapitelziel 20–70 %: Kapitel 1 ist der Einstieg (GDD §17 erwartet erst in Kapitel 4 nur 55–70 % Überlebende).
- „Wer nie Schulden macht, wird überholt“ (GDD §15): Ø Imperium vorsichtig höchstens 95 % des besseren der beiden Mutigeren.
- Anfangsrate, Gusher, Rückgang, Wildcat-Trefferquote, Termine: direkt die Startwerte aus GDD §15. Die Wildcat-Toleranz (5–25 %) ist etwas breiter als „1 von 5 bis 1 von 10“, weil zur Randlage auch Parzellen im Ring zählen.
- Nicht geprüft: Kreditkrisen, Ölschwemmen und Kriege je Kampagne (GDD §15) – die gibt es in Kapitel 1 noch nicht.

**Geänderte Spielzahlen (balance.yaml)**

| Wert | vorher | nachher | Warum |
| --- | ---: | ---: | --- |
| Randzone trocken / klein / Gusher | 55 / 43 / 2 % | 75 / 24 / 1 % | Blinde Wildcat-Bohrung in Randlage traf 1 von 3 (32,8 %), GDD §15 sagt 1 von 5 bis 1 von 10. Jetzt 20,9 %. |
| Rückgang je Quartal | 12 % | 10 % | Gemessen kamen mit Druckverlust und leer werdenden Feldern 14,5–15 % heraus (Grenze). Jetzt 12,3 %. Gleicht auch aus, dass die Randzone ärmer wurde. |

Wirkung (vorher → nachher, gierig und vorsichtig, je 1.000 Seeds): Ø Imperium vorsichtig 27.995 $ → 23.050 $, gierig 42.104 $ → 38.648 $; Pleitequote gierig 28,4 % → 8,0 %, vor allem weil die Ereignisse jetzt mitspielen (Lohnbohren bringt in Runden ohne eigene Quelle 120 $). Bullard bleibt bei Ø 8,6 Quellen.

**Abweichungen der Startwerte vom GDD (bewusst, seit 1.15)**

Die Startwerte in GDD §15 sind ausdrücklich „zum Tunen“. Sie bleiben in balance.yaml, wie 1.15 sie gesetzt hat, und sind keine Zielwerte:

| Startwert | GDD §15 | balance.yaml |
| --- | ---: | ---: |
| Bargeld | 2.000 $ | 2.500 $ |
| Bohrung bis 300 m | 1.500–3.000 $ | 1.000 $ |
| Bankrahmen ohne Pfand | 3.000 $ | 5.000 $ |
| Geldverleiher | 2.000 $ | 1.000 $ |
| Pachtbonus, Förderzins, Kreditzinsen, Termine | – | im GDD-Rahmen |

Offen: Die beiden freien Startoptionen liegen in Randlage und treffen jetzt seltener (blind etwa 1 von 5). Das passt zum GDD, macht aber den Start härter – nach eigenen Partien prüfen. In gut einem Viertel der Seeds hält keiner der Bots seine Startkasse; nach zwei, drei trockenen Bohrungen ist Jacob meist blank. Ob es dafür einen zweiten Weg braucht (z. B. mehr Lohnbohren, kleiner Bankkredit für Bohrung mit Prognose), entscheidet Philipp.
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
