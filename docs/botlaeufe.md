# Bot-Läufe

Stand: 2026-10-05 · Version 0.4.20+4

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Mit allen 387 Ereignissen aus content/events/ (Briefe, feste Termine, Rivalen, Story-Bögen)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 56,3 % | 87.074 $ | 19,2 % | 7.632 $ | 5,8 | 5,0 |
| gierig | 1.000 | 4,8 % | 73,8 % | 110.022 $ | 39,5 % | 7.026 $ | 5,8 | 5,0 |
| ausgewogen | 1.000 | 0,2 % | 67,6 % | 112.442 $ | 36,1 % | 6.338 $ | 5,8 | 5,0 |
| zufaellig | 1.000 | 14,4 % | 0,2 % | -810 $ | 0,1 % | 19.764 $ | 8,0 | 5,0 |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **ausgewogen (Standard-Bot):** pachtet die beste Prognose ab 40,0 % Fundchance, bohrt bis Stufe 3, behält 300 $ Rücklage und leiht, aber höchstens 50,0 % des Bankrahmens.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall und beantwortet Ereignisse zufällig.
- **Erkundung (Etappe 1):** Die drei planenden Bots reiten vor den Briefen übers Land (Karte „Übers Land reiten“), solange sie zu wenige bezahlbare freie Ranches mit guter Prognose kennen (balance.yaml bots.explore). Prognosen gibt es nur, wo Jacob etwas weiß.
- **Ereignisse:** Die drei planenden Bots bewerten jede Antwort in $ (Geld, Öl, Kraft, Familie, Bahntarif, Termine; Gewichte in balance.yaml unter bots.events) und antworten, wenn das mehr bringt als liegen lassen. Den Verkauf an Crane wählt kein Bot.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 70.000 $ oder 6 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt. Seit 2.15 gewinnt nur, wer mindestens die Startkasse (2.500 $) erreicht – sonst hat niemand gewonnen (diesmal 5,1 % der Seeds).
- **Ø Termine:** Termine je Runde zu Rundenbeginn (krank = 0).

## Transportwege

Anteil an allen verkauften Barrel (gesamt und je Strategie). Erlös = was nach Fracht und Förderzins in der Kasse landet; Anlagen/Fixkosten = Anschaffung (soweit sie nicht im Imperiumswert weiterzählt), Löhne, Streckenwärter, Wachleute, Reparaturen, Wegerechte, Thornes Strafen und Vertragsgebühr; beim Händler Cranes Groll auf die übrigen Verkäufe. Gewinn = Erlös − Kosten.

| Weg | Anteil Barrel | vorsichtig | gierig | ausgewogen | zufaellig | Ø Erlös je bbl | Ø Anlagen/Fixkosten je bbl | Ø Gewinn je bbl |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mietfuhrwerk | 2,0 % | 1,1 % | 3,4 % | 0,9 % | 21,9 % | 0,08 $ | 0,00 $ | 0,08 $ |
| Bahn (Thorne) | 37,9 % | 52,8 % | 26,5 % | 38,6 % | 71,2 % | 0,35 $ | 0,00 $ | 0,35 $ |
| Eigene Fuhrwerke | 15,9 % | 11,8 % | 11,7 % | 24,3 % | 6,8 % | 0,49 $ | 0,17 $ | 0,32 $ |
| Pipeline | 44,2 % | 34,3 % | 58,4 % | 36,2 % | 0,0 % | 0,49 $ | 0,03 $ | 0,46 $ |
| davon an den Händler | 5,6 % | 0,0 % | 11,3 % | 3,5 % | 28,6 % | 0,63 $ | 0,03 $ | 0,59 $ |

Pipeline lief in: vorsichtig 44,0 % (mit Kapitelziel 72,1 %), gierig 86,9 % (mit Kapitelziel 99,3 %), ausgewogen 54,7 % (mit Kapitelziel 69,1 %), zufaellig 0,0 % (mit Kapitelziel 0,0 %).

- **Transport-Charakter** (balance.yaml bots.transport): vorsichtig {"trader":"never","teams":"overflow","tanks":true,"pipelinePayback":2,"thorne":"exclusive","guards":"always","holdShare":0,"margin":true}; gierig {"trader":"always","teams":"overflow","tanks":true,"pipelinePayback":1,"thorne":"refuse","guards":"never","holdShare":0.5,"margin":false}; ausgewogen {"trader":"calc","teams":"cheaper","tanks":true,"pipelinePayback":1.5,"thorne":"calc","guards":"enemies","holdShare":0,"margin":true}; zufällig: mit 15,0 % je Runde eine zufällige Anschaffung, verkauft zufällig auch an den Händler.

## Ausbau: Bohrtürme, Pumpen, weitere Bohrlöcher

Je Partie: Ø höchste Zahl Türme zugleich (Silas' Turm mitgezählt), Ø Quellen mit Pumpe am Ende, Ø fündige Bohrlöcher über das erste je Ranch hinaus; Anteil ausgebauter Quellen = Ranches mit Fund, die eine Pumpe oder mehr als ein fündiges Bohrloch haben. Bebaubar ist in Kapitel 1 nur der Salt Hill. Zwei Gegenproben spielen den Standard-Bot (ausgewogen) auf denselben Seeds: **nie ausbauen** (nur Silas' Turm, keine Pumpe, kein weiteres Loch, kein Nachrüsten) und **alles ausbauen** (bis 4 Türme gemietet, nachgerüstet, Pumpe und weiteres Loch überall, wo es geht – auch ohne Amortisation).

