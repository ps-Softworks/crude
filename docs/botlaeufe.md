# Bot-Läufe

Stand: 2026-10-04 · Version 0.2.15+8

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Mit allen 122 Ereignissen aus content/events/ (Briefe, feste Termine, Rivalen, Story-Bögen)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 18,4 % | 22.246 $ | 4,8 % | 25.855 $ | 8,6 | 5,0 |
| gierig | 1.000 | 16,1 % | 33,0 % | 41.219 $ | 23,4 % | 17.342 $ | 8,3 | 5,0 |
| ausgewogen | 1.000 | 0,4 % | 43,9 % | 54.536 $ | 35,7 % | 17.693 $ | 8,5 | 5,0 |
| zufaellig | 1.000 | 37,9 % | 0,2 % | -1.109 $ | 0,6 % | 24.586 $ | 7,3 | 5,0 |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **ausgewogen (Standard-Bot):** pachtet die beste Prognose ab 40,0 % Fundchance, bohrt bis Stufe 3, behält 300 $ Rücklage und leiht, aber höchstens 50,0 % des Bankrahmens.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall und beantwortet Ereignisse zufällig.
- **Ereignisse:** Die drei planenden Bots bewerten jede Antwort in $ (Geld, Öl, Kraft, Familie, Bahntarif, Termine; Gewichte in balance.yaml unter bots.events) und antworten, wenn das mehr bringt als liegen lassen. Den Verkauf an Crane wählt kein Bot.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 50.000 $ oder 5 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt. Seit 2.15 gewinnt nur, wer mindestens die Startkasse (2.500 $) erreicht – sonst hat niemand gewonnen (diesmal 35,5 % der Seeds).
- **Ø Termine:** Termine je Runde zu Rundenbeginn (krank = 0).

## Transportwege

Anteil an allen verkauften Barrel (gesamt und je Strategie). Erlös = was nach Fracht und Förderzins in der Kasse landet; Anlagen/Fixkosten = Anschaffung (soweit sie nicht im Imperiumswert weiterzählt), Löhne, Streckenwärter, Wachleute, Reparaturen, Wegerechte, Thornes Strafen und Vertragsgebühr; beim Händler Cranes Groll auf die übrigen Verkäufe. Gewinn = Erlös − Kosten.

| Weg | Anteil Barrel | vorsichtig | gierig | ausgewogen | zufaellig | Ø Erlös je bbl | Ø Anlagen/Fixkosten je bbl | Ø Gewinn je bbl |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mietfuhrwerk | 3,3 % | 0,6 % | 6,0 % | 1,4 % | 16,0 % | 0,06 $ | 0,00 $ | 0,06 $ |
| Bahn (Thorne) | 48,8 % | 72,7 % | 39,3 % | 47,0 % | 76,1 % | 0,33 $ | 0,00 $ | 0,33 $ |
| Eigene Fuhrwerke | 26,9 % | 14,0 % | 18,0 % | 44,4 % | 7,9 % | 0,48 $ | 0,15 $ | 0,32 $ |
| Pipeline | 21,0 % | 12,7 % | 36,7 % | 7,2 % | 0,0 % | 0,51 $ | 0,05 $ | 0,46 $ |
| davon an den Händler | 8,3 % | 0,0 % | 14,5 % | 5,3 % | 25,3 % | 0,54 $ | 0,03 $ | 0,51 $ |

Pipeline lief in: vorsichtig 6,4 % (mit Kapitelziel 34,8 %), gierig 28,2 % (mit Kapitelziel 76,4 %), ausgewogen 6,7 % (mit Kapitelziel 13,7 %), zufaellig 0,0 % (mit Kapitelziel 0,0 %).

- **Transport-Charakter** (balance.yaml bots.transport): vorsichtig {"trader":"never","teams":"overflow","tanks":true,"pipelinePayback":2,"thorne":"exclusive","threaten":false,"guards":"always","holdShare":0,"margin":true}; gierig {"trader":"always","teams":"overflow","tanks":true,"pipelinePayback":1,"thorne":"refuse","threaten":false,"guards":"never","holdShare":0.5,"margin":false}; ausgewogen {"trader":"calc","teams":"cheaper","tanks":true,"pipelinePayback":1.5,"thorne":"calc","threaten":true,"guards":"enemies","holdShare":0,"margin":true}; zufällig: mit 15,0 % je Runde eine zufällige Anschaffung, verkauft zufällig auch an den Händler.

## Ausbau: Bohrtürme, Pumpen, weitere Bohrlöcher

