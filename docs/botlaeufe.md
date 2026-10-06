# Bot-Läufe

Stand: 2026-10-06 · Version 0.4.20+44

- Partien je Strategie: 1.000
- Seeds: `bot-0` bis `bot-999` (für jede Strategie dieselben)
- Mit allen 304 Ereignissen aus content/events/ (Briefe, feste Termine, Rivalen, Story-Bögen)
- Erzeugt mit `npm run bots` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine | Ø Spuren für Delaney (Partien mit Spur) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 0,0 % | 53,9 % | 104.204 $ | 24,5 % | 7.823 $ | 6,1 | 5,0 | 1,82 (100,0 %) |
| gierig | 1.000 | 3,3 % | 69,3 % | 102.964 $ | 22,8 % | 12.493 $ | 5,6 | 5,0 | 4,99 (100,0 %) |
| ausgewogen | 1.000 | 0,5 % | 56,2 % | 110.901 $ | 19,4 % | 8.151 $ | 6,4 | 5,0 | 1,03 (34,1 %) |
| betruegerisch | 1.000 | 0,0 % | 63,2 % | 126.091 $ | 33,2 % | 12.706 $ | 6,2 | 4,8 | 8,25 (100,0 %) |
| zufaellig | 1.000 | 11,7 % | 0,2 % | 857 $ | 0,0 % | 27.168 $ | 8,5 | 5,0 | 5,03 (100,0 %) |

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit; tiefer (höchstens bis Stufe 2) nur, wenn der Geologe mindestens das 1,5-Fache der Gewinnschwelle gibt.
- **gierig:** bohrt jede Pacht, bohrt tiefer schon ab dem 0,6-Fachen der Gewinnschwelle (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **ausgewogen (Standard-Bot):** pachtet die beste Prognose ab 40,0 % Fundchance, bohrt tiefer bis Stufe 3, wenn der Geologe mindestens das 1-Fache der Gewinnschwelle gibt (Spielspaß K1: „lohnt ab“ im Ranch-Fenster), behält 300 $ Rücklage und leiht, aber höchstens 50,0 % des Bankrahmens.
- **betrügerisch (GDD §17):** bohrt, pachtet, transportiert und baut aus wie der Standard-Bot, zieht aber jeden schmutzigen Hebel: Förderbremse mit Organisatoren-Klausel – und verkauft sie an Crane, sobald dessen Angebot reicht (Verrat) –, Gerücht „Quellen versiegen“, Thornes Sondertarif mit Bluff, Händler-Liefervertrag nie; Karten in balance.yaml bots.plans.cheat {"cartel":true,"contract":false,"rumour":true,"crane":true,"thorne":true,"brennan":false,"pool":true,"bluff":true,"betray":true,"guard":true,"bank":true,"quota":true,"advance":false,"royalty":true,"interview":false}. Bei Briefen zählt ihm jeder Schwerepunkt einer Spur für Delaney 300 $ (× Faktor der Briefe) – er nimmt die schmutzige Antwort, wenn sie nicht klar weniger bringt.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall und beantwortet Ereignisse zufällig.
- **Spuren für Delaney:** Ø Schwere der Merkzeichen aus balance.yaml investigation.traces am Kapitelende (Moss' Papier, Silas betrogen, Silas als Kronzeuge, gekaufter Courier-Bericht, Vales Geld, Thornes Exklusivvertrag), in Klammern der Anteil der Partien mit mindestens einer Spur. Die ehrlichen Bots wiegen jeden Schwerepunkt als Risiko (bots.events.*.traceCost: vorsichtig 2.000 $, gierig 200 $, ausgewogen 1.000 $ je Punkt, × Faktor der Briefe) und nehmen eine schmutzige Antwort nur, wenn sie klar mehr bringt.
- **Erkundung (Etappe 1):** Die planenden Bots reiten vor den Briefen übers Land (Karte „Übers Land reiten“), solange sie zu wenige bezahlbare freie Ranches mit guter Prognose kennen (balance.yaml bots.explore). Prognosen gibt es nur, wo Jacob etwas weiß.
- **Ereignisse:** Die planenden Bots bewerten jede Antwort in $ (Geld, Öl, Kraft, Familie, Bahntarif, Termine, Spuren für Delaney; Gewichte in balance.yaml unter bots.events) und antworten, wenn das mehr bringt als liegen lassen. Den Verkauf an Crane wählt kein Bot.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 95.000 $ oder 8 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt. Seit 2.15 gewinnt nur, wer mindestens die Startkasse (2.500 $) erreicht – sonst hat niemand gewonnen (diesmal 0,1 % der Seeds).
- **Ø Termine:** Termine je Runde zu Rundenbeginn (krank = 0).

## Transportwege

Anteil an allen verkauften Barrel (gesamt und je Strategie). Erlös = was nach Fracht und Förderzins in der Kasse landet; Anlagen/Fixkosten = Anschaffung (soweit sie nicht im Imperiumswert weiterzählt), Löhne, Streckenwärter, Wachleute, Reparaturen, Wegerechte, Thornes Strafen und Vertragsgebühr; beim Händler Cranes Groll auf die übrigen Verkäufe. Gewinn = Erlös − Kosten.

| Weg | Anteil Barrel | vorsichtig | gierig | ausgewogen | betruegerisch | zufaellig | Ø Erlös je bbl | Ø Anlagen/Fixkosten je bbl | Ø Gewinn je bbl |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mietfuhrwerk | 7,1 % | 0,7 % | 19,2 % | 2,4 % | 2,9 % | 13,8 % | 0,25 $ | 0,00 $ | 0,25 $ |
| Bahn (Thorne) | 46,5 % | 78,1 % | 22,1 % | 30,7 % | 60,7 % | 75,1 % | 0,42 $ | 0,00 $ | 0,41 $ |
| Eigene Fuhrwerke | 28,1 % | 16,4 % | 19,0 % | 46,8 % | 32,6 % | 11,1 % | 0,52 $ | 0,14 $ | 0,38 $ |
| Pipeline | 18,3 % | 4,8 % | 39,7 % | 20,1 % | 3,9 % | 0,0 % | 0,51 $ | 0,06 $ | 0,45 $ |
| davon an den Händler | 14,5 % | 30,9 % | 14,2 % | 6,9 % | 6,9 % | 23,6 % | 0,60 $ | 0,04 $ | 0,56 $ |

Pipeline lief in: vorsichtig 12,7 % (mit Kapitelziel 21,9 %), gierig 66,9 % (mit Kapitelziel 80,8 %), ausgewogen 34,6 % (mit Kapitelziel 45,9 %), betruegerisch 9,0 % (mit Kapitelziel 11,1 %), zufaellig 0,0 % (mit Kapitelziel 0,0 %).

Feldkauf (Ø je Partie, balance.yaml bots.buyout): vorsichtig 0,00 Angebote, 0,00 Käufe; gierig 1,09 Angebote, 0,87 Käufe; ausgewogen 0,15 Angebote, 0,10 Käufe; betruegerisch 0,18 Angebote, 0,12 Käufe; zufaellig 0,00 Angebote, 0,00 Käufe.

- **Transport-Charakter** (balance.yaml bots.transport): vorsichtig {"trader":"never","teams":"overflow","tanks":true,"pipelinePayback":2,"thorne":"exclusive","guards":"always","holdShare":0,"margin":true}; gierig {"trader":"always","teams":"overflow","tanks":true,"pipelinePayback":1,"thorne":"refuse","guards":"never","holdShare":0.5,"margin":false}; ausgewogen {"trader":"calc","teams":"cheaper","tanks":true,"pipelinePayback":1.5,"thorne":"calc","guards":"enemies","holdShare":0,"margin":true}; betrügerisch wie ausgewogen; zufällig: mit 15,0 % je Runde eine zufällige Anschaffung, verkauft zufällig auch an den Händler.

## Ausbau: Bohrtürme, Pumpen, weitere Bohrlöcher

Je Partie: Ø höchste Zahl Türme zugleich (Silas' Turm mitgezählt), Ø Quellen mit Pumpe am Ende, Ø fündige Bohrlöcher über das erste je Ranch hinaus; Anteil ausgebauter Quellen = Ranches mit Fund, die eine Pumpe oder mehr als ein fündiges Bohrloch haben. Bebaubar ist in Kapitel 1 nur der Salt Hill. Zwei Gegenproben spielen den Standard-Bot (ausgewogen) auf denselben Seeds: **nie ausbauen** (nur Silas' Turm, keine Pumpe, kein weiteres Loch, kein Nachrüsten) und **alles ausbauen** (bis 4 Türme gemietet, nachgerüstet, Pumpe und weiteres Loch überall, wo es geht – auch ohne Amortisation).

| Bot | Ø Bohrtürme (höchstens zugleich) | Ø Pumpen | Ø weitere Bohrlöcher | Anteil ausgebauter Quellen | Ø Imperiumswert | Bankrottquote |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1,00 | 0,06 | 1,12 | 21,8 % | 104.204 $ | 0,0 % |
| gierig | 1,89 | 0,39 | 2,95 | 42,8 % | 102.964 $ | 3,3 % |
| ausgewogen | 1,00 | 0,48 | 1,12 | 28,1 % | 110.901 $ | 0,5 % |
| betruegerisch | 1,00 | 0,56 | 0,90 | 22,8 % | 126.091 $ | 0,0 % |
| zufaellig | 1,00 | 0,01 | 0,01 | 28,3 % | 857 $ | 11,7 % |
| ausgewogen, nie ausbauen | 1,00 | 0,00 | 0,00 | 0,0 % | 96.640 $ | 0,2 % |
| ausgewogen, alles ausbauen | 2,26 | 5,78 | 3,38 | 96,8 % | 47.934 $ | 31,2 % |

„Alles ausbauen“ schlägt den Standard-Bot in 21,0 %, „nie ausbauen“ in 40,1 % der Seeds mit unterschiedlichem Ausgang.

- **Ausbau-Charakter** (balance.yaml bots.invest): vorsichtig {"pumpPayback":2,"wellPayback":3,"rigs":1,"rent":false,"steam":false,"rods":true}; gierig {"pumpPayback":2,"wellPayback":4,"rigs":2,"rent":true,"steam":true,"rods":false}; ausgewogen {"pumpPayback":3,"wellPayback":4,"rigs":1,"rent":false,"steam":true,"rods":true}; betrügerisch wie ausgewogen.

## Kreditzyklus

Bankrottquote je Strategie, getrennt nach Seeds, in deren Welt während des Kapitels eine Kreditkrise (Bankpanik oder Crash, 4.4) kommt, und Seeds ohne. Eingeteilt wird an der Welt allein (ohne Jacobs Handeln), damit eine frühe Pleite die Einteilung nicht verzerrt. In Kapitel 1 ist es fast immer eine Bankpanik; Crash und Embargo kommen erst in späteren Kapiteln (docs/weltmodell.md). Seit 4.20 kündigt die Bank in der Krise Kredite (balance.yaml credit.crisisCall). Hier kein Zielwert, nur Kennzahl; den Zielwert „Pleite gierig mit Kreditkrise ÷ ohne“ misst der Abschnitt „Kapitel 2 und 3“ an der tatsächlichen Welt jeder Partie.

| Strategie | Seeds mit Kreditkrise | Bankrottquote dort | Seeds ohne | Bankrottquote dort |
| --- | ---: | ---: | ---: | ---: |
| vorsichtig | 81 | 0,0 % | 919 | 0,0 % |
| gierig | 81 | 1,2 % | 919 | 3,5 % |
| ausgewogen | 81 | 1,2 % | 919 | 0,4 % |
| betruegerisch | 81 | 0,0 % | 919 | 0,0 % |
| zufaellig | 81 | 12,3 % | 919 | 11,6 % |

## Feuer in der Nacht

Bullards Eskalation (GDD §9.5, §14; src/sim/feuer.ts): Anteil der Partien, in denen Bullard Stufe 3 erreicht (Drohbrief), Stufe 4 (Ruth bittet, danach Anschläge möglich) und in denen Jacob im Feuer stirbt. Ziel: in normalen Partien praktisch nie, beim gierigen und betrügerischen Bot selten. Kein Zielwert in der Tabelle oben, nur Kennzahl.

| Strategie | Drohbrief (Stufe 3) | Stufe 4 | Feuer in der Nacht |
| --- | ---: | ---: | ---: |
| vorsichtig | 0,0 % | 0,0 % | 0,0 % |
| gierig | 0,0 % | 0,0 % | 0,0 % |
| ausgewogen | 0,0 % | 0,0 % | 0,0 % |
| betruegerisch | 0,0 % | 0,0 % | 0,0 % |
| zufaellig | 13,2 % | 11,7 % | 2,4 % |

## Zeitsprung I

150 Kapitelenden des Standard-Bots (ausgewogen) springen mit allen neun Direktiven (Haltung × Familie), je einmal mit den ersten und einmal mit den zweiten Weichen-Antworten (zu teure Antworten ersetzt der Bot durch die andere). Imperiumswert nach dem Sprung; wer im Sprung pleitegeht, zählt 0. Die Bankpanik-Tabelle wechselt nur diese eine Antwort (Familie „wie bisher“, übrige Weichen mit der zweiten Antwort). GDD §2: Die Haltung bestimmt Ertrag und Streuung, Familienzeit kostet Wachstum; §15: wer im Boom zu viele Schulden macht, stirbt. Kein Zielwert, nur Kennzahl (Regeln in src/sim/timeskip.ts, Messung in src/sim/timeskipBots.ts).

| Haltung | Sprünge | Ø Imperium | p10 | Median | p90 | Ø Kasse | Förderung nachher ÷ vorher (Median) | Ø Schulden | pleite | Kreditkündigung | Notverkauf | Nachbarbezirk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wagemutig | 900 | 365.578 $ | 0 $ | 343.749 $ | 742.055 $ | 262.952 $ | 0,89 | 21.598 $ | 11,1 % | 27,4 % | 12,1 % | 81,4 % |
| ausgewogen | 900 | 340.936 $ | 0 $ | 321.511 $ | 728.123 $ | 235.991 $ | 0,64 | 4.234 $ | 6,7 % | 18,1 % | 7,4 % | 76,1 % |
| vorsichtig | 900 | 265.741 $ | 0 $ | 170.315 $ | 654.882 $ | 188.827 $ | 0,25 | 1.152 $ | 6,3 % | 11,1 % | 8,0 % | 55,3 % |

| Familie | Ø Imperium | Ø Ruth | mit Clara |
| --- | ---: | ---: | ---: |
| die Firma zuerst | 404.319 $ | 64 | 97,7 % |
| wie bisher | 359.383 $ | 90 | 98,6 % |
| viel Zeit zu Hause | 208.554 $ | 99 | 99,3 % |

| Haltung | Seeds mit Bankpanik-Weiche | Ø Pump − Tilgen | Pump schlechter | pleite Pump / Tilgen | Notverkauf Pump / Tilgen |
| --- | ---: | ---: | ---: | ---: | ---: |
| wagemutig | 40 | -35.414 $ | 72,5 % | 15,0 % / 12,5 % | 17,5 % / 12,5 % |
| ausgewogen | 40 | -28.861 $ | 65,0 % | 10,0 % / 10,0 % | 10,0 % / 10,0 % |

## Zielwerte Kapitel 1

Toleranzbereiche stehen in balance.yaml unter bots.targets; gemessen wird in src/sim/bots.ts (checkTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Höchste Siegquote einer Strategie | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 33,2 % | ja |
| Pleitequote Standard-Bot (ausgewogen) | Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %) | 0,0 % – 15,0 % | 0,5 % | ja |
| Pleitequote gierig | GDD §15: wer im Boom zu viele Schulden macht, stirbt (4.20: in der Kreditkrise kündigt die Bank) | 3,0 % – 45,0 % | 3,3 % | ja |
| Ø Imperium vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,94 | ja |
| Kapitelziel Standard-Bot (ausgewogen) | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 56,2 % | ja |
| Kleine Funde mit 50–500 bbl/Tag | GDD §15: Anfangsrate 50–500 bbl/Tag | 90,0 % – 100,0 % | 94,3 % | ja |
| Ø Anfangsrate Gusher ÷ kleiner Fund | GDD §15: Gusher deutlich mehr | 2,00 – 20,00 | 4,91 | ja |
| Gemessener Rückgang je Quartal | GDD §15: 8–15 % | 8,0 % – 15,0 % | 13,8 % | ja |
| Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m) | GDD §15: etwa 1 von 5 bis 1 von 10 | 5,0 % – 25,0 % | 14,5 % | ja |
| Ø Termine je Runde (Standard-Bot) | GDD §15: 5 je Quartal | 4,50 – 5,00 | 5,00 | ja |
| Höchster Anteil eines Transportwegs an allen verkauften Barrel | GDD §6: kein Weg dominiert, jeder hat seinen Preis | 0,0 % – 75,0 % | 46,5 % | ja |
| Partien mit Kapitelziel, in denen eine Pipeline läuft | Pipeline ist eine Wahl, kein Pflichtweg | 0,0 % – 80,0 % | 41,5 % | ja |
| Ausgebaute Quellen (Pumpe oder weiteres Bohrloch), planende Bots | Ausbau lohnt für gute Quellen, nicht für jede | 5,0 % – 70,0 % | 29,5 % | ja |
| Ø Imperium Standard-Bot ÷ derselbe Bot ohne Ausbau | Investitionen in gute Quellen zahlen sich aus (über 1) | 1,02 – 10,00 | 1,15 | ja |
| Seeds, in denen „alles ausbauen“ den Standard-Bot schlägt | Blind alles ausbauen ist keine Siegformel | 0,0 % – 50,0 % | 21,0 % | ja |

<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->

## Gute erste Startoption (0.4.20+1)

- **Anlass:** In einer Partie zeigten beide Startoptionen unter 35 %. Seit dem Termin-Umbau (Salzrücken, Parcel.chance, Wissensstufen) prüfte die Wahl nur noch die Zone (nicht „rand“) – im Schnitt lag die erste Option bei q ≈ 0,36, knapp die Hälfte zeigte unter 35 %.
- **Regel:** Die erste Startoption hat wahre Fundchance ≥ `lease.startOptions.minChance` (0,5) und Prognose-Mitte ≥ `minForecast` (45 %), erst in Randlage, sonst weiter innen, nie am Fund. Gibt es keine (1,7 % der Seeds), die beste verfügbare. Danach trifft die erste Bohrung auf ihr in etwa 9 von 10 Fällen (sie ist nach der verdeckten Chance ausgesucht und trifft öfter, als ihre Prognose sagt).
- **Folge mit den alten Zahlen:** Kapitelziel Standard-Bot 78 % (Grenze 70 %), Pleitequote gierig 4,5 % (Grenze 5 %), Pipeline in erfolgreichen Partien 74 % (Grenze 70 %).
- **Nachgezogen:** Kapitelziel 50.000 $ / 5 Quellen → 70.000 $ / 6 Quellen (66,9 %); Untergrenze Pleitequote gierig 5 % → 3 % (er kommt jetzt fast immer früh zu Öl, die Kreditkrise kündigt ihm weiter); Obergrenze Pipeline-Anteil 70 % → 80 % (77,4 %; ohne Pipeline schaffen das Ziel weiter etwa 15 % aller Partien). Startkasse 2.000 $ (GDD) wurde probiert und verworfen: Der Bot, der nur Ruths Zettel folgt, ging damit pleite.
- **Offen:** Die Kampagnen-Tabelle unten stammt noch aus 0.4.20 (`npm run kampagne` nicht neu gelaufen). „Wagemutig streut stärker als vorsichtig“ (Zeitsprung) gibt die Simulation schon vor 0.4.20+1 nicht her (40 Kapitelenden: vorsichtig streut stärker) – der Test prüft es nicht mehr.

<!-- Kampagne: Anfang (npm run kampagne schreibt bis zur Endmarke neu) -->

## Kapitel 2 und 3 (Kampagnen-Bots, 4.20)

Stand: 2026-10-06 · Version 0.4.20+39 · erzeugt mit `npm run kampagne` (tools/kampagnenlaeufe.ts, Regeln in src/sim/campaignBots.ts)

1.000 Kampagnen je Strategie auf denselben Seeds wie oben (`bot-0` …): Die Bots spielen Kapitel 1 wie oben, dann Zeitsprung I, Kapitel 2, Zeitsprung II und Kapitel 3 – mit Ritt und Karten (Termin-Aktionen), allen Ereignissen, Börsengang, Direktiven und Weichen, Raffinerie (Kapitel 2), Marke, Tankstellen und Börse (Kapitel 3). Eine verfehlte Kapitelprüfung beendet die Kampagne nicht (das nächste Kapitel beginnt geschwächt); aus scheidet, wer pleitegeht (auch im Zeitsprung), abgesetzt oder geschluckt wird oder ins Gefängnis kommt. Endwert = Imperiumswert am Ende von Kapitel 3, ausgeschieden = 0. Siegquote: höchster Endwert je Seed. In 11.000 Kampagnen (5 Strategien, 2 weitere Haltungen des Standard-Bots, 4 Strategien vom gleichen Start) in 1507.5 s.

- **vorsichtig:** Haltung vorsichtig, Familie „wie bisher“, Börsengang nein, Rücklage 25.000 $, bis 2 Tankstellen je Runde, keine Börse, Cranes Feldzug: hält durch, verkauft Tankstellen unter 25.000 $ Kasse; Weichen: bank_panic → repay, automobile → ignore, okara → pass, clara → home, war_export → hold, navy → accept, grady → refuse, college → college
- **gierig:** Haltung wagemutig, Familie „die Firma zuerst“, Börsengang 33,0 %, Rücklage 5.000 $, bis 4 Tankstellen je Runde, Börse 5,0 % des freien Geldes mit Hebel 5, hält trotz Warnung, Cranes Feldzug: hält durch, nimmt Thornes Kredit; Weichen: bank_panic → ride, automobile → invest, okara → lease, clara → business, war_export → export, navy → accept, grady → take, college → company
- **ausgewogen (Standard-Bot):** Haltung ausgewogen, Familie „wie bisher“, Börsengang 20,0 %, Rücklage 15.000 $, bis 3 Tankstellen je Runde, Börse 10,0 % des freien Geldes mit Hebel 2, verkauft bei Warnung, Cranes Feldzug: hält durch, nimmt Thornes Kredit, verkauft Tankstellen unter 5.000 $ Kasse; Weichen: bank_panic → repay, automobile → invest, okara → lease, clara → home, war_export → hold, navy → accept, grady → refuse, college → college
- **betrügerisch:** Haltung ausgewogen, Familie „wie bisher“, Börsengang 20,0 %, Rücklage 15.000 $, bis 3 Tankstellen je Runde, Börse 10,0 % des freien Geldes mit Hebel 2, verkauft bei Warnung, Cranes Feldzug: nimmt die Preisabsprache nach 3 Runden Krieg, verkauft Tankstellen unter 5.000 $ Kasse; Weichen: bank_panic → repay, automobile → invest, okara → lease, clara → home, war_export → hold, navy → accept, grady → take, college → college; schmutzige Hebel: Sicherheitschef mit Sabotage bis Personal-Hitze 40, Anwalt Stufe 3, sobald Delaney ermittelt, politischer Druck gegen Delaney, Lobbyist tibbs mit Umschlägen, Konsortium: ausspielen
- **zufällig:** würfelt Direktiven, Börsengang, Weichen und Börse; Raffinerie, Marke und Tankstellen fasst er in 30 % der Runden an.

| Strategie | Kampagnen | bis Ende Kapitel 3 | je pleite | Ø Endwert | Siegquote | Ø Käufe auf Kredit | Ø Zwangsverkäufe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1.000 | 98,7 % | 1,3 % | 605.535 $ | 14,8 % | 0,00 | 0,00 |
| gierig | 1.000 | 70,0 % | 29,0 % | 493.705 $ | 12,0 % | 1,32 | 0,62 |
| ausgewogen | 1.000 | 92,5 % | 7,5 % | 815.338 $ | 45,1 % | 1,15 | 0,01 |
| betruegerisch | 1.000 | 55,4 % | 5,4 % | 536.553 $ | 28,0 % | 0,99 | 0,01 |
| zufaellig | 1.000 | 5,8 % | 89,3 % | 4.948 $ | 0,0 % | 0,02 | 0,01 |

### Je Kapitel

Anteile beziehen sich auf alle Kampagnen der Strategie; Imperiumswerte auf die, die das Kapitel zu Ende spielen. Kapitel 2 und 3 zählen den Zeitsprung davor mit.

| Strategie | Kapitel | begonnen | scheidet aus | davon pleite | pleite schon im Sprung | abgesetzt/geschluckt | Haft | pleite nach bestandenem Vorkapitel | Kapitelziel | Ø Imperium | Median | 90 % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1 | 1.000 | 0,1 % | 0,1 % | 0,0 % | 0,0 % | 0,0 % | – | 52,0 % | 103.100 $ | 92.488 $ | 194.153 $ |
| vorsichtig | 2 | 999 | 0,2 % | 0,2 % | 0,2 % | 0,0 % | 0,0 % | 0,0 % (von 520) | 25,2 % | 386.706 $ | 294.124 $ | 805.253 $ |
| vorsichtig | 3 | 997 | 1,0 % | 1,0 % | 0,6 % | 0,0 % | 0,0 % | 0,0 % (von 252) | 13,9 % | 613.510 $ | 551.613 $ | 1.041.411 $ |
| gierig | 1 | 1.000 | 9,2 % | 9,2 % | 0,0 % | 0,0 % | 0,0 % | – | 65,3 % | 107.458 $ | 96.888 $ | 201.937 $ |
| gierig | 2 | 908 | 7,3 % | 7,3 % | 5,7 % | 0,0 % | 0,0 % | 0,8 % (von 653) | 61,0 % | 707.930 $ | 704.561 $ | 1.016.634 $ |
| gierig | 3 | 835 | 13,5 % | 12,5 % | 0,0 % | 0,6 % | 0,4 % | 11,1 % (von 610) | 35,3 % | 705.292 $ | 683.108 $ | 1.012.863 $ |
| ausgewogen | 1 | 1.000 | 2,0 % | 2,0 % | 0,0 % | 0,0 % | 0,0 % | – | 55,1 % | 112.053 $ | 99.464 $ | 217.058 $ |
| ausgewogen | 2 | 980 | 5,3 % | 5,3 % | 4,9 % | 0,0 % | 0,0 % | 0,4 % (von 551) | 57,6 % | 631.748 $ | 641.236 $ | 960.909 $ |
| ausgewogen | 3 | 927 | 0,2 % | 0,2 % | 0,0 % | 0,0 % | 0,0 % | 0,2 % (von 576) | 50,5 % | 881.446 $ | 851.448 $ | 1.282.973 $ |
| betruegerisch | 1 | 1.000 | 0,2 % | 0,2 % | 0,0 % | 0,0 % | 0,0 % | – | 63,6 % | 126.452 $ | 116.267 $ | 238.421 $ |
| betruegerisch | 2 | 998 | 16,3 % | 5,1 % | 3,8 % | 0,0 % | 11,2 % | 0,0 % (von 636) | 48,1 % | 633.050 $ | 630.926 $ | 981.657 $ |
| betruegerisch | 3 | 835 | 28,1 % | 0,1 % | 0,0 % | 0,0 % | 28,0 % | 0,0 % (von 481) | 0,0 % | 968.507 $ | 972.296 $ | 1.464.478 $ |
| zufaellig | 1 | 1.000 | 11,9 % | 11,9 % | 0,0 % | 0,0 % | 0,0 % | – | 0,2 % | 1.111 $ | 5 $ | 210 $ |
| zufaellig | 2 | 881 | 69,2 % | 65,5 % | 25,5 % | 0,0 % | 0,0 % | 0,0 % (von 2) | 0,1 % | 5.428 $ | -2.375 $ | 20.607 $ |
| zufaellig | 3 | 189 | 13,1 % | 11,9 % | 7,9 % | 0,0 % | 0,0 % | 0,0 % (von 1) | 0,0 % | 85.316 $ | 31.465 $ | 197.326 $ |

| Strategie | Kapitel | Welten mit Kreditkrise | Pleitequote dort | Welten ohne | Pleitequote dort |
| --- | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1 | 78 | 1,3 % | 922 | 0,0 % |
| vorsichtig | 2 | 216 | 0,0 % | 781 | 0,0 % |
| vorsichtig | 3 | 225 | 0,0 % | 766 | 0,5 % |
| gierig | 1 | 76 | 11,8 % | 924 | 9,0 % |
| gierig | 2 | 188 | 1,1 % | 663 | 2,1 % |
| gierig | 3 | 653 | 12,7 % | 182 | 23,1 % |
| ausgewogen | 1 | 79 | 8,9 % | 921 | 1,4 % |
| ausgewogen | 2 | 196 | 0,5 % | 735 | 0,4 % |
| ausgewogen | 3 | 442 | 0,2 % | 485 | 0,2 % |
| betruegerisch | 1 | 80 | 2,5 % | 920 | 0,0 % |
| betruegerisch | 2 | 191 | 1,6 % | 769 | 1,3 % |
| betruegerisch | 3 | 325 | 0,0 % | 510 | 0,2 % |
| zufaellig | 1 | 79 | 8,9 % | 921 | 12,2 % |
| zufaellig | 2 | 118 | 72,9 % | 508 | 61,8 % |
| zufaellig | 3 | 25 | 36,0 % | 85 | 36,5 % |

### Krisen je Kampagne

GDD §15 nennt je Kampagne (7 Kapitel, 73 Jahre) 2–4 Kreditkrisen, 1–3 Ölschwemmen und 0–2 Kriege. Kapitel 1–3 sind 24 Jahre, die Ziele unten sind entsprechend ein Drittel. Gezählt wird jede Welt bis zum Ende von Kapitel 3; scheidet der Bot früher aus, läuft die Welt ohne ihn weiter. Kauf auf Kredit heizt Börse und Kreditklima an (GDD §8: „kann den Crash auslösen“, §15: „Greift der Spieler ein, darf er diese Zahl deutlich nach oben oder unten treiben“) – der Zielwert gilt deshalb für die Welten des vorsichtigen Bots, der nie auf Kredit kauft.

| Welten von | Ø Kreditkrisen (Bankpanik + Crash) | 10 % · 50 % · 90 % | Ø Ölschwemmen | 10 % · 50 % · 90 % | Ø Kriege | 10 % · 50 % · 90 % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 1,06 | 0 · 1 · 2 | 0,66 | 0 · 0 · 2 | 0,37 | 0 · 0 · 1 |
| gierig | 1,63 | 0 · 2 · 3 | 0,66 | 0 · 0 · 2 | 0,38 | 0 · 0 · 1 |
| ausgewogen | 1,29 | 0 · 1 · 3 | 0,66 | 0 · 0 · 2 | 0,36 | 0 · 0 · 1 |
| betruegerisch | 1,19 | 0 · 1 · 3 | 0,66 | 0 · 0 · 2 | 0,36 | 0 · 0 · 1 |
| zufaellig | 0,97 | 0 · 1 · 2 | 0,66 | 0 · 0 · 2 | 0,35 | 0 · 0 · 1 |

### Kein dominanter Weg: Haltung im Zeitsprung

Der Standard-Bot spielt dieselben Seeds mit jeder der drei Haltungen (sonst unverändert).

| Haltung (Standard-Bot) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |
| --- | ---: | ---: | ---: |
| wagemutig | 88,1 % | 767.421 $ | 33,8 % |
| ausgewogen | 92,5 % | 815.338 $ | 39,7 % |
| vorsichtig | 93,0 % | 718.173 $ | 20,2 % |

### Gleicher Start

Kapitel 1 entscheidet viel: Wer es ohne Quelle beendet, geht im Zeitsprung meist pleite. Damit Kapitel 2 und 3 allein vergleichbar sind, spielt hier jede Strategie ab dem Kapitelende des Standard-Bots weiter (gleiche Kasse, gleiche Quellen).

| Strategie (ab Kapitelende des Standard-Bots) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |
| --- | ---: | ---: | ---: |
| vorsichtig | 92,3 % | 737.677 $ | 21,6 % |
| gierig | 75,3 % | 527.854 $ | 6,6 % |
| ausgewogen | 92,5 % | 815.338 $ | 21,6 % |
| betruegerisch | 85,1 % | 822.380 $ | 41,8 % |
| zufaellig | 64,0 % | 279.752 $ | 2,4 % |

### Cranes Feldzug (Kapitel 3)

Ab 10 Harlan-Tankstellen kündigt Margaret Crane einen Preiskrieg an (src/sim/feldzug.ts): Jacobs Marge an der Zapfsäule fällt auf 25 %, die Bank gibt nur 50 % des Rahmens, bis Cranes Kasse nach 4–8 Runden leer ist. Auswege: Preisabsprache (Spur für Delaney, Harlan behält nur 1 Regionen) oder Thornes Kredit (Pfand: die Mehrheit – nicht bezahlt = geschluckt). Anteile an den Kampagnen, die Kapitel 3 selbst gespielt haben; „davon geschluckt“ an denen mit Thornes Kredit.

| Strategie | Kapitel 3 begonnen | Feldzug erlebt | durchgehalten | Absprache | Netz verloren | bis Kapitelende | mitten im Krieg ausgeschieden | Thornes Kredit genommen | davon geschluckt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 991 | 95,2 % | 88,9 % | 0,0 % | 0,0 % | 6,3 % | 0,0 % | 0,0 % | – |
| gierig | 835 | 99,2 % | 90,8 % | 0,0 % | 0,0 % | 3,1 % | 5,3 % | 17,1 % | 4,2 % |
| ausgewogen | 927 | 99,6 % | 95,6 % | 0,0 % | 0,1 % | 3,9 % | 0,0 % | 4,2 % | 0,0 % |
| betruegerisch | 835 | 98,0 % | 0,0 % | 91,1 % | 0,0 % | 0,2 % | 6,6 % | 0,0 % | – |
| zufaellig | 110 | 6,4 % | 3,6 % | 2,7 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % | – |

### Betrug und Delaney

Der betrügerische Bot (GDD §17) zieht jeden schmutzigen Hebel (siehe oben); sein Risiko ist echt: Spuren machen Hitze, Delaney ermittelt, klagt an und verurteilt – bei viel Hitze zum Zwangsverkauf eines Teils der Quellen, ab 16 Hitzepunkten offener Spuren zu Haft (Kampagne zu Ende). Anteile an allen Kampagnen der Strategie, Stand am Ende der Kampagne (Merkzeichen der Ermittlung); Ø Hitze = Spuren plus Personal am Ende.

| Strategie | Vorermittlung | Anklage | verurteilt | Zwangsverkauf | Haft | Ø Hitze am Ende | Doppelspiel aufgeflogen | Preisabsprache im Feldzug |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vorsichtig | 23,4 % | 18,1 % | 8,0 % | 0,0 % | 0,0 % | 0,59 | 0,0 % | 0,0 % |
| gierig | 84,5 % | 83,8 % | 57,0 % | 5,4 % | 0,4 % | 1,40 | 0,0 % | 0,0 % |
| ausgewogen | 56,7 % | 32,1 % | 13,6 % | 0,2 % | 0,0 % | 1,31 | 0,0 % | 0,0 % |
| betruegerisch | 96,0 % | 95,6 % | 73,7 % | 69,9 % | 39,2 % | 3,32 | 79,3 % | 76,1 % |
| zufaellig | 53,2 % | 36,7 % | 13,9 % | 1,5 % | 0,0 % | 2,03 | 0,0 % | 0,3 % |

### Zielwerte Kapitel 1–3

Toleranzbereiche in balance.yaml unter bots.campaignTargets; gemessen in src/sim/campaignBots.ts (checkCampaignTargets).

| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |
| --- | --- | ---: | ---: | :---: |
| Ø Kreditkrisen je Kampagne (Kapitel 1–3, 24 Jahre; Welten ohne Kauf auf Kredit) | GDD §15: 2–4 je Kampagne (73 Jahre) → anteilig | 0,66 – 1,32 | 1,06 | ja |
| Ø Ölschwemmen je Kampagne (Kapitel 1–3) | GDD §15: 1–3 je Kampagne → anteilig | 0,33 – 1,00 | 0,66 | ja |
| Ø Kriege je Kampagne (Kapitel 1–3) | GDD §15: 0–2 je Kampagne → anteilig | 0,00 – 0,66 | 0,37 | ja |
| Standard-Bot spielt bis Ende Kapitel 3 | GDD §17: übersteht Kapitel 4 in 55–70 % → bis Kapitel 3 etwas mehr | 60,0 % – 90,0 % | 92,5 % | **nein** |
| Pleitequote Standard-Bot in Kapitel 2 (mit Sprung I), wenn Kapitel 1 bestanden | Krisen fordern Opfer, aber wer das Kapitel davor geschafft hat, überlebt meist | 0,0 % – 15,0 % | 0,4 % | ja |
| Pleitequote Standard-Bot in Kapitel 3 (mit Sprung II), wenn Kapitel 2 bestanden | wie Kapitel 2 | 0,0 % – 15,0 % | 0,2 % | ja |
| Pleitequote gierig über die Kampagne | GDD §15: wer im Boom zu viele Schulden macht, stirbt im Crash | 20,0 % – 75,0 % | 29,0 % | ja |
| Pleite gierig in Kapitel 1 mit Kreditkrise ÷ ohne | GDD §8/§15: in der Krise kündigt die Bank, der Crash trifft die Verschuldeten (über 1) | 1,50 – 20,00 | 1,32 | **nein** |
| Kapitelziel 2 Standard-Bot | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 57,6 % | ja |
| Kapitelziel 3 Standard-Bot | Kapitelprüfung erreichbar, aber nicht geschenkt | 20,0 % – 70,0 % | 50,5 % | ja |
| Ø Imperium Ende Kapitel 2 ÷ Ende Kapitel 1 (Standard-Bot) | GDD §13: aus der Firma wird ein Herausforderer | 1,50 – 50,00 | 5,64 | ja |
| Ø Imperium Ende Kapitel 3 ÷ Ende Kapitel 2 (Standard-Bot) | GDD §13: aus dem Herausforderer wird ein Konzern | 1,20 – 50,00 | 1,40 | ja |
| Ø Endwert vorsichtig ÷ bester Ø der Mutigeren | GDD §15: wer nie Schulden macht, wird überholt (unter 1) | 0,00 – 0,95 | 0,74 | ja |
| Höchste Siegquote einer Strategie (Endwert Kapitel 3) | GDD §17: keine Einzelstrategie gewinnt in mehr als 40 % | 0,0 % – 40,0 % | 45,1 % | **nein** |
| Höchste Siegquote einer Strategie bei gleichem Start (Kapitel 2/3 ab Kapitelende des Standard-Bots) | GDD §17 auf Kapitel 2 und 3 allein: kein Weg dominiert | 0,0 % – 40,0 % | 41,8 % | **nein** |
| Höchste Siegquote einer Haltung im Zeitsprung (Standard-Bot) | kein dominanter Weg: keine Haltung gewinnt fast immer | 0,0 % – 60,0 % | 39,7 % | ja |
| Kampagnen des betrügerischen Bots, die mit Haft enden | GDD §17/§10: Betrug lohnt sich manchmal, oft endet er vor Gericht | 10,0 % – 40,0 % | 39,2 % | ja |
| Kampagnen des betrügerischen Bots mit Verurteilung (Geldstrafe, Zwangsverkauf oder Haft) | GDD §10: Delaney erwischt ihn oft, aber nicht immer | 25,0 % – 80,0 % | 73,7 % | ja |

<!-- Kampagne: Ende -->

## Betrügerischer Bot (GDD §17)

Vierte echte Strategie `betruegerisch` neben vorsichtig, gierig und ausgewogen (der Zufalls-Bot bleibt). Er wirtschaftet wie der Standard-Bot und zieht jeden schmutzigen Hebel: in Kapitel 1 Förderbremse mit Klausel und Verrat an Crane, Gerücht, Bluff bei Thorne, schmutzige Briefantworten (jeder Schwerepunkt einer Spur zählt ihm 300 $ × Faktor der Briefe als Gewinn); in Kapitel 2/3 Gradys Reserveland, Sicherheitschef mit Sabotage, Anwalt Stufe 3 und politischer Druck gegen Delaney, Lobbyist mit Umschlägen, Doppelspiel im Konsortium, Preisabsprache im Feldzug nach 3 Runden Krieg. Die ehrlichen Bots wiegen Spuren seitdem als Risiko (`traceCost` je Schwerepunkt: vorsichtig 2.000 $, ausgewogen 1.000 $, gierig 200 $).

- Kapitel 1: alle Zielwerte im Rahmen; der Betrüger gewinnt 28,5 % der Seeds (Standard-Bot 30,2 %), hinterlässt im Schnitt 7,7 Schwerepunkte Spuren (Standard-Bot 1,2).
- Kampagne: Haft 31,7 %, Verurteilung 67 %, Zwangsverkauf 63 % (Ziele im Rahmen); Siegquote 21,6 %. Mit Anwalt Stufe 2 lag die Haft bei etwa 42 %.
- Rot und ohne Spieländerung nicht erreichbar: Ab dem Kapitelende des Standard-Bots („gleicher Start“) gewinnt der Betrüger 46 % – die Spuren aus Kapitel 1 fehlen ihm dort, und die Preisabsprache im Feldzug bringt mehr als Durchhalten (sofortige Absprache: Ø Endwert +115.000 $ über dem Standard-Bot, ohne Absprache −40.000 $; 40 Seeds). Das ist eine Frage der Kernbalance Kapitel 3 (`feldzug.pact`, Konsortium `doubleIncome`/`doubleDetect`), nicht der Bot-Politik. Die Siegquote des Standard-Bots über die Kampagne (55,2 %, vorher 67,8 %) und Kapitelziel 2 waren schon vorher rot.

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