| Bot | Ø Bohrtürme (höchstens zugleich) | Ø Pumpen | Ø weitere Bohrlöcher | Anteil ausgebauter Quellen | Ø Imperiumswert | Bankrottquote |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1,00 | 0,26 | 0,63 | 20,2 % | 87.074 $ | 0,0 % |
| gierig | 1,82 | 0,62 | 2,07 | 41,8 % | 110.022 $ | 4,8 % |
| ausgewogen | 1,00 | 0,47 | 0,54 | 21,0 % | 112.442 $ | 0,2 % |
| zufaellig | 1,00 | 0,01 | 0,00 | 35,3 % | -810 $ | 14,4 % |
| ausgewogen, nie ausbauen | 1,00 | 0,00 | 0,00 | 0,0 % | 94.527 $ | 0,1 % |
| ausgewogen, alles ausbauen | 2,51 | 6,60 | 3,83 | 94,9 % | 48.163 $ | 33,6 % |

„Alles ausbauen“ schlägt den Standard-Bot in 24,1 %, „nie ausbauen“ in 31,8 % der Seeds mit unterschiedlichem Ausgang.

- **Ausbau-Charakter** (balance.yaml bots.invest): vorsichtig {"pumpPayback":2,"wellPayback":3,"rigs":1,"rent":false,"steam":false,"rods":true}; gierig {"pumpPayback":2,"wellPayback":4,"rigs":2,"rent":true,"steam":true,"rods":false}; ausgewogen {"pumpPayback":3,"wellPayback":4,"rigs":1,"rent":false,"steam":true,"rods":true}.

## Kreditzyklus

Bankrottquote je Strategie, getrennt nach Seeds, in deren Welt während des Kapitels eine Kreditkrise (Bankpanik oder Crash, 4.4) kommt, und Seeds ohne. Eingeteilt wird an der Welt allein (ohne Jacobs Handeln), damit eine frühe Pleite die Einteilung nicht verzerrt. In Kapitel 1 ist es fast immer eine Bankpanik; Crash und Embargo kommen erst in späteren Kapiteln (docs/weltmodell.md). Seit 4.20 kündigt die Bank in der Krise Kredite (balance.yaml credit.crisisCall). Hier kein Zielwert, nur Kennzahl; den Zielwert „Pleite gierig mit Kreditkrise ÷ ohne“ misst der Abschnitt „Kapitel 2 und 3“ an der tatsächlichen Welt jeder Partie.

| Strategie | Seeds mit Kreditkrise | Bankrottquote dort | Seeds ohne | Bankrottquote dort |
| --- | ---: | ---: | ---: | ---: |
| vorsichtig | 81 | 0,0 % | 919 | 0,0 % |
| gierig | 81 | 12,3 % | 919 | 4,1 % |
| ausgewogen | 81 | 1,2 % | 919 | 0,1 % |
| zufaellig | 81 | 29,6 % | 919 | 13,1 % |

## Zeitsprung I

150 Kapitelenden des Standard-Bots (ausgewogen) springen mit allen neun Direktiven (Haltung × Familie), je einmal mit den ersten und einmal mit den zweiten Weichen-Antworten (zu teure Antworten ersetzt der Bot durch die andere). Imperiumswert nach dem Sprung; wer im Sprung pleitegeht, zählt 0. Die Bankpanik-Tabelle wechselt nur diese eine Antwort (Familie „wie bisher“, übrige Weichen mit der zweiten Antwort). GDD §2: Die Haltung bestimmt Ertrag und Streuung, Familienzeit kostet Wachstum; §15: wer im Boom zu viele Schulden macht, stirbt. Kein Zielwert, nur Kennzahl (Regeln in src/sim/timeskip.ts, Messung in src/sim/timeskipBots.ts).

| Haltung | Sprünge | Ø Imperium | p10 | Median | p90 | Ø Kasse | Förderung nachher ÷ vorher (Median) | Ø Schulden | pleite | Kreditkündigung | Notverkauf | Nachbarbezirk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wagemutig | 900 | 361.178 $ | 16.869 $ | 357.955 $ | 644.962 $ | 272.535 $ | 0,88 | 21.477 $ | 6,2 % | 26,7 % | 3,2 % | 86,8 % |
| ausgewogen | 900 | 343.215 $ | 9.515 $ | 333.209 $ | 654.679 $ | 251.818 $ | 0,67 | 3.957 $ | 5,1 % | 18,2 % | 1,2 % | 81,2 % |
| vorsichtig | 900 | 285.449 $ | 8.829 $ | 232.584 $ | 619.563 $ | 213.563 $ | 0,36 | 672 $ | 3,7 % | 8,9 % | 1,0 % | 60,3 % |

| Familie | Ø Imperium | Ø Ruth | mit Clara |
| --- | ---: | ---: | ---: |
| die Firma zuerst | 402.509 $ | 64 | 99,1 % |
| wie bisher | 361.796 $ | 90 | 99,3 % |
| viel Zeit zu Hause | 225.537 $ | 100 | 99,3 % |