Je Partie: Ø höchste Zahl Türme zugleich (Silas' Turm mitgezählt), Ø Quellen mit Pumpe am Ende, Ø fündige Bohrlöcher über das erste je Ranch hinaus; Anteil ausgebauter Quellen = Ranches mit Fund, die eine Pumpe oder mehr als ein fündiges Bohrloch haben. Bebaubar ist in Kapitel 1 nur der Salt Hill. Zwei Gegenproben spielen den Standard-Bot (ausgewogen) auf denselben Seeds: **nie ausbauen** (nur Silas' Turm, keine Pumpe, kein weiteres Loch, kein Nachrüsten) und **alles ausbauen** (bis 4 Türme gemietet, nachgerüstet, Pumpe und weiteres Loch überall, wo es geht – auch ohne Amortisation).

| Bot | Ø Bohrtürme (höchstens zugleich) | Ø Pumpen | Ø weitere Bohrlöcher | Anteil ausgebauter Quellen | Ø Imperiumswert | Bankrottquote |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1,00 | 0,06 | 0,01 | 6,0 % | 22.246 $ | 0,0 % |
| gierig | 1,46 | 0,25 | 1,02 | 37,4 % | 41.219 $ | 16,1 % |
| ausgewogen | 1,00 | 0,21 | 0,24 | 16,7 % | 54.536 $ | 0,4 % |
| zufaellig | 1,00 | 0,00 | 0,00 | 27,8 % | -1.109 $ | 37,9 % |
| ausgewogen, nie ausbauen | 1,00 | 0,00 | 0,00 | 0,0 % | 45.019 $ | 0,0 % |
| ausgewogen, alles ausbauen | 1,81 | 2,08 | 1,69 | 80,4 % | 23.836 $ | 27,0 % |

„Alles ausbauen“ schlägt den Standard-Bot in 30,2 %, „nie ausbauen“ in 33,4 % der Seeds mit unterschiedlichem Ausgang.

- **Ausbau-Charakter** (balance.yaml bots.invest): vorsichtig {"pumpPayback":2,"wellPayback":3,"rigs":1,"rent":false,"steam":false,"rods":true}; gierig {"pumpPayback":2,"wellPayback":4,"rigs":2,"rent":true,"steam":true,"rods":false}; ausgewogen {"pumpPayback":3,"wellPayback":4,"rigs":1,"rent":false,"steam":true,"rods":true}.

## Zielwerte Kapitel 1

Toleranzbereiche stehen in balance.yaml unter bots.targets; gemessen wird in src/sim/bots.ts (checkTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Höchste Siegquote einer Strategie | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 35,7 % | ja |
| Pleitequote Standard-Bot (ausgewogen) | Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %) | 0,0 % – 15,0 % | 0,4 % | ja |
| Pleitequote gierig | GDD §15: wer im Boom zu viele Schulden macht, stirbt (Krisen erst ab Kapitel 2) | 5,0 % – 45,0 % | 16,1 % | ja |
| Ø Imperium vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,41 | ja |
| Kapitelziel Standard-Bot (ausgewogen) | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 43,9 % | ja |
| Kleine Funde mit 50–500 bbl/Tag | GDD §15: Anfangsrate 50–500 bbl/Tag | 90,0 % – 100,0 % | 99,0 % | ja |
| Ø Anfangsrate Gusher ÷ kleiner Fund | GDD §15: Gusher deutlich mehr | 2,00 – 20,00 | 4,97 | ja |
| Gemessener Rückgang je Quartal | GDD §15: 8–15 % | 8,0 % – 15,0 % | 14,2 % | ja |
| Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m) | GDD §15: etwa 1 von 5 bis 1 von 10 | 5,0 % – 25,0 % | 22,8 % | ja |
| Ø Termine je Runde (Standard-Bot) | GDD §15: 5 je Quartal | 4,50 – 5,00 | 5,00 | ja |
| Höchster Anteil eines Transportwegs an allen verkauften Barrel | GDD §6: kein Weg dominiert, jeder hat seinen Preis | 0,0 % – 75,0 % | 48,8 % | ja |
| Partien mit Kapitelziel, in denen eine Pipeline läuft | Pipeline ist eine Wahl, kein Pflichtweg | 0,0 % – 60,0 % | 39,5 % | ja |
| Ausgebaute Quellen (Pumpe oder weiteres Bohrloch), planende Bots | Ausbau lohnt für gute Quellen, nicht für jede | 5,0 % – 70,0 % | 23,1 % | ja |
| Ø Imperium Standard-Bot ÷ derselbe Bot ohne Ausbau | Investitionen in gute Quellen zahlen sich aus (über 1) | 1,02 – 10,00 | 1,21 | ja |
| Seeds, in denen „alles ausbauen“ den Standard-Bot schlägt | Blind alles ausbauen ist keine Siegformel | 0,0 % – 50,0 % | 30,2 % | ja |