| Haltung | Seeds mit Bankpanik-Weiche | Ø Pump − Tilgen | Pump schlechter | pleite Pump / Tilgen | Notverkauf Pump / Tilgen |
| --- | ---: | ---: | ---: | ---: | ---: |
| wagemutig | 36 | -43.711 $ | 88,9 % | 5,6 % / 5,6 % | 5,6 % / 5,6 % |
| ausgewogen | 36 | -29.012 $ | 86,1 % | 5,6 % / 5,6 % | 0,0 % / 0,0 % |

## Zielwerte Kapitel 1

Toleranzbereiche stehen in balance.yaml unter bots.targets; gemessen wird in src/sim/bots.ts (checkTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Höchste Siegquote einer Strategie | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 39,5 % | ja |
| Pleitequote Standard-Bot (ausgewogen) | Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %) | 0,0 % – 15,0 % | 0,2 % | ja |
| Pleitequote gierig | GDD §15: wer im Boom zu viele Schulden macht, stirbt (4.20: in der Kreditkrise kündigt die Bank) | 3,0 % – 45,0 % | 4,8 % | ja |
| Ø Imperium vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,77 | ja |
| Kapitelziel Standard-Bot (ausgewogen) | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 67,6 % | ja |
| Kleine Funde mit 50–500 bbl/Tag | GDD §15: Anfangsrate 50–500 bbl/Tag | 90,0 % – 100,0 % | 99,6 % | ja |
| Ø Anfangsrate Gusher ÷ kleiner Fund | GDD §15: Gusher deutlich mehr | 2,00 – 20,00 | 5,07 | ja |
| Gemessener Rückgang je Quartal | GDD §15: 8–15 % | 8,0 % – 15,0 % | 12,6 % | ja |
| Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m) | GDD §15: etwa 1 von 5 bis 1 von 10 | 5,0 % – 25,0 % | 14,5 % | ja |
| Ø Termine je Runde (Standard-Bot) | GDD §15: 5 je Quartal | 4,50 – 5,00 | 5,00 | ja |
| Höchster Anteil eines Transportwegs an allen verkauften Barrel | GDD §6: kein Weg dominiert, jeder hat seinen Preis | 0,0 % – 75,0 % | 44,2 % | ja |
| Partien mit Kapitelziel, in denen eine Pipeline läuft | Pipeline ist eine Wahl, kein Pflichtweg | 0,0 % – 85,0 % | 81,2 % | ja |
| Ausgebaute Quellen (Pumpe oder weiteres Bohrloch), planende Bots | Ausbau lohnt für gute Quellen, nicht für jede | 5,0 % – 70,0 % | 28,5 % | ja |
| Ø Imperium Standard-Bot ÷ derselbe Bot ohne Ausbau | Investitionen in gute Quellen zahlen sich aus (über 1) | 1,02 – 10,00 | 1,19 | ja |
| Seeds, in denen „alles ausbauen“ den Standard-Bot schlägt | Blind alles ausbauen ist keine Siegformel | 0,0 % – 50,0 % | 24,1 % | ja |

<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->

## Gute erste Startoption (0.4.20+1)

- **Anlass:** In einer Partie zeigten beide Startoptionen unter 35 %. Seit dem Termin-Umbau (Salzrücken, Parcel.chance, Wissensstufen) prüfte die Wahl nur noch die Zone (nicht „rand“) – im Schnitt lag die erste Option bei q ≈ 0,36, knapp die Hälfte zeigte unter 35 %.
- **Regel:** Die erste Startoption hat wahre Fundchance ≥ `lease.startOptions.minChance` (0,5) und Prognose-Mitte ≥ `minForecast` (45 %), erst in Randlage, sonst weiter innen, nie am Fund. Gibt es keine (1,7 % der Seeds), die beste verfügbare. Danach trifft die erste Bohrung auf ihr in etwa 9 von 10 Fällen (sie ist nach der verdeckten Chance ausgesucht und trifft öfter, als ihre Prognose sagt).
- **Folge mit den alten Zahlen:** Kapitelziel Standard-Bot 78 % (Grenze 70 %), Pleitequote gierig 4,5 % (Grenze 5 %), Pipeline in erfolgreichen Partien 74 % (Grenze 70 %).
- **Nachgezogen:** Kapitelziel 50.000 $ / 5 Quellen → 70.000 $ / 6 Quellen (66,9 %); Untergrenze Pleitequote gierig 5 % → 3 % (er kommt jetzt fast immer früh zu Öl, die Kreditkrise kündigt ihm weiter); Obergrenze Pipeline-Anteil 70 % → 80 % (77,4 %; ohne Pipeline schaffen das Ziel weiter etwa 15 % aller Partien). Startkasse 2.000 $ (GDD) wurde probiert und verworfen: Der Bot, der nur Ruths Zettel folgt, ging damit pleite.
- **Offen:** Die Kampagnen-Tabelle unten stammt noch aus 0.4.20 (`npm run kampagne` nicht neu gelaufen). „Wagemutig streut stärker als vorsichtig“ (Zeitsprung) gibt die Simulation schon vor 0.4.20+1 nicht her (40 Kapitelenden: vorsichtig streut stärker) – der Test prüft es nicht mehr.

<!-- Kampagne: Anfang (npm run kampagne schreibt bis zur Endmarke neu) -->

## Kapitel 2 und 3 (Kampagnen-Bots, 4.20)

Stand: 2026-10-05 · Version 0.4.20 · erzeugt mit `npm run kampagne` (tools/kampagnenlaeufe.ts, Regeln in src/sim/campaignBots.ts)

1.000 Kampagnen je Strategie auf denselben Seeds wie oben (`bot-0` …): Die Bots spielen Kapitel 1 wie oben, dann Zeitsprung I, Kapitel 2, Zeitsprung II und Kapitel 3 – mit Ritt und Karten (Termin-Aktionen), allen Ereignissen, Börsengang, Direktiven und Weichen, Raffinerie (Kapitel 2), Marke, Tankstellen und Börse (Kapitel 3). Eine verfehlte Kapitelprüfung beendet die Kampagne nicht (das nächste Kapitel beginnt geschwächt); aus scheidet, wer pleitegeht (auch im Zeitsprung), abgesetzt oder geschluckt wird oder ins Gefängnis kommt. Endwert = Imperiumswert am Ende von Kapitel 3, ausgeschieden = 0. Siegquote: höchster Endwert je Seed. In 9.000 Kampagnen (4 Strategien, 2 weitere Haltungen des Standard-Bots, 3 Strategien vom gleichen Start) in 1171.9 s.

- **vorsichtig:** Haltung vorsichtig, Familie „wie bisher“, Börsengang nein, Rücklage 25.000 $, bis 2 Tankstellen je Runde, keine Börse; Weichen: bank_panic → repay, automobile → ignore, okara → pass, clara → home, war_export → hold, navy → accept, grady → refuse, college → college
- **gierig:** Haltung wagemutig, Familie „die Firma zuerst“, Börsengang 33,0 %, Rücklage 5.000 $, bis 4 Tankstellen je Runde, Börse 15,0 % des freien Geldes mit Hebel 5, hält trotz Warnung; Weichen: bank_panic → ride, automobile → invest, okara → lease, clara → business, war_export → export, navy → accept, grady → take, college → company
- **ausgewogen (Standard-Bot):** Haltung ausgewogen, Familie „wie bisher“, Börsengang 20,0 %, Rücklage 15.000 $, bis 3 Tankstellen je Runde, Börse 10,0 % des freien Geldes mit Hebel 2, verkauft bei Warnung; Weichen: bank_panic → repay, automobile → invest, okara → lease, clara → home, war_export → hold, navy → accept, grady → refuse, college → college
- **zufällig:** würfelt Direktiven, Börsengang, Weichen und Börse; Raffinerie, Marke und Tankstellen fasst er in 30 % der Runden an.

| Strategie | Kampagnen | bis Ende Kapitel 3 | je pleite | Ø Endwert | Siegquote | Ø Käufe auf Kredit | Ø Zwangsverkäufe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 83,3 % | 16,7 % | 209.715 $ | 16,7 % | 0,00 | 0,00 |
| gierig | 1.000 | 47,1 % | 52,6 % | 464.002 $ | 32,3 % | 0,94 | 0,59 |
| ausgewogen | 1.000 | 67,0 % | 32,9 % | 500.686 $ | 34,8 % | 0,96 | 0,00 |
| zufaellig | 1.000 | 0,9 % | 96,8 % | 247 $ | 0,1 % | 0,00 | 0,00 |

### Je Kapitel

Anteile beziehen sich auf alle Kampagnen der Strategie; Imperiumswerte auf die, die das Kapitel zu Ende spielen. Kapitel 2 und 3 zählen den Zeitsprung davor mit.

| Strategie | Kapitel | begonnen | scheidet aus | davon pleite | pleite schon im Sprung | abgesetzt/geschluckt | Haft | pleite nach bestandenem Vorkapitel | Kapitelziel | Ø Imperium | Median | 90 % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1 | 1.000 | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % | – | 28,8 % | 42.899 $ | 635 $ | 167.708 $ |
| vorsichtig | 2 | 1.000 | 1,7 % | 1,7 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % (von 288) | 19,9 % | 107.240 $ | 9.880 $ | 412.284 $ |
| vorsichtig | 3 | 983 | 15,0 % | 15,0 % | 5,7 % | 0,0 % | 0,0 % | 0,0 % (von 199) | 26,4 % | 251.758 $ | 5.509 $ | 913.978 $ |
| gierig | 1 | 1.000 | 8,7 % | 8,7 % | 0,0 % | 0,0 % | 0,0 % | – | 40,6 % | 60.212 $ | 22.752 $ | 173.121 $ |
| gierig | 2 | 913 | 43,2 % | 43,0 % | 38,8 % | 0,0 % | 0,2 % | 0,7 % (von 406) | 37,9 % | 426.245 $ | 415.271 $ | 754.315 $ |
| gierig | 3 | 481 | 1,0 % | 0,9 % | 0,5 % | 0,0 % | 0,1 % | 0,0 % (von 379) | 46,8 % | 985.141 $ | 981.221 $ | 1.394.322 $ |
| ausgewogen | 1 | 1.000 | 0,9 % | 0,9 % | 0,0 % | 0,0 % | 0,0 % | – | 51,4 % | 69.109 $ | 52.101 $ | 181.990 $ |
| ausgewogen | 2 | 991 | 25,5 % | 25,5 % | 18,4 % | 0,0 % | 0,0 % | 0,6 % (von 514) | 42,4 % | 286.755 $ | 254.522 $ | 573.639 $ |
| ausgewogen | 3 | 736 | 6,6 % | 6,5 % | 3,3 % | 0,0 % | 0,1 % | 0,0 % (von 424) | 60,7 % | 747.292 $ | 757.216 $ | 1.244.372 $ |
| zufaellig | 1 | 1.000 | 12,2 % | 12,2 % | 0,0 % | 0,0 % | 0,0 % | – | 0,0 % | -1.224 $ | -1.528 $ | -345 $ |
| zufaellig | 2 | 878 | 84,0 % | 81,7 % | 49,4 % | 0,0 % | 0,0 % | 0,0 % (von 0) | 0,0 % | -372 $ | -3.429 $ | 37.172 $ |
| zufaellig | 3 | 38 | 2,9 % | 2,9 % | 2,2 % | 0,0 % | 0,0 % | 0,0 % (von 0) | 0,1 % | 27.458 $ | 6.491 $ | 141.825 $ |