<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->

## Karte & Bohrtürme (0.2.15+8)

Nachprüfung nach dem Kartenumbau (Ranches und Farmen statt Raster, in Kapitel 1 nur der Salt Hill bebaubar) und den Investitionen aus 0.2.15+7 (mehrere Türme, Dampfmaschine, Stahlgestänge, Pumpen, weitere Bohrlöcher). Philipp war krank, darum ohne Rückfrage entschieden.

- **Neu gemessen** (Tabelle **Ausbau** oben): Ø Bohrtürme, Ø Pumpen, Ø weitere Bohrlöcher, Anteil ausgebauter Quellen – je Bot und für zwei Gegenproben des Standard-Bots auf denselben Seeds: „nie ausbauen“ und „alles ausbauen“ (bis 4 Türme, überall Pumpe und weiteres Loch, auch wenn es sich nie bezahlt macht).
- **Drei neue Zielwerte** (balance.yaml `bots.targets`): ausgebaute Quellen 5–70 % (Ist 23,1 %), Ø Imperium Standard-Bot ÷ ohne Ausbau mindestens 1,02 (Ist 1,21 – Ausbau guter Quellen bringt gut ein Fünftel mehr), „alles ausbauen“ schlägt den Standard-Bot in höchstens 50 % der Seeds (Ist 30,2 %; Ø Imperium 23.836 $ statt 54.536 $, Pleitequote 27 % statt 0,4 %).
- **Ergebnis:** Alle 15 Zielwerte im Rahmen, keine Strategie gewinnt mehr als 35,7 % der Seeds (Grenze 40 %), kein Transportweg über 48,8 % (Grenze 75 %). Darum keine Spielzahl geändert – die Werte aus 0.2.15+7 (Turm 2.500 $ / Miete 350 $, Pumpe 4.000 $ + 400 $ Unterhalt, Dampf 1.200 $, Gestänge 600 $) halten die Balance: Wer gute Quellen gezielt ausbaut, gewinnt; wer blind alles ausbaut, drückt Felddruck und Preis und geht oft pleite.
- Auffällig, nicht angefasst: Der Zufalls-Bot findet nur in gut 2 % der Partien Öl (er bohrt selten und gibt Bohrungen oft auf); sein Anteil ausgebauter Quellen (27,8 %) beruht auf wenigen Quellen und zählt nicht zum Zielwert.

## Bohrtürme, Bohrlöcher, Pumpen (0.2.15+7)

Die planenden Bots investieren nach `bots.invest` in balance.yaml; ob sich Bohrloch oder Pumpe lohnt, rechnet `src/sim/invest.ts` (Felddruck und Preisdruck bis Kapitelende).

| Bot | Ø Pumpen | Zusatztürme | Dampfmaschine | Stahlgestänge | Ø weitere Bohrlöcher |
| --- | ---: | --- | ---: | ---: | ---: |
| vorsichtig | 0,05 | nie | nie | 21 % | 0,01 |
| gierig | 0,24 | mietet (bis 2 Türme) | 53 % | nie | 1,05 |
| ausgewogen | 0,24 | nie | 63 % | 63 % | 0,22 |

(300 Seeds je Bot.) Verworfen: gierig mit 3 Türmen (Pleitequote 20–78 % – ein zweiter/dritter Turm lässt ihn schneller auf Kredit wildcatten), ausgewogen mit 2 Türmen (Siegquote 43 %, über 40 %), Nachrüsten vor der ersten Quelle (kostete dem ausgewogenen Bot ~10.000 $ Imperium). Die erste Rechnung ohne Preisdruck überschätzte Pumpen und Bohrlöcher; mit Preisdruck sanken die Pleiten des gierigen Bots von 27 % auf 16 %.

## Transport & Ereignisse (0.2.15+4)

Die Bots nutzen jetzt die neuen Transportwege aus 0.2.15+2, jeder nach seinem Charakter (balance.yaml `bots.transport`, Regeln in src/sim/bots.ts `transportTurn`). Philipp war krank, darum ohne Rückfrage entschieden.