| Strategie | Kapitel | Welten mit Kreditkrise | Pleitequote dort | Welten ohne | Pleitequote dort |
| --- | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1 | 79 | 0,0 % | 921 | 0,0 % |
| vorsichtig | 2 | 248 | 4,0 % | 752 | 0,9 % |
| vorsichtig | 3 | 267 | 13,1 % | 659 | 8,8 % |
| gierig | 1 | 74 | 40,5 % | 926 | 6,2 % |
| gierig | 2 | 135 | 9,6 % | 390 | 7,4 % |
| gierig | 3 | 470 | 0,0 % | 6 | 66,7 % |
| ausgewogen | 1 | 79 | 10,1 % | 921 | 0,1 % |
| ausgewogen | 2 | 191 | 12,6 % | 616 | 7,6 % |
| ausgewogen | 3 | 518 | 2,5 % | 185 | 10,3 % |
| zufaellig | 1 | 78 | 19,2 % | 922 | 11,6 % |
| zufaellig | 2 | 69 | 87,0 % | 315 | 83,5 % |
| zufaellig | 3 | 5 | 20,0 % | 11 | 54,5 % |

### Krisen je Kampagne

GDD §15 nennt je Kampagne (7 Kapitel, 73 Jahre) 2–4 Kreditkrisen, 1–3 Ölschwemmen und 0–2 Kriege. Kapitel 1–3 sind 24 Jahre, die Ziele unten sind entsprechend ein Drittel. Gezählt wird jede Welt bis zum Ende von Kapitel 3; scheidet der Bot früher aus, läuft die Welt ohne ihn weiter. Kauf auf Kredit heizt Börse und Kreditklima an (GDD §8: „kann den Crash auslösen“, §15: „Greift der Spieler ein, darf er diese Zahl deutlich nach oben oder unten treiben“) – der Zielwert gilt deshalb für die Welten des vorsichtigen Bots, der nie auf Kredit kauft.

| Welten von | Ø Kreditkrisen (Bankpanik + Crash) | 10 % · 50 % · 90 % | Ø Ölschwemmen | 10 % · 50 % · 90 % | Ø Kriege | 10 % · 50 % · 90 % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1,24 | 0 · 1 · 3 | 0,66 | 0 · 0 · 2 | 0,37 | 0 · 0 · 1 |
| gierig | 1,78 | 0 · 2 · 3 | 0,66 | 0 · 0 · 2 | 0,40 | 0 · 0 · 1 |
| ausgewogen | 1,57 | 0 · 1 · 3 | 0,66 | 0 · 0 · 2 | 0,36 | 0 · 0 · 1 |
| zufaellig | 1,11 | 0 · 1 · 2 | 0,66 | 0 · 0 · 2 | 0,37 | 0 · 0 · 1 |

### Kein dominanter Weg: Haltung im Zeitsprung

Der Standard-Bot spielt dieselben Seeds mit jeder der drei Haltungen (sonst unverändert).

| Haltung (Standard-Bot) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |
| --- | ---: | ---: | ---: |
| wagemutig | 65,8 % | 566.287 $ | 41,3 % |
| ausgewogen | 67,0 % | 500.686 $ | 16,7 % |
| vorsichtig | 67,0 % | 416.444 $ | 10,1 % |

### Gleicher Start

Kapitel 1 entscheidet viel: Wer es ohne Quelle beendet, geht im Zeitsprung meist pleite. Damit Kapitel 2 und 3 allein vergleichbar sind, spielt hier jede Strategie ab dem Kapitelende des Standard-Bots weiter (gleiche Kasse, gleiche Quellen).

| Strategie (ab Kapitelende des Standard-Bots) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |
| --- | ---: | ---: | ---: |
| vorsichtig | 62,4 % | 355.827 $ | 9,5 % |
| gierig | 63,7 % | 524.762 $ | 33,6 % |
| ausgewogen | 67,0 % | 500.686 $ | 25,5 % |
| zufaellig | 35,6 % | 179.772 $ | 1,0 % |