- **vorsichtig:** nur mit eigenem Geld; Exklusivvertrag mit Thorne (fester Tarif), eigene Fuhrwerke nur, wenn alle Wege voll sind, Pipeline nur bei doppelter Ersparnis, immer mit Wachleuten; kein Händler (verärgert Crane), keine Drohung.
- **gierig:** „Menge vor Marge“: lehnt Thorne ab, verkauft an den Händler, hält bei steigendem Preis die Hälfte zurück, baut die Pipeline auf Kredit, sobald sie sich einmal bezahlt macht, keine Wachleute; verkauft auch, wenn nach Förderzins nichts übrig bleibt.
- **ausgewogen:** rechnet: Thornes Angebote (Rabatt gegen Mindestmenge oder Exklusiv) nur, wenn sie mehr bringen als ablehnen; Händler nur, wenn der Aufschlag Cranes Groll überwiegt; eigene Fuhrwerke, sobald sie billiger sind als die Bahn; Pipeline bei 1,5-facher Ersparnis; droht Thorne, wenn es glaubwürdig ist; Wachleute bei Feinden.
- **zufällig:** mit 15 % je Runde eine zufällige Anschaffung (Tank, Gespann, Pipeline, Wachleute, Drohung), verkauft zufällig auch an den Händler.
- Neu gemessen: Tabelle **Transportwege** oben (Anteil verkaufter Barrel, Erlös, Anlagen-/Fixkosten und Gewinn je Barrel) und zwei Zielwerte: höchster Anteil eines Wegs (bis 75 %) und Pipeline in erfolgreichen Partien (bis 60 %).

**Vorher → nachher** (1.000 Partien je Strategie; „vorher“ = Bots wie in 0.2.15+3, die nur Bahn, Mietfuhrwerk und notfalls eigene Gespanne nutzten)

| Kennzahl | vorher | nachher |
| --- | ---: | ---: |
| Anteil Bahn an allen Barrel | 90,3 % | 51,6 % |
| Anteil eigene Fuhrwerke / Pipeline / Mietfuhrwerk | 3,8 % / 0 % / 5,9 % | 26,9 % / 17,6 % / 3,9 % |
| davon an den Händler | 0,1 % | 11,4 % |
| Ø Gewinn je bbl Bahn / eigene Fuhrwerke / Pipeline / Händler | 0,27 / 0,26 / – / – $ | 0,35 / 0,35 / 0,48 / 0,52 $ |
| Pipeline in Partien mit Kapitelziel | 0 % | 37,2 % (gierig 66 %, vorsichtig 36 %, ausgewogen 13 %) |
| Pleitequote gierig | 10,4 % | 6,7 % |
| Kapitelziel ausgewogen | 34,2 % | 40,3 % |
| Ø Imperium vorsichtig / gierig / ausgewogen | 18.736 / 31.224 / 37.605 $ | 23.056 / 43.267 / 49.120 $ |
| Höchste Siegquote | 33,9 % (ausgewogen) | 36,0 % (ausgewogen) |

**Justiert in balance.yaml**

- Eigene Fuhrwerke 0,10 → 0,12 $ je Barrel, Lohn 180 → 220 $ je Runde: Vorher brachten sie in ersten Läufen 0,47 $ Gewinn je Barrel gegen 0,37 $ bei der Bahn und trugen beim ausgewogenen Bot fast die Hälfte der Ladung. Jetzt liegen sie mit der Bahn gleichauf und lohnen vor allem, wenn Thorne erhöht hat.
- Thorne drückt stärker: Erhöhungschance 0,20 → 0,30, Schritt 0,10 → 0,15 $, Höchsttarif 0,80 → 1,00 $. Grund: Die alte Pleitequote des gierigen Bots (10 %) kam zum großen Teil daher, dass der alte Bot stur weiter per Bahn verkaufte, als Thorne den Tarif hochgetrieben hatte – mit Verlust. Mit klugen Wegen fiel sie auf 1–2 % (nur Partien ganz ohne Fund) und lag unter der Toleranz (5 %). Geprüft und verworfen: kleinerer Notkredit (400–700 $) – dann ging ein Neuling, der nur den Hinweisen folgt, pleite (Test des Einstiegs); mehr ungebohrte Pachten oder höhere Zinsen für den gierigen Bot brachten nur 2–4 %.
- Gierig droht Thorne nicht und stellt eigene Fuhrwerke nur ein, wenn alle Wege voll sind – er legt sich mit Thorne an, statt zu verhandeln. Das passt zum Charakter und hält seine Pleitequote im Rahmen.
- Alle Bots verkaufen nicht mehr mit Verlust nach Fracht und Förderzins – außer gierig (Menge vor Marge).

**Offen:** Die Pipeline lohnt vor allem für große Förderer (gierig baut sie in zwei Dritteln seiner erfolgreichen Partien); der Gesamtwert über alle Bots liegt mit 37 % klar unter der Grenze. Der Händler bringt je Barrel am meisten, nimmt aber nur 2.500 Barrel je Runde – Cranes Groll ist eingerechnet. Ob Thornes stärkerer Druck sich für echte Spieler zu hart anfühlt, sollte die Testrunde zeigen.

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