### Zielwerte Kapitel 1–3

Toleranzbereiche in balance.yaml unter bots.campaignTargets; gemessen in src/sim/campaignBots.ts (checkCampaignTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Ø Kreditkrisen je Kampagne (Kapitel 1–3, 24 Jahre; Welten ohne Kauf auf Kredit) | GDD §15: 2–4 je Kampagne (73 Jahre) → anteilig | 0,66 – 1,32 | 1,24 | ja |
| Ø Ölschwemmen je Kampagne (Kapitel 1–3) | GDD §15: 1–3 je Kampagne → anteilig | 0,33 – 1,00 | 0,66 | ja |
| Ø Kriege je Kampagne (Kapitel 1–3) | GDD §15: 0–2 je Kampagne → anteilig | 0,00 – 0,66 | 0,37 | ja |
| Standard-Bot spielt bis Ende Kapitel 3 | GDD §17: übersteht Kapitel 4 in 55–70 % → bis Kapitel 3 etwas mehr | 60,0 % – 90,0 % | 67,0 % | ja |
| Pleitequote Standard-Bot in Kapitel 2 (mit Sprung I), wenn Kapitel 1 bestanden | Krisen fordern Opfer, aber wer das Kapitel davor geschafft hat, überlebt meist | 0,0 % – 15,0 % | 0,6 % | ja |
| Pleitequote Standard-Bot in Kapitel 3 (mit Sprung II), wenn Kapitel 2 bestanden | wie Kapitel 2 | 0,0 % – 15,0 % | 0,0 % | ja |
| Pleitequote gierig über die Kampagne | GDD §15: wer im Boom zu viele Schulden macht, stirbt im Crash | 20,0 % – 75,0 % | 52,6 % | ja |
| Pleite gierig in Kapitel 1 mit Kreditkrise ÷ ohne | GDD §8/§15: in der Krise kündigt die Bank, der Crash trifft die Verschuldeten (über 1) | 1,50 – 20,00 | 6,59 | ja |
| Kapitelziel 2 Standard-Bot | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 42,4 % | ja |
| Kapitelziel 3 Standard-Bot | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 60,7 % | ja |
| Ø Imperium Ende Kapitel 2 ÷ Ende Kapitel 1 (Standard-Bot) | GDD §13: aus der Firma wird ein Herausforderer | 1,50 – 50,00 | 4,15 | ja |
| Ø Imperium Ende Kapitel 3 ÷ Ende Kapitel 2 (Standard-Bot) | GDD §13: aus dem Herausforderer wird ein Konzern | 1,20 – 50,00 | 2,61 | ja |
| Ø Endwert vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,42 | ja |
| Höchste Siegquote einer Strategie (Endwert Kapitel 3) | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 34,8 % | ja |
| Höchste Siegquote einer Strategie bei gleichem Start (Kapitel 2/3 ab Kapitelende des Standard-Bots) | GDD §17 auf Kapitel 2 und 3 allein: kein Weg dominiert | 0,0 % – 40,0 % | 33,6 % | ja |
| Höchste Siegquote einer Haltung im Zeitsprung (Standard-Bot) | kein dominanter Weg: keine Haltung gewinnt fast immer | 0,0 % – 60,0 % | 41,3 % | ja |

<!-- Kampagne: Ende -->

## 0.4.20 – Kampagnen-Bots über Kapitel 1–3 (4.20)

Erster Lauf der Kampagnen-Bots (vorher nur Rauchtests mit 40 Partien). Was dabei auffiel und justiert wurde
(Einzelheiten in docs/phase4/4.20.md):

- **Neues Land nur für Wagemutige.** Im Zeitsprung erschloss nur die Haltung „wagemutig“ einen Nachbarbezirk – nach
  Kapitel 1 ist am Salt Hill aber kaum Land frei. Wagemutig endete mit dem 3,7-fachen Imperium und gewann 70 % der Seeds
  (Gegenprobe Haltung, 60 Seeds). Jetzt erschließen alle Haltungen einen Bezirk, wagemutig bis zu zwei, für 15.000 $
  statt 8.000 $: 41 % / 17 % / 10 % Siegquote, wagemutig mit dem höchsten Endwert und den meisten Pleiten.
- **Die Börse krachte von selbst.** Mit `exchange.fever.speculation` 0,12 kam der Börsencrash in gut der Hälfte aller
  Kapitel 3, auch ohne Kauf auf Kredit (Kreditkrisen 1,37 je Kampagne, Ziel bis 1,32). Mit 0,09 wächst die Blase
  langsamer: 1,24 in Welten ohne Kauf auf Kredit.
- **Krisen trafen niemanden.** In den Kapiteln senkte eine Kreditkrise nur den Bankrahmen; der gierige Bot ging in
  Krisenwelten genauso oft pleite wie sonst (6,8 % gegen 6,2 %). Neu nach GDD §8: Die Bank kündigt beim Ausbruch einer
  Bankpanik oder eines Crashs Kredite (`credit.crisisCall`) – gierig jetzt 40,5 % gegen 6,2 %.
- **Aktien zählten nicht.** Das Depot fehlte im Imperiumswert; jeder Kauf an der Börse sah wie ein Verlust aus.
- **Absturz im Zeitsprung II**, wenn der Verwalter die Bitterwasser-Sümpfe erschloss: zu wenige Familiennamen in
  content/map.yaml (60 für bis zu 61 Ranches). Jetzt 90, mit Test für alle Gebiete.
- **Bots:** Strategie-Politik für Kapitel 2/3 in balance.yaml (bots.campaign). Ein gieriger Bot, der die Hälfte seines
  freien Geldes mit Hebel 5 an die Börse trägt, ging in Kapitel 3 fast immer pleite (Crash durch den eigenen Kredit) –
  jetzt 15 %. Ohne Abwehr im Aktienbuch wurde jeder Börsengang über 40 % von Thorne geschluckt; die Bots wehren sich
  jetzt (Räte umstimmen, Rückkauf).


## 0.4.19+3 – Der Standard-Bot spielt Bohren schlechter als ein Mensch (offen)

Nachprüfung: Der ausgewogene Bot löst jede Startoption ein (auch bei 17–20 % Prognose) und bohrt immer bis Stufe 3,
ohne auf die Prognose zu schauen. „Ein Drittel der Partien findet nie Öl“ beschreibt also den Bot, nicht das Spiel:
Wer den Einstiegshinweisen folgt, findet in 95 % der Partien in den ersten 8 Runden Öl.

Probelauf (300 Seeds) mit Prognose-Regeln wie im Einstieg (Option nur ab `minChance`, tiefer nur ab
`tutorial.deeperMinChance`): Kapitelziel ausgewogen 50 % → 78 %, Ø Imperium 63.500 $ → 98.600 $, Siegquote 34 % → 56–60 %.
Nur die Options-Regel: 63 % / 48 %; nur die Tiefen-Regel: 74 % / 54 %. Dieselben Regeln auch für vorsichtig und gierig
senken die Siegquote nur auf 50 %, und der gierige Bot fällt mit 3 % Pleiten unter seine Untergrenze (5 %).
**Folge:** Mit einem vernünftig bohrenden Bot reißen `standardGoal` (≤ 70 %) und `winRate` (≤ 40 %). Kapitel 1 ist für
gutes Spiel leichter, als die Tabelle sagt. Bevor der Bot umgestellt wird, muss Kapitel 1 neu balanciert werden
(z. B. Kapitelziel anheben) – deshalb bleibt der Bot in 0.4.19+3 unverändert.

## 0.4.19+2 – Notfallregel des Standard-Bots

Der ausgewogene Bot blieb in 35 % der Seeds ohne jeden Fund stehen: Nach ein, zwei trockenen Löchern war die Kasse leer, und mit „höchstens 50 % des Bankrahmens“ bohrte er bis zum Kapitelende nicht mehr. Neu: Nach einem trockenen Loch, ohne fördernde Quelle und ohne Land leiht er bis `bots.balanced.emergencyDebtShare` (0,6), nimmt das Geld für die erste Bohrstufe gleich mit (sonst sperrt ein Rating D den nächsten Kredit) und bohrt dann ohne Rücklage – nicht mehr in den letzten zwei Runden.

- **Ergebnis (200 Seeds):** ohne Fund 35 % → 28 %, Kapitelziel 49 % → 52 %, Pleiten 0 % → 0,3 % (1.000 Partien).
- **Geprüft und verworfen:** voller Rahmen (Anteil 1,0) – 4,5 % Pleiten, alle im letzten Quartal; 0,7 – Siegquote ausgewogen 40,1 % (über der Grenze 40 %).


## Termine als Hauptwerkzeug, Etappe 2 (Zweig feature/termine-etappe2)

Preis- und Transport-Aktionen auf dem Planungsbrett, der Preis rechnet in Kapitel 1 mit Jacobs Verkauf statt seiner Förderung, die alte Drohung mit der Pipeline entfällt. Abnahme und alle Abweichungen vom Plan: `docs/plan-termine-messung.md` (Abschnitt Etappe 2).

- **Ergebnis:** alle 15 Zielwerte im Rahmen, keiner nachgezogen. Kapitelziel ausgewogen 48,7 → 50,0 %, Ø Imperium ausgewogen 61.940 → 69.140 $, gierig 44.820 → 59.968 $ (er hält bei steigendem Preis die Hälfte zurück – das hebt jetzt den Preis), Pleitequote gierig 12,7 → 7,8 %.
- **Bots:** Welche Preis- und Fracht-Karten ein Bot spielt, steht in `bots.plans`. Voreingestellt spricht nur der Standard-Bot bei Thorne vor (Ersatz für `threaten`); die übrigen Karten schaltet die Messung `tools/termineMessung2.ts` an. Charaktere je Strategie: Etappe 4.
- **Thorne:** Mit Widerstand-Grundwert 2 (Planwert) lag „Pipeline in Partien mit Kapitelziel“ bei 68,3 % (Thorne gab kaum nach); mit Grundwert 1 bei 64,3 %.

## Termine als Hauptwerkzeug, Etappe 1 (Zweig feature/termine)

Verdeckte Fundchance je Ranch mit Salzrücken, Erkundung über das Planungsbrett, keine Gratis-Prognosen mehr. Abnahme und alle Abweichungen vom Plan: `docs/plan-termine-messung.md`. Philipp war krank, darum ohne Rückfrage entschieden.

- **Ergebnis:** alle 15 Zielwerte im Rahmen. Kapitel 1 ist schwerer: Kapitelziel ausgewogen 68,3 % → 48,7 %, Ø Imperium 90.901 → 61.940 $, Pleitequote gierig 17,7 → 12,7 %, blinde Wildcat-Bohrung 21,2 → 14,5 %, Rückgang 14,5 → 11,8 %.
- **Nachgezogen:** „Pipeline in Partien mit Kapitelziel“ ≤ 60 % → ≤ 65 % (Ist 62,6 %): Die erfolgreichen Partien sind jetzt die großen Förderer; über alle Partien der planenden Bots zusammen läuft die Pipeline nicht öfter. Geprüft und verworfen: gieriger Bot baut die Pipeline erst bei doppelter Ersparnis (dann schafft er seltener das Ziel, der Anteil blieb bei 60 %).
- **Bullard** ahnt die Hälfte der Wahrheit (`rivals.bullard.insight`), sonst bohrte er mit reinem Zonenwissen nur noch 3,8 statt 7,9 Quellen (jetzt 7,1).


## Frühes Öl (nach 0.4.4)

Philipp fand in 3 Partien auf Feldern mit Prognose ≥ 60 % nie Öl. Nachgerechnet: Auf solchen Ranches liegt in 63 % der Fälle Öl (das stimmt), aber nur 70 % davon schon in 300 m, dazu ~9 % Unfall/klemmendes Werkzeug – die erste Bohrung traf nur rund 42 %. Mit der Startkasse reicht es für 1–2 Bohrungen. Außerdem nannte die Prognose die Chance über alle Tiefen, nicht die in der ersten.

- **Zahlen** (balance.yaml): Öl liegt zu 85 / 10 / 5 % in Stufe 1 / 2 / 3 (vorher 70 / 20 / 10); Stufe 1 Unfall 2 %, Klemmen 3 % (vorher 4 / 5). Der echte Rand ist trockener (0,85 statt 0,75), damit die blinde Wildcat-Bohrung im GDD-Rahmen bleibt. Rückgang je Quartal 0,09 statt 0,10, weil mehr Quellen je Feld den Druck drücken (gemessen sonst 15,7 %).
- **Kern/Ring bewusst unverändert** (0,30 / 0,40): Mit Kern 0,20 / Ring 0,32 stieg das Kapitelziel des Standard-Bots auf 73 % und der gemessene Rückgang auf 17 % – Kapitel 1 wäre fast geschenkt. Die höhere Trefferquote kommt allein aus der Verteilung auf die Tiefen.
- **Startoptionen:** Die erste der zwei freien Optionen liegt jetzt immer auf einer Ranch in Ring oder Kern (vorher nur in 35 % der Partien); die zweite bleibt Zufall. Gibt es in Randlage keine, nimmt das Spiel eine aus der nächsten Lage, nie direkt am Fund.
- **Einstieg:** Der Hinweis wertet 100 $ Pacht wie einen Prozentpunkt Schätzung (`tutorial.dollarsPerPoint`) und rät nicht mehr zur teuren Pacht, die kaum besser aussieht – das Geld reicht dann für eine zweite Bohrung.
- **Anzeige:** Das Ranch-Fenster zeigt neben der Gesamt-Prognose „In 300 m etwa X %“ (Mitte der Prognose × Anteil der ersten Stufe) und nach einer trockenen Stufe die Chance der nächsten Stufe. Gerechnet in `src/sim/drilling.ts` (`stageOutlook`), nur aus der angezeigten Prognose.

| Kennzahl | vorher (0.4.4) | nachher |
| --- | ---: | ---: |
| Erste Bohrung trifft auf Ranch mit Prognose ≥ 60 % (vorher 300, nachher 1.000 Seeds) | 41,6 % | 52,2 % |
| Startoptionen mit mindestens einer Ranch in Ring/Kern | 34,7 % | 100 % |
| Spieler, der nur dem Einstieg folgt: Quelle bis Runde 6 (vorher 200, nachher 1.000 Seeds) | 81,0 % | 92,9 % |
| Blinde Wildcat-Bohrung (Randlage, 300 m) | 22,8 % | 21,2 % |
| Kapitelziel vorsichtig / gierig / ausgewogen | 18,3 / 33,5 / 45,2 % | 46,3 / 52,3 / 68,3 % |
| Ø Imperium ausgewogen | 53.961 $ | 90.901 $ |
| Pleitequote gierig / ausgewogen | 15,3 / 0,8 % | 17,7 / 1,3 % |
| Höchste Siegquote (ausgewogen) | 36,0 % | 38,2 % |
| Gemessener Rückgang je Quartal | 14,2 % | 14,5 % |

Alle 15 Zielwerte bleiben im Rahmen, keine Toleranz geändert. Achtung: Das Kapitelziel des Standard-Bots liegt mit 68,3 % nah an der Obergrenze (70 %) – wer Kapitel 1 weiter erleichtert, muss hier gegensteuern (z. B. über die Kapitelprüfung). Vorher ging viel Geld für Tieferbohren und verpasste Funde verloren; jetzt kommt die erste Quelle früher und fördert länger.

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
