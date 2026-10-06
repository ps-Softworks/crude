# Weltmodell

Stand: 2026-10-06 · Version 0.4.20+12

Erzeugt mit `npm run welt` (tools/weltlaeufe.ts, Regeln in src/sim/world.ts und src/sim/laws.ts, Zahlen in content/balance.yaml unter worldModel, Gesetze in content/laws/).
300 Welten (Seeds `welt-0` bis `welt-299`) über eine ganze Kampagne: 292 Runden = 73 Spieljahre, **ohne Spieler**. Rechenzeit 2.1 s.

- Alle Werte endlich: **ja** · Krisenzahlen in der Mehrheit der Welten im GDD-Ziel: **ja**

## Verläufe

Je Zelle: 10 % · **Median** · 90 % der Welten am Ende des Spieljahres; Min/Max über alle Welten und Jahre.

| Größe | Jahr 0 | Jahr 1 | Jahr 2 | Jahr 4 | Jahr 5 | Jahr 10 | Jahr 15 | Jahr 20 | Jahr 25 | Jahr 30 | Jahr 40 | Jahr 50 | Jahr 60 | Jahr 73 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Weltpreis (Index) | 1,00 · **1,00** · 1,00 | 0,99 · **1,00** · 1,00 | 0,98 · **1,00** · 1,01 | 0,90 · **1,00** · 1,08 | 0,87 · **1,00** · 1,10 | 0,85 · **1,00** · 1,17 | 0,85 · **0,97** · 1,17 | 0,83 · **0,94** · 1,12 | 0,79 · **0,94** · 1,14 | 0,80 · **0,95** · 1,13 | 0,77 · **0,89** · 1,03 | 0,72 · **0,86** · 0,96 | 0,69 · **0,82** · 0,95 | 0,66 · **0,81** · 0,96 | 0,35 | 2,37 |
| Nachfrage (Index) | 1,00 · **1,00** · 1,00 | 1,05 · **1,05** · 1,05 | 1,09 · **1,09** · 1,09 | 1,19 · **1,19** · 1,20 | 1,24 · **1,25** · 1,25 | 1,54 · **1,55** · 1,56 | 1,90 · **1,92** · 1,93 | 2,33 · **2,36** · 2,39 | 2,83 · **2,88** · 2,92 | 3,41 · **3,48** · 3,54 | 4,74 · **4,85** · 4,95 | 6,13 · **6,26** · 6,36 | 7,30 · **7,41** · 7,49 | 8,26 · **8,32** · 8,36 | 1,00 | 8,37 |
| Förderkapazität (Index) | 1,18 · **1,19** · 1,19 | 1,24 · **1,24** · 1,25 | 1,29 · **1,30** · 1,31 | 1,36 · **1,41** · 1,49 | 1,41 · **1,48** · 1,58 | 1,71 · **1,84** · 1,97 | 2,14 · **2,29** · 2,46 | 2,64 · **2,84** · 3,02 | 3,24 · **3,43** · 3,71 | 3,87 · **4,12** · 4,47 | 5,47 · **5,77** · 6,21 | 7,07 · **7,46** · 8,11 | 8,36 · **8,82** · 9,78 | 9,43 · **9,88** · 11,19 | 1,18 | 13,42 |
| Lager (Quartalsbedarf) | 0,25 · **0,25** · 0,25 | 0,25 · **0,25** · 0,25 | 0,25 · **0,25** · 0,25 | 0,23 · **0,25** · 0,28 | 0,23 · **0,25** · 0,28 | 0,21 · **0,25** · 0,29 | 0,21 · **0,25** · 0,29 | 0,22 · **0,25** · 0,29 | 0,21 · **0,25** · 0,30 | 0,21 · **0,24** · 0,29 | 0,21 · **0,25** · 0,28 | 0,22 · **0,25** · 0,29 | 0,22 · **0,25** · 0,29 | 0,21 · **0,24** · 0,30 | 0,00 | 0,89 |
| Kreditklima (0–100) | 35 · **48** · 59 | 37 · **48** · 63 | 38 · **50** · 65 | 40 · **50** · 65 | 40 · **50** · 65 | 39 · **50** · 64 | 36 · **50** · 66 | 35 · **48** · 67 | 33 · **47** · 64 | 37 · **47** · 64 | 36 · **47** · 62 | 34 · **46** · 62 | 34 · **47** · 63 | 36 · **46** · 62 | 13 | 93 |
| Verschuldung (0–100) | 25 · **25** · 37 | 25 · **25** · 39 | 25 · **26** · 41 | 25 · **28** · 44 | 25 · **28** · 43 | 25 · **31** · 41 | 26 · **31** · 44 | 26 · **31** · 44 | 25 · **29** · 43 | 25 · **29** · 41 | 25 · **28** · 39 | 25 · **28** · 40 | 25 · **27** · 41 | 25 · **28** · 38 | 20 | 78 |
| Stimmung (0–100) | 50 · **54** · 59 | 48 · **52** · 56 | 46 · **51** · 55 | 46 · **51** · 55 | 45 · **50** · 55 | 43 · **49** · 55 | 42 · **49** · 55 | 44 · **50** · 55 | 43 · **49** · 56 | 42 · **49** · 54 | 41 · **49** · 55 | 43 · **50** · 56 | 42 · **49** · 55 | 42 · **49** · 55 | 10 | 70 |
| Außenspannung (0–100) | 12 · **18** · 26 | 12 · **19** · 25 | 11 · **18** · 25 | 12 · **19** · 25 | 12 · **19** · 27 | 13 · **20** · 48 | 14 · **22** · 67 | 13 · **22** · 49 | 14 · **21** · 60 | 14 · **23** · 64 | 15 · **25** · 60 | 16 · **26** · 56 | 19 · **29** · 72 | 21 · **31** · 80 | 0 | 100 |
| Technikstand (0–100) | 6 · **8** · 10 | 7 · **9** · 10 | 7 · **9** · 11 | 8 · **10** · 12 | 9 · **11** · 13 | 12 · **15** · 17 | 16 · **20** · 23 | 21 · **25** · 29 | 27 · **32** · 37 | 34 · **40** · 45 | 51 · **57** · 62 | 67 · **72** · 76 | 80 · **84** · 86 | 91 · **93** · 94 | 6 | 94 |
| Nationalismus (0–100) | 9 · **14** · 19 | 11 · **15** · 21 | 12 · **17** · 23 | 13 · **20** · 26 | 14 · **21** · 27 | 19 · **27** · 36 | 24 · **33** · 44 | 29 · **38** · 51 | 31 · **42** · 56 | 35 · **47** · 62 | 44 · **55** · 69 | 52 · **62** · 75 | 52 · **68** · 81 | 50 · **71** · 81 | 3 | 100 |

Median je Spieljahr als Kurve (Jahr 0 bis 73):

- Weltpreis (▁ 0,7 … █ 1,4): `▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▃▃▃▃▃▃▃▄▄▄▄▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂`
- Weltpreis 90 % (▁ 0,7 … █ 2,0): `▃▃▃▃▃▃▃▃▄▄▄▄▄▄▄▄▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▂▃▂▃▂▂▂▂▂▂▂▂▂▂▂▃▂▂▂▂▂▂▂▂▂▂`
- Kreditklima (▁ 30 … █ 70): `▄▄▄▄▄▅▅▄▄▄▅▅▅▅▄▄▄▅▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄`
- Verschuldung 90 % (▁ 20 … █ 60): `▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▆▆▅▅▅▅▅▅▅▅▅▅▄▄▄▄▄▅▄▄▄▄▄▄▅▄▅▅▅▅▄▄▄▄▄▄▅▅▅▅▅▅▄▅▅▅▅▄▄▄▄▄▄`
- Außenspannung 90 % (▁ 0 … █ 100): `▃▃▃▃▃▃▃▃▄▄▄▅▅▅▅▆▅▅▅▅▄▅▅▅▅▅▅▆▆▆▅▅▅▅▅▅▅▆▆▆▅▅▆▆▆▅▅▅▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▅▅▅▅▅▅▆▆▆▇`
- Stimmung (▁ 30 … █ 60): `▇▆▆▆▆▆▆▆▆▅▅▆▆▆▅▆▆▆▆▆▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▆▆▆▆▆▆▅▆▅▆▅▅▅▅▅▆▆▆▆▆▆▅▅▅`

## Krisen je Kampagne

| Krise | Ziel je Kampagne (GDD §15) | Ø | 10 % · 50 % · 90 % der Welten | Welten im Ziel | Ø in den ersten 20 Jahren |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kreditkrisen (Bankpanik + Crash) | 2–4 | 3,04 | 1 · 3 · 5 | 66,3 % | 0,87 |
| Ölschwemmen (Riesenfund) | 1–3 | 2,06 | 0 · 2 · 4 | 68,7 % | 0,57 |
| Kriege in Übersee | 0–2 | 1,31 | 0 · 1 · 3 | 86,0 % | 0,24 |
| davon große Crashs | – | 0,43 | 0 · 0 · 1 | – | 0,10 |
| davon Bankpaniken | – | 2,60 | 1 · 2 · 5 | – | 0,77 |
| Aufstände in Costa Negra | – | 2,89 | 1 · 3 · 5 | – | 0,32 |
| Ölembargos aus Qasir | – | 0,55 | 0 · 0 · 2 | – | 0,00 |
| Verstaatlichungen | – | 0,70 | 0 · 1 · 1 | – | 0,00 |
| Regierungswechsel (von 18 Wahlen) | – | 9,26 | 6 · 9 · 12 | – | 2,43 |

Regierung: Handelspartei 25,6 %, Volksbund 32,5 %, Provinzliga 41,9 % der Regierungszeit.

Kreditzyklus (4.4): Welten mit großem Crash in den ersten 20 Jahren: **9,3 %** (Fertig-Kriterium 5–25 %). Vor 100,0 % der 130 Crashs warnte die Zeitung in den 8 Runden davor vor der Blase; die Warnung steht in 4,9 % aller Runden. Ausland: Vor 76,1 % der 866 Aufstände stand „Unruhen in Costa Negra“ (in 4,2 % aller Runden), vor 95,2 % der 165 Embargos „Verstimmung in Qasir“ (in 1,8 % aller Runden).

## Krisen über die Zeit

Jede Welt ist neu (GDD §7.2): Kreditkrisen und Kriege sollen nicht in allen Welten zur selben Zeit kommen. Je Fenster von 5 Spieljahren: Ø Krisen je Welt und Anteil der Welten, deren erste Kreditkrise dort liegt (der Rest: ohne).

| je Welt | J. 0–4 | J. 5–9 | J. 10–14 | J. 15–19 | J. 20–24 | J. 25–29 | J. 30–34 | J. 35–39 | J. 40–44 | J. 45–49 | J. 50–54 | J. 55–59 | J. 60–64 | J. 65–69 | J. 70–72 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kreditkrisen | 0,14 | 0,26 | 0,23 | 0,23 | 0,25 | 0,22 | 0,22 | 0,20 | 0,18 | 0,22 | 0,16 | 0,19 | 0,21 | 0,22 | 0,11 |
| erste Kreditkrise (Anteil Welten) | 14,3 % | 20,7 % | 11,3 % | 7,7 % | 11,0 % | 6,3 % | 6,0 % | 3,3 % | 2,3 % | 2,3 % | 2,3 % | 1,3 % | 2,3 % | 2,3 % | 0,7 % |
| davon große Crashs | 0,01 | 0,03 | 0,03 | 0,03 | 0,05 | 0,03 | 0,05 | 0,02 | 0,01 | 0,03 | 0,03 | 0,03 | 0,03 | 0,04 | 0,02 |
| Kriege | 0,00 | 0,06 | 0,10 | 0,08 | 0,08 | 0,10 | 0,09 | 0,10 | 0,10 | 0,08 | 0,08 | 0,12 | 0,11 | 0,10 | 0,10 |

## Preisausschläge

- Größter Preisrückgang binnen eines Jahres je Welt: Median 44,0 %, 90 % 59,3 %; Welten mit einem Einbruch von mindestens 40 %: 59,0 % (GDD §7.3: „fast −50 % in einem Jahr“ soll vorkommen).
- Größter Preisanstieg binnen eines Jahres: Median 42,2 %, 90 % 83,4 %.

## Kapitel 1 (Runde 1–16)

- Faktor auf den Trendpreis am Salt Hill nach 16 Runden: 10 % 0,948 · Median 1,001 · 90 % 1,040 (Grenze ±15,0 %).
- Zinsaufschlag der Bank je Runde: 10 % -0,25 · Median 0,00 · 90 % 0,25 Prozentpunkte (Grenze ±3,00).
- Runden, in denen der Faktor höchstens ±2 % vom Neutralwert abweicht: 80,1 %; Zins billiger: 24,7 %, teurer: 30,4 % der Runden.
- Wahlen in Kapitel 1: 300; es siegt Handelspartei 69,7 %, Volksbund 16,3 %, Provinzliga 14,0 %; Wiederwahl 74,0 %.
- Welten mit einer Kreditkrise in Kapitel 1: 10,7 % (davon großer Crash: 0,0 %); mit einem Krieg: 0,0 %.
- Ob die Kapitel-1-Balance hält, zeigt `npm run bots` (docs/botlaeufe.md) – die Bots spielen mit Weltmodell.

## Gesetze (4.3)

Kein Gesetz hat ein festes Jahr: Druck aus dem Weltzustand → Antrag → Debatte → Abstimmung (content/laws/, Ablauf in balance.yaml unter worldModel.laws).

| Gesetz | Welten mit Beschluss | Jahr des Beschlusses 10 % · 50 % · 90 % | verschiedene Runden | Ø Anträge | Ø Niederlagen | beschlossen in Kapitel 1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Einkommensteuer | 59,3 % | 14 · 31 · 61 | 131 | 0,81 | 0,21 | 0,0 % |
| Kartellgesetz | 65,0 % | 13 · 28 · 55 | 133 | 1,00 | 0,35 | 0,0 % |

Marktanteil des größten Konzerns (Crane Trust), 10 % · Median · 90 %: Jahr 0: 31,6 % · **38,2 %** · 44,5 %; Jahr 10: 36,0 % · **42,4 %** · 48,8 %; Jahr 20: 33,3 % · **40,6 %** · 48,0 %; Jahr 40: 24,4 % · **35,0 %** · 45,5 %; Jahr 73: 18,9 % · **29,2 %** · 42,4 %.

## Beispielwelt `welt-0`

- Jahr 11: Wahl: Provinzliga regiert (Weltpreis 0,83, Kreditklima 69, Verschuldung 53, Spannung 18)
- Jahr 14: Crash (Weltpreis 0,82, Kreditklima 26, Verschuldung 25, Spannung 22)
- Jahr 15: Banken erholt, Wahl: Handelspartei regiert (Weltpreis 0,76, Kreditklima 30, Verschuldung 25, Spannung 22)
- Jahr 19: Wahl: Provinzliga regiert (Weltpreis 1,20, Kreditklima 53, Verschuldung 26, Spannung 74)
- Jahr 22: Krieg (Weltpreis 0,94, Kreditklima 76, Verschuldung 46, Spannung 99)
- Jahr 23: Bankpanik (Weltpreis 1,10, Kreditklima 44, Verschuldung 41, Spannung 100)
- Jahr 23: Aufstand in Costa Negra (Weltpreis 1,13, Kreditklima 49, Verschuldung 39, Spannung 100)
- Jahr 24: Einkommensteuer Antrag (Weltpreis 1,22, Kreditklima 51, Verschuldung 39, Spannung 100)
- Jahr 24: Banken erholt (Weltpreis 1,26, Kreditklima 48, Verschuldung 38, Spannung 100)
- Jahr 24: Einkommensteuer beschlossen (55 % Ja) (Weltpreis 1,30, Kreditklima 57, Verschuldung 38, Spannung 100)
- Jahr 25: Costa Negra fördert wieder (Weltpreis 1,33, Kreditklima 57, Verschuldung 38, Spannung 100)
- Jahr 25: Embargo aus Qasir (Weltpreis 1,29, Kreditklima 60, Verschuldung 39, Spannung 100)
- Jahr 26: Frieden (Weltpreis 1,48, Kreditklima 64, Verschuldung 40, Spannung 22)
- Jahr 26: Embargo aufgehoben (Weltpreis 0,96, Kreditklima 72, Verschuldung 44, Spannung 27)
- Jahr 28: Aufstand in Costa Negra (Weltpreis 0,61, Kreditklima 65, Verschuldung 51, Spannung 25)
- Jahr 29: Costa Negra fördert wieder (Weltpreis 0,70, Kreditklima 68, Verschuldung 54, Spannung 25)
- Jahr 30: Aufstand in Costa Negra (Weltpreis 0,68, Kreditklima 64, Verschuldung 55, Spannung 22)
- Jahr 31: Costa Negra fördert wieder (Weltpreis 0,79, Kreditklima 66, Verschuldung 56, Spannung 21)
- Jahr 35: Crash (Weltpreis 0,74, Kreditklima 24, Verschuldung 26, Spannung 17)
- Jahr 35: Aufstand in Costa Negra (Weltpreis 0,66, Kreditklima 25, Verschuldung 26, Spannung 19)
- Jahr 36: Banken erholt (Weltpreis 0,76, Kreditklima 29, Verschuldung 26, Spannung 21)
- Jahr 36: Costa Negra fördert wieder (Weltpreis 0,90, Kreditklima 30, Verschuldung 26, Spannung 19)
- Jahr 41: Krieg (Weltpreis 1,06, Kreditklima 54, Verschuldung 28, Spannung 100)
- Jahr 43: Wahl: Volksbund regiert (Weltpreis 1,20, Kreditklima 81, Verschuldung 38, Spannung 100)
- Jahr 43: Bankpanik (Weltpreis 1,05, Kreditklima 43, Verschuldung 33, Spannung 100)
- Jahr 44: Banken erholt, Kartellgesetz Antrag (Weltpreis 1,03, Kreditklima 45, Verschuldung 32, Spannung 100)
- Jahr 44: Aufstand in Costa Negra (Weltpreis 1,03, Kreditklima 49, Verschuldung 31, Spannung 100)
- Jahr 45: Kartellgesetz beschlossen (52 % Ja) (Weltpreis 1,12, Kreditklima 51, Verschuldung 31, Spannung 100)
- Jahr 45: Frieden (Weltpreis 1,14, Kreditklima 51, Verschuldung 31, Spannung 22)
- Jahr 45: Costa Negra fördert wieder (Weltpreis 0,93, Kreditklima 50, Verschuldung 31, Spannung 24)
- Jahr 46: Embargo aus Qasir (Weltpreis 0,75, Kreditklima 47, Verschuldung 30, Spannung 23)
- Jahr 47: Wahl: Provinzliga regiert (Weltpreis 1,01, Kreditklima 44, Verschuldung 30, Spannung 28)
- Jahr 48: Embargo aufgehoben (Weltpreis 1,05, Kreditklima 50, Verschuldung 29, Spannung 40)
- Jahr 49: Aufstand in Costa Negra (Weltpreis 0,66, Kreditklima 51, Verschuldung 29, Spannung 40)
- Jahr 51: Costa Negra fördert wieder (Weltpreis 0,77, Kreditklima 50, Verschuldung 29, Spannung 37)
- Jahr 53: Verstaatlichung (Weltpreis 0,81, Kreditklima 42, Verschuldung 28, Spannung 36)
- Jahr 67: Wahl: Handelspartei regiert (Weltpreis 0,82, Kreditklima 55, Verschuldung 28, Spannung 27)
- Jahr 72: Bankpanik (Weltpreis 0,75, Kreditklima 34, Verschuldung 34, Spannung 33)
- Jahr 73: Banken erholt (Weltpreis 0,79, Kreditklima 36, Verschuldung 33, Spannung 32)

<!-- Ab hier von Hand geschrieben: npm run welt lässt den Rest stehen. -->

## Wie das Weltmodell rechnet (4.1)

Code: `src/sim/world.ts` (eine Runde = `advanceWorld`), Auswertung `src/sim/worldRun.ts`, Zeitungsmeldungen `src/sim/worldNews.ts`, Zahlen `content/balance.yaml` → `worldModel`, Texte `content/newspaper.yaml` (`world_…`). Die Welt hat einen eigenen Zufall (Seed + „:welt“); Karte, Ereignisse und Rivalen würfeln wie vorher.

**Die neun Weltgrößen (GDD §7.1)**

| Größe | Im Zustand | Was sie treibt | Was sie auslöst |
| --- | --- | --- | --- |
| Angebot & Lager | `capacity`, `output`, `stock`, `pipeline` | Neubohrungen nach Knappheit und Kreditklima (mit 6 Runden Verzug), Erschöpfung 2 %/Runde, Riesenfunde, Verstaatlichung | Ölschwemme, Preissturz |
| Nachfrage | `demand` (+ `effectiveDemand`) | Wachstum bis zur Sättigung, Technik beschleunigt; Aufrüstung, Krieg (+), Crash (−) | Knappheit, Preisanstieg |
| Kreditklima | `credit` 0–100 | Boom (Knappheit über 1), Spekulation über 50 (schaukelt sich auf), Regierung, Rückkehr zur Mitte | Crash: Klima fällt auf ein Drittel, Neubohrungen halbiert, Nachfrage −8 %, Zinssprung |
| Öffentliche Stimmung | `mood` 0–100 | teures Öl, Arbeitslosigkeit (Crash), Krieg, Wohlstand (Kreditklima) | Wahlsiege |
| Politische Lage | `parties`, `government`, `electionIn` | Stimmung (sauer → Volksbund, froh → Handelspartei), billiges Öl → Provinzliga, Regierungsmüdigkeit; Wahl alle 16 Runden | Regierung färbt das Kreditklima (Handel lockert, Volksbund bremst) |
| Außenspannung | `tension` 0–100, `war` | Knappheit (über 1,1), Aufrüstung über 40 (ab gut 60 stärker als die Diplomatie), Nationalismus | Krieg in Übersee (Nachfrage +12 %), danach Entspannung |
| Technikstand | `tech` 0–100 | wächst logistisch (Forschung aller Firmen) | billigerer Trendpreis, schnellere Nachfrage |
| Nationalismus | `nationalism` 0–100 | Ölhunger der Welt (× Nachfrage), Spannung | Verstaatlichung: −6 % Kapazität |
| (Ölpreis) | `price` | T · (Nachfrage / mögliche Förderung)^1,4 · Lagerdruck, begrenzt 0,35–2,8 | alles oben |

**Drei Rückkopplungen.** (1) Preis → Neubohrungen → Angebot → Preis: dämpft sich, aber erst nach dem Verzug – dazwischen laufen Tanks über oder leer. (2) Boom → Kreditklima → mehr Bohrungen und Spekulation → Klima steigt weiter → Crash; nach dem Crash fehlen Bohrungen, das Öl wird knapp, der nächste Boom beginnt. (3) Knappheit → Spannung → Aufrüstung → Nachfrage → Knappheit → Krieg.

**Kapitel 1 spürt die Welt sanft.** Der Trendpreis des Posted Price am Salt Hill wird mit `1 + 0,5 × (Weltpreis − 1)` multipliziert (höchstens ±15 %); neue Bankkredite bekommen einen Zinsaufschlag aus dem Kreditklima (±1 Punkt, im Crash +2, höchstens ±3, auf Viertelpunkte). Die Zeitung bringt höchstens eine Weltmeldung je Runde: was geschah (Crash, Krieg, Frieden, Verstaatlichung, Riesenfund, Wahl, Erholung) oder ein Frühwarnzeichen (enges/lockeres Geld, diplomatische Noten, Unmut) – nie eine Zahl. Salt Hill fließt mit seinem Über- oder Unterangebot winzig in die Welt ein (`saltHillInput`). Die Bank zeigt den heutigen Zins mit Aufschlag. Im Debug-Reiter stehen die Weltgrößen als Zahl.

**Spielstand.** Format 14 speichert `worldModel`; ältere Stände (Format 12/13) bekommen eine ruhige Durchschnittswelt (`neutralWorld`, eine Momentaufnahme der Spielzahlen, weil das Laden balance.yaml nicht kennt). Passt die gespeicherte Pipeline nicht zu `supply.delay` (alter Stand oder geänderte Zahl), gleicht `advanceWorld` sie sofort an (`pipelineFor`): Überzählige Bohrungen werden gleich fertig, fehlende vorne mit dem Durchschnitt aufgefüllt.

**Spieler-Eingriffe.** `advanceWorld` nimmt `WorldInput` (Angebot, Kredit, Stimmung, Spannung, Nationalismus verschieben). Kapitel 1 nutzt nur das Angebot; Lobby, Presse, Bank usw. hängen sich ab Kapitel 2 hier ein. Für Zeitsprünge gibt es `skipWorld`.

**Entscheidungen (ohne Rückfrage getroffen).**
- Die drei Schleifen standen im GDD nur als Hinweis („Schleife 1 dämpft, 2 und 3 schaukeln sich auf“); die Zuordnung oben ist aus §7.1/§7.2 abgeleitet.
- Ölschwemme = Riesenfund (Zufall je Runde, häufiger nicht). Gezählt werden Riesenfunde; Preiseinbrüche stehen getrennt unter „Preisausschläge“.
- Krieg ist immer „in Übersee“ (Aldmark gegen Varenhold); ob die Föderation eintritt, entscheidet erst das Parlament in späteren Kapiteln.
- Parteien kehren langsam zur Mitte zurück, die regierende Partei verliert etwas (Regierungsmüdigkeit) – sonst regierte eine Partei jahrzehntelang.
- Zielbereiche aus GDD §15 gelten je Kampagne; die Tests verlangen, dass die Mehrheit (> 60 %) der Welten darin liegt.

**Offen.** Welt-Einstellungen ruhig/normal/stürmisch (GDD §15) – dafür reicht später ein Satz Faktoren auf die Schwellen. Regionale Preise (§7.3 je Region), Gesetze (§10), Quoten, Kartell und die Wirkung der Spieler-Eingriffe kommen mit den späteren Kapiteln. Alle Zahlen in `worldModel` sind Platzhalter.

## Nachprüfung 4.1 (gleiche Version 0.4.1)

Ein Prüfer hat sechs Befunde gemeldet; alle nachgemessen (1000 Welten) und echt, alle behoben:

1. **Zeitung schnitt Weltereignisse ab.** Die Weltmeldung stand hinten, `maxItems` = 3 schnitt sie bei drei Salt-Hill-Meldungen weg – auch einen Crash. Jetzt stehen große Ereignisse (Crash, Krieg, Verstaatlichung, Riesenfund) **vorn**; kleine (Wahl, Frieden, Stimmungen) weiter hinten und weichen bei voller Zeitung. Test mit drei lokalen Meldungen plus Crash.
2. **Feste Zahlen im Code** → balance.yaml: `credit.priceTriggerFrom` (60), `credit.pipelineCut` (0,5), `credit.investCut` (0,5), `tension.scarcityFrom` (1,1), `tension.nationalismFrom` (50), dazu `price.trendMin` (0,5). Je ein Test, dass die Zahl wirkt.
3. **Ersatzwelt und Pipeline-Länge.** Siehe „Spielstand“ oben (`pipelineFor`); `neutralWorld` rechnet jetzt dasselbe Gleichgewicht wie eine neue Welt. Tests für zu lange/zu kurze Pipeline und eine ruhige Ersatzwelt.
4. **Startlage war kein Gleichgewicht** (alle Welten: Preis Jahr 1 = 1,03, Kreditklima-Median 50 → 62 in Jahr 5, 40 % der ersten Crashs in Jahr 5–9). Ursachen: Die Firmen bohrten für das Wachstum ohne den Verzug, die Aufrüstungs-Nachfrage fehlte in der Startkapazität, und in **jeder** Welt regierte zu Beginn die Handelspartei (lockert das Kreditklima jede Runde). Jetzt: Startkapazität deckt die Nachfrage samt Aufrüstung, die Pipeline liefert genau das Wachstum, Neubohrungen rechnen den Verzug mit ein (ohne Zufall bleibt die Knappheit über 73 Jahre in ±1 %). Parteien-Startanteile breiter (in ~25 % der Welten führt eine andere Partei), Kreditklima startet breiter (32–62, verschiedene Phasen des Zyklus). Damit die Krisenzahl im Ziel bleibt: Spekulation 0,09, Rauschen 3,5, Crash ab 68, Regierungswirkung +0,3/−0,4. Ergebnis: Crashs je 5 Jahre 0,11–0,29 über die ganze Kampagne, kein Fenster mit mehr als ~19 % der ersten Crashs (Tests: kein Fenster über doppeltem Schnitt, kein Fenster über 25 % der ersten Crashs, Kreditklima-Median wandert in Jahr 1–8 um weniger als 5).
5. **Technik-Trend wirkte nicht auf den Preis**, das Lager lief leer (Median 0,25 → 0,08). Jetzt richten sich Auslastung, Neubohrungen, Kreditboom, Spannung, Stimmung und Politik nach der **Knappheit** = Weltpreis ÷ Trendpreis (`knappheit()`). Der Preis folgt dem Trend (Median Jahr 73: 0,80), das Lager bleibt bei 0,25. Test: Lager-Median Jahr 73 nahe `stockNorm`.
6. **Kapitel 1 spürte die Welt kaum und immer gleich** (Zins in 47 % der Runden billiger, nur 3 % teurer; Handelspartei gewann 272 von 273 Wahlen; „Die neue Regierung …“ auch bei Wiederwahl). Jetzt: Zins in je gut einem Viertel der Runden billiger bzw. teurer, andere Parteien gewinnen ~30 % der Wahlen in Kapitel 1, eigene Zeitungstexte für die Wiederwahl (`world_reelected_…`, Weltnachricht `reelection`), `chapter1.priceWeight` 0,3 → 0,5 (Faktor nach 16 Runden 0,92–1,03). `npm run bots`: alle 15 Zielwerte im Rahmen.

Nebenbei: Die langen Monte-Carlo-Tests bekommen mehr Zeit (vite.config `testTimeout` 30 s, Bot-Test 10 min) – auf einem ausgelasteten Rechner liefen sie sonst in Zeitüberschreitungen, ohne dass etwas falsch war.

**Offen.** Über die ganze Kampagne regiert die Handelspartei jetzt seltener (gut 20 % der Zeit, Volksbund und Provinzliga je knapp 40 %), weil die Stimmung im Schnitt leicht unter 50 liegt (Crashs) und billiges Öl nach Riesenfunden die Provinzliga stärkt. Ob das so bleiben soll, klärt sich mit den Politik-Schritten (§10).

## Parteien, Stimmung, Wahlen (4.2, Version 0.4.2)

Code: `src/sim/politics.ts` (Taten aufzeichnen, Umfrage, Wahlergebnis, Inhalte lesen), Regeln in `src/sim/world.ts` (`actsInput`, Wahltag in `advanceWorld`), Zahlen `content/balance.yaml` → `worldModel.acts`, `worldModel.programs`, `worldModel.news.pollFrom`, Texte `content/politics.yaml` (Parteinamen, Programme) und `content/newspaper.yaml` (`public_…`, `world_poll_…`). Tests: `src/sim/politics.test.ts`.

**Öffentliches Handeln.** Elf Taten (`PUBLIC_ACTS`): Preiskampf (ab Kapitel 2), Front der Unabhängigen gegen den Trust, Feldbrand, Streik, Streikbrecher, Spende für die Stadt, Unterstützung je Partei (3), gute Presse, Skandal. Eine Antwort in einem Ereignis trägt sie mit `public: [field_fire]`; ein Tankbrand im Lager zählt von selbst als Feldbrand. Die Tat wartet in `worldModel.acts` und wirkt am Rundenende: Stimmungspunkte **sofort** auf die Stimmung (`moodKick`) (danach zieht `mood.speed` sie langsam zum Ziel zurück), dazu Anteile je Partei vor dem Normieren. Je Runde höchstens ±6 Stimmungspunkte und ±1,5 Prozentpunkte je Partei. Die Zeitung der nächsten Runde berichtet über die lauteste Tat (`actsDone`). Getaggt sind 15 Antworten in Kapitel 1, u. a. Delgados Verband gegen Cranes Abschlag (Front gegen den Trust), „Das ist Bullards Feuer“ und „Brennen lassen“ (Feldbrand), Streikbrecher/Aussitzen, Bretterkirche, Noras Interview, Spenden an Teague/Harrow, Liga-Petition.

**Parteiprogramme.** Jede Partei hat ein Programm (Texte in politics.yaml) und regiert spürbar anders: beim Kreditklima (schon 4.1: Handel lockert, Volksbund bremst) und neu mit der **Strenge** (`programs.*.scrutiny`), mit der Verfehlungen die Stimmung drücken – unter dem Volksbund wiegt ein Feldbrand doppelt so schwer wie unter der Handelspartei (1,5 gegen 0,75). Gutes wird nicht gewichtet.

**Wahlen.** Weiter alle 16 Runden; die Stimmen sind die Parteianteile am Wahltag – Stimmung, Ölpreis, Regierungsmüdigkeit und Jacobs Taten stecken darin. Das Ergebnis wird gemerkt (`lastElection`: Anteile, Sieger, Vorgänger). Zwei Runden vorher (`news.pollFrom`) bringt die Zeitung eine Umfrage, wer vorn liegt – bei weniger als 1,5 Prozentpunkten Abstand (`news.pollClose`) als „Kopf an Kopf“ mit dem Hinweis, dass jetzt jede Schlagzeile die Wahl kippen kann. In der Ausgabe nach der Wahl druckt sie das Ergebnis in Prozent mit Balken und das Programm der Sieger.

**Spielstand.** Format 15; Stände aus Format 14 bekommen leere Taten und keine gemerkte Wahl (`withPoliticsDefaults`), 12/13 wie bisher eine Durchschnittswelt.

**Wirkung (gemessen).** Ohne Spieler ist die Welt unverändert (gleiche Zahlen wie oben, Taten ziehen keinen Zufall). Test: Feldbrand verschiebt die Stimmung genau um −3 × Strenge, Delgados Verband um +1 (Volksbund und Provinzliga gewinnen), ein echter Preiskampf um +1, alles klingt in den Folgerunden ab; eine Streikbrecher-Tat kippt eine knappe Wahl. `npm run bots`: alle 15 Zielwerte im Rahmen, Ergebnisse gleich wie vorher – Bots lösen kaum Taten aus, und ein paar Stimmungspunkte ändern den Zins in Kapitel 1 nur, wenn sie eine Wahl kippen.

**Entscheidungen (ohne Rückfrage).**
- Ein amtliches Wahlergebnis ist eine öffentliche Zahl und steht darum als Prozent in der Zeitung; Stimmung, Kreditklima und Parteianteile zwischen den Wahlen bleiben weiter nur angedeutet (die Umfrage nennt nur, wer vorn liegt).
- Kapitel 1 kennt keinen eigenen Preiskampf des Spielers, darum trägt dort keine Antwort `price_war`. Ab Kapitel 2 (Marktmacht, GDD §7.3) kommt er vom echten Unterbieten über `recordAct`.
- Ein Ölmann in Cordova bewegt das ganze Land nur wenig: 1–3 Stimmungspunkte je Tat, weniger als das Rauschen einer Runde (3). Spürbar wird es über mehrere Taten, eine knappe Wahl oder ein strenges Programm.
- Zwei Arten Eingriff im `WorldInput`: `moodShift` verschiebt wie in 4.1 dauerhaft das **Ziel** der Stimmung, `moodKick` (Taten) stößt die Stimmung **einmal** an. `skipWorld` gibt `moodKick` und `partyShift` nur in der ersten Runde mit, dauerhafte Eingriffe in jeder.

**Nach Prüfung (drei Befunde, alle echt, alle behoben).**
1. *`moodShift` hatte still die Bedeutung gewechselt* (Ziel → sofort auf die Stimmung). Ein dauerhafter Eingriff über `skipWorld` hätte im Zeitsprung 1/speed-mal (5×) so stark gewirkt. Jetzt getrennt in `moodShift` (dauerhaft, aufs Ziel) und `moodKick` (einmalig); Test: +5 dauerhaft über 80 Runden = +5 im Gleichgewicht, ein Stoß im Zeitsprung wirkt nur einmal.
2. *„Preiskampf“ an der falschen Antwort.* Delgados Verband ist eine gemeinsame Front gegen den Trust – beliebt bei Farmern und Arbeitern (Weltbibel: Volksbund als natürlicher Verbündeter). Neue Tat `independents_stand` (+1 Stimmung, Volksbund +0,3, Provinzliga +0,6, Handelspartei −0,4 Prozentpunkte), eigene Meldung „Die Unabhängigen trotzen dem Trust“. `price_war` bleibt für echtes Unterbieten ab Kapitel 2, jetzt mit +1 Stimmung (billiges Öl, GDD §7.1) und Gewinn für die Provinzliga; Zeitungstext passt dazu.
3. *Kaum spürbar in Kapitel 1.* Nachgemessen (1000 Welten, alle Wahlen): Ein einzelner Feldbrand kippt 6 % der Wahlen. Neu: „Kopf an Kopf“-Umfrage, wenn die beiden Ersten weniger als 1,5 Punkte trennen – in gut jeder vierten Umfrage (28 % in Kapitel 1), und sie steht vor 85 % der Wahlen, die ein Brand kippen würde. So weiß Jacob, wann seine Taten zählen.

**Rückmeldung in Kapitel 1 (bewusst).** Jacob merkt Politik in Kapitel 1 nur über die Zeitung: Meldung über seine Tat, Umfrage (mit „Kopf an Kopf“), Wahlergebnis mit Programm, ab sehr schlechter Stimmung (unter 32) eine Unmutsmeldung. Spielwirkung hat die Regierung nur über das Kreditklima auf den Zins (±¼ Punkt); `npm run bots` bleibt darum gleich. Echte Folgen (Gesetze, Aufsicht, Ermittlungen) kommen mit den Politik-Schritten (§10), Politik wird laut GDD §13 erst ab Kapitel 4 Tagesgeschäft.

**Offen / Entwurf.** Programmpunkte und Zeitungstexte sind Entwürfe von Claude. Idee für mehr Rückmeldung: Folgebrief oder -besuch, wenn der Volksbund regiert und Jacob einen Brand oder Streikbrecher auf dem Kerbholz hat (bräuchte ein Gedächtnis für Taten und eine Ereignis-Bedingung „Regierung“); oder eine Zeile „Harlans Feuer hat die Wahl entschieden“, wenn die Wahl ohne seine Taten anders ausgegangen wäre. Gesetze (§10) aus Programm + Regierung, Lobby/Gefallen als Währung, Ermittlungen, Briefe oder Besuche von Wahlkämpfern kurz vor der Wahl (bräuchte eine Ereignis-Bedingung „Wahl in höchstens n Runden“), Taten der Rivalen (Crane, Thorne) und wie stark Presse (Nora, eigene Zeitung ab Kapitel 2) Taten verstärkt.

## Gesetzeskatalog (4.3, Version 0.4.3)

Code: `src/sim/laws.ts` (Bedingungen, Ablauf, Wirkung, Zeitung, Prüfprogramm), eingehängt in `advanceWorld` (world.ts: `lawsInput`, Parlament am Rundenende), Gesetze `content/laws/*.yaml` (Felder in `content/laws/README.md`), Ablaufzahlen `content/balance.yaml` → `worldModel.laws`, allgemeine Zeitungstexte `content/politics.yaml` → `laws`. Tests: `src/sim/laws.test.ts`. Statistik oben unter „Gesetze (4.3)“ (`npm run welt`).

**Ablauf (GDD §10: kein festes Jahr).** Jedes Gesetz sammelt je Runde **Druck**: alter Druck × 0,85 plus die Punkte aller Gründe, die gerade stimmen (Weltgrößen wie Stimmung, Kreditklima, Spannung, Knappheit; Krieg, Crash; Regierung; Sitze je Fraktion; Marktanteil des Trusts). Über der Schwelle des Gesetzes kommt mit 20 % je Runde ein **Antrag** (höchstens einer zugleich im Parlament), danach 2–3 Runden **Debatte** (die Zeitung sagt in der letzten Runde, ob die Mehrheit steht, knapp ist oder fehlt) und die **Abstimmung**: Sitze × Haltung der Fraktionen (`votes`) plus Lage am Tag (`swing`, z. B. Krieg +10 Punkte für die Steuer) plus ±4 Punkte Zufall; über 50 % = beschlossen. Abgelehnt: 12 Runden Ruhe, Druck auf 30 %. Beschlossen bleibt beschlossen. Die Sitze sind das Ergebnis der letzten Wahl (vorher die Anteile zu Kampagnenbeginn).

**Die ersten zwei Gesetze.**
- *Kartellgesetz* (`antitrust`): Druck bei Trust-Anteil ab 40 % (+1,2) und ab 50 % (+1), Stimmung ≤ 45 (+0,4), Volksbund regiert (+0,6), Volksbund-Fraktion ≥ 38 % (+0,3), Handelspartei regiert (−0,8); Schwelle 11. Zustimmung Handel 10 %, Volksbund 85 %, Provinzliga 50 %, Trust ≥ 50 % +4 Punkte. Wirkung: Trust-Anteil −0,003 je Runde, Stimmungsziel +1; Regeln `cartelBan` 1, `breakupFrom` 0,45 (verwässert 0,6).
- *Einkommensteuer* (`income_tax`): Druck bei Krieg (+2,2), Crash (+1,8), Spannung ≥ 60 (+0,6), Stimmung ≤ 40 (+0,4), Volksbund (+0,6), Handelspartei (−0,8); Schwelle 10. Zustimmung 15/80/40 %, Krieg +10, Crash +4, Kreditklima ≥ 65 −5 Punkte. Wirkung: Kreditklima −0,15 je Runde (Gleichgewicht ≈ −3 Punkte), Stimmungsziel +0,5; Regel `incomeTax` 0,07.

**Marktanteil des Trusts** (`laws.trustShare`, Hilfsgröße für das Kartellgesetz, GDD §10 „eine Firma über 40 %“): startet je Welt bei 30–46 %, kehrt langsam zu 38 % zurück, wächst unter der Handelspartei (+0,25 Punkte je Runde, Weltbibel: „Trusts wachsen ungestört“), schrumpft unter dem Volksbund (−0,2, Aufsicht), wächst bei billigem Geld (Übernahmen: ±0,1 × (Kreditklima − 50) ÷ 50), steigt in jeder Crash-Runde (+0,6 Punkte, Pleitefirmen werden aufgekauft) und nach Riesenfunden (+3 Punkte). Würfelt mit dem Gesetzes-Zufall.

**Gemessen (300 Welten, ganze Kampagne).** Kartellgesetz in ~79 % der Welten (nach Prüfung; vorher ~90 %), Einkommensteuer in ~67 %, Beschlüsse zwischen Jahr ~10 und ~60 (Median Jahr 25/26), über 130 verschiedene Runden, rund jede dritte Abstimmung scheitert. In Kapitel 1 kommt ab und zu ein Antrag, beschlossen wird praktisch nie (0 von 300; 4 von 1000 beim Kartellgesetz). Test „Fertig-Kriterium 4.3“: je Gesetz mindestens 5 % der Welten ohne Beschluss, 10–90-%-Spanne mindestens 20 Jahre, keine Runde mit mehr als 5 % der Beschlüsse; Einkommensteuer fällt in über 85 % der Fälle in Krieg/Crash; ein Gesetz ohne erfüllbaren Grund kommt nie. Ohne beschlossenes Gesetz läuft die Welt Zahl für Zahl wie ohne Katalog (eigener Zufall); die Krisenzahlen oben bleiben im GDD-Ziel. `npm run bots`: alle 15 Zielwerte im Rahmen, Ergebnisse unverändert.

**Nach Prüfung (drei Befunde, alle echt, alle behoben).**
1. *Abstimmung „50 : 50“ unter „beschlossen“.* Die Zeitung rundete auf ganze Prozent, angenommen ist aber erst über 50 % – knapp jede zehnte Abstimmung erschien als 50 : 50, mal beschlossen, mal abgelehnt. Jetzt rundet `votePercent` passend zum Ausgang: beschlossen mindestens 51 : 49, Gleichstand 50 : 50 heißt abgelehnt (auch in der Chronik von `npm run welt`).
2. *Zerschlagung unerreichbar.* Der Trust lag nur in 0,2 % der Runden bei 50 % oder mehr; `breakupFrom` 0,5 und der Abstimmungszuschlag ab 55 % griffen praktisch nie. Jetzt: Trust ≥ 50 % in ~45 % der Welten zeitweise, `breakupFrom` 0,45, Zuschlag schon ab 50 %. Bei geltendem Gesetz liegt der Trust in gut jeder dritten Welt einmal über der Zerschlagungsschwelle (vorher 3 %) – „Kartellgesetz und Zerschlagung des Trusts“ (GDD Kap. 2) ist eine echte, aber keine sichere Weltlage.
3. *Kartellgesetz = „Volksbund kommt dran“.* Der Trust-Anteil war Rauschen um 38 % und reagierte nicht auf die Regierung; Volksbund-Regierung, Wut und Fraktion reichten ohne Marktbeherrschung für die Schwelle (44 von 269 Beschlüssen unter 40 % Trust). Jetzt treibt die Regierung den Trust (siehe oben), und das Gesetz gewichtet die Marktbeherrschung stärker: Volksbund + Wut + Fraktion ohne mächtigen Trust bleiben unter der Schwelle, ein Trust ab 50 % reicht auch unter der Provinzliga. Ergebnis: ~90 % der Beschlüsse bei Trust ≥ 40 % (vorher 84 %, aber nur zufällig), Beschluss in ~79 % statt ~90 % der Welten. Typischer Verlauf: Unter der Handelspartei wächst der Trust, nach dem Machtwechsel kommt die Abrechnung. Tests: Regierungs- und Kreditwirkung auf den Trust, „Volksbund allein reicht nicht“, über 300 Welten > 80 % der Beschlüsse bei Trust ≥ 40 % und Zerschlagungsschwelle in 20–60 % der Welten, Rundung bei 0,5004/0,4996.

**Spielstand.** Format 16 speichert `worldModel.laws`; Stände aus Format 12–15 bekommen „noch nichts beschlossen“ (`withLawDefaults`: Sitze = heutige Anteile, Trust 38 %).

**Entscheidungen (ohne Rückfrage).**
- Gesetzesspezifische Zahlen (Druckpunkte, Schwelle, Zustimmung, Wirkung) stehen im Gesetz selbst (content/laws), wie `chance` bei Ereignissen – so ist ein Gesetz eine Datei. Der allgemeine Ablauf steht in balance.yaml.
- Der Katalog hängt an `balance.laws` (geladen wie die Karte über `parseGameData`), damit `endRound` und alle Aufrufer unverändert bleiben. `advanceWorld(…, laws)` ohne Katalog = kein Parlament.
- Kapitel 1 liest die Regeln (`lawRules`) noch nicht: Es gibt dort keine Gewinnabrechnung und kein Kartellverfahren. Beschlossene Gesetze wirken aber schon auf die Welt (Kreditklima → Zins, Stimmung). Die Zeitung bringt die Gesetzesmeldung als eigenen Block unter den Kurzmeldungen (wie das Wahlergebnis), die Abstimmung als öffentliche Zahl in Prozent.
- Neue Hilfsgröße Trust-Marktanteil statt Jacobs echtem Anteil: In Kapitel 1 ist Jacob winzig; ab Kapitel 2/3 soll `trustShare` vom echten Markt (Jacob, Crane, Rivalen) kommen.
- Lobby nur vorbereitet: `WorldInput.lobby` mit fordern (+3 Druck), verhindern (−6 Punkte Zustimmung), verzögern (+2 Runden Debatte), verwässern (Regeln aus `lobby.weaken.rules`); welche Züge ein Gesetz anbietet, steht in seiner Datei. Keine Oberfläche, keine Gefallen-Währung.

**Offen / Entwurf.** Alle Zahlen und Zeitungstexte der zwei Gesetze sind Entwürfe von Claude (`draft: true`). Aufheben von Gesetzen (z. B. Steuer nach dem Krieg senken), Gesetze der Provinz (Ölkommission, Quoten) vs. Bund, die übrigen acht Gesetze aus GDD §10 (Transportpflicht, Steuerabzug, Quoten, Gewerkschaft, Bankaufsicht, Kriegswirtschaft, Importquoten, Umwelt), Gefallen als Währung und Lobby-Oberfläche (Senator Grady), Abrechnung von `incomeTax`/`cartelBan`/`breakupFrom` ab Kapitel 2, `trustShare` aus dem echten Markt, ein Brief oder Besuch, wenn ein Gesetz Jacob betrifft.

## Kreditklima und Außenspannung (4.4, Version 0.4.4)

Code: `src/sim/world.ts` (`creditPhase`, `steadyLeverage`, `worldRateAdd`, `worldLimitFactor`, `qasirShare`, `foreignOffline`, Ausland in `advanceWorld`), Bank `src/sim/credit.ts` (`creditLimit` mit Faktor, `baseCreditLimit` fürs Rating), Zeitung `src/sim/worldNews.ts`, Zahlen `content/balance.yaml` → `worldModel.credit` (Zyklus, `leverage`), `worldModel.foreign`, `worldModel.chapter1` (`panicRate`, `bubbleRate`, `limit`), `worldModel.news` (`unrestHigh`, `qasirHigh`), Texte `content/newspaper.yaml` (`world_panic`, `world_credit_bubble`, `world_uprising…`, `world_embargo…`, `world_costa_negra_unrest`, `world_qasir_unrest`). Tests: `src/sim/creditCycle.test.ts`.

**Kreditzyklus (GDD §7.2).** Neue Größe **Verschuldung** (`leverage`, 0–100): wächst, solange die Banken mutig sind (Klima über 50, `build` 5 × (Klima − 50) ÷ 50 je Runde), baut sich sonst langsam zur Basis 25 ab (`decay` 0,04). Erst ein *langer* Boom treibt sie hoch. Phasen (`creditPhase`): knapp (Klima ≤ 30) · normal · Boom (≥ 60) · **überhitzt** (Verschuldung ≥ 45 bei Klima ≥ 50) · Panik · Crash. Der Auslöser (Klima ab 68 mit Würfel oder Preissturz, wie 4.1) entscheidet nichts mehr allein – die Verschuldung entscheidet, wie schlimm es wird:
- Verschuldung ≥ 56 → **großer Crash** wie bisher (Klima × 0,35, 4–8 Runden, Nachfrage −8 %, halbe Bohrungen, Stimmung −18), Verschuldung × 0,4.
- sonst → **Bankpanik** (Klima × 0,5, 3–5 Runden, halbe Bohrungen wie im Crash – die Banken drehen den Hahn zu –, aber kein Nachfrageeinbruch, Stimmung −6), Verschuldung × 0,8.
Eine neue Welt startet mit halber Gleichgewichts-Verschuldung zu ihrem Kreditklima (`leverage.start`): passend zur Phase, aber nie schon in der Blase.

**Wirkung auf die Bank (Kapitel 1 schon spürbar).** Zins: wie 4.1, dazu überhitzt +½ Punkt (Frühwarnzeichen „steigende Zinsen“), Panik +1, Crash +2 (höchstens ±3). Bankrahmen × Faktor je Phase: Crash 0,5 · Panik 0,7 · knapp 0,85 · normal 1 · Boom 1,15 · überhitzt 1,25 (auf 100 $ gerundet). In der Blase leihen die Banken am freigiebigsten – genau dann ist es am gefährlichsten. Das Rating misst die Schulden weiter am Grundrahmen aus den Sicherheiten (`baseCreditLimit`), damit ein Crash nicht von selbst das Rating ruiniert; er nimmt „nur“ den freien Rahmen. Das Bankfenster sagt dazu „die Banken kürzen gerade die Rahmen“ bzw. „leihen gerade großzügig“. *Aktien:* vorbereitet über `WorldInput.leverageShift` (Kauf auf Kredit ab Kapitel 3 heizt die Verschuldung) und `creditPhase` (Kurse später je Phase).

**Außenspannung.** Aldmark–Varenhold bleibt `tension`/`war` (Aufrüstung → Nachfrage, Krieg +12 %). Neu `worldModel.foreign`:
- **Costa Negra** (Unruhe 0–100): steigt bei billigem Öl (Armut, Knappheit unter 0,95), Nationalismus über 40 und Einmischung der Großmächte (Spannung über 40). Ab 65 droht ein **Aufstand** (2–6 Runden): 70 % seiner Förderung (6 % der Welt) fallen aus → Preis steigt.
- **Qasir** (Unmut 0–100): steigt, wenn die Großmächte um sein Öl werben (Spannung über 40), in jeder Kriegsrunde und bei Nationalismus über 50. Ab 70 droht ein **Ölembargo** (3–6 Runden): Qasirs ganzer Anteil fehlt der Welt. Der Anteil wächst mit dem Ölhunger der Welt (2 % + 3 % je Nachfragepunkt über 1, höchstens 25 %) – früh harmlos, spät ein Schock (passend zum Finale „Embargo der Förderländer“, GDD §13).
- Wirkung auf die Ölnachfrage über Aufrüstung/Krieg (schon 4.1), auf den Preis über den Förderausfall (`foreignOffline`). `tension.scarcity` 20 → 35: Weil große Crashs seltener sind, fehlten sonst Preisspitzen, und Kriege wären fast verschwunden (0,4 statt 1,3 je Kampagne).

**Frühwarnzeichen in der Zeitung (eine Weltmeldung je Runde, nie eine Zahl).** Ereignisse: Krach (Crash), „Ansturm auf die Banken“ (Panik), Embargo, Aufstand – groß, stehen vorn; Ende von Embargo/Aufstand, Erholung – klein. Zustände in dieser Rangfolge: **„Ganz Hallstead kauft auf Pump“** (überhitzt – die Warnung vor dem Crash), „Verstimmung in Qasir“ (Unmut ab 62, Embargo ab 70), „Unruhen in Costa Negra“ (Unruhe ab 62, Aufstand ab 65), Banken vorsichtig (knapp oder Panik/Crash wirkt nach), Geld billig, diplomatische Noten, Unmut.

**Gemessen (300–400 Welten).** Großer Crash in ~9–15 % der 20-Jahres-Welten (je nach Seeds; Fertig-Kriterium 5–25 %, Test mit 400 Welten), 0 % in Kapitel 1; Kreditkrisen (Panik + Crash) je Kampagne Ø ~3, ~66–72 % der Welten im GDD-Ziel 2–4 (§15 „Kreditkrisen“). Vor praktisch jedem Crash stand die Blasen-Warnung in den 8 Runden davor in der Zeitung; sie steht in ~5 % aller Runden. Aufstände Ø ~2,9 je Kampagne (in fast 90 % der Welten), Embargos Ø ~0,5 (in ~30 % der Welten, in den ersten 20 Jahren praktisch nie). Kriege Ø ~1,3, Preiseinbrüche ≥ 40 % in ~59 % der Welten. `npm run bots`: alle 15 Zielwerte im Rahmen (Pleitequote ausgewogen 0,8 %, gierig 15,3 %).

**Spielstand.** Format 17; Stände aus Format 12–16 bekommen `withCreditForeignDefaults`: keine Panik, Verschuldung passend zum gespeicherten Kreditklima (aber höchstens knapp unter der Blasen-Schwelle, `startLeverage`), ruhiges Ausland, neue Zähler bei 0.

**Entscheidungen (ohne Rückfrage).**
- *Widerspruch Roadmap ↔ GDD §15:* Die Roadmap will Crashs in 5–25 % der 20-Jahres-Welten, das GDD 2–4 Kreditkrisen je Kampagne (bisher ~60 % der Welten mit Crash in 20 Jahren). Gelöst mit zwei Stufen: „Kreditkrise“ (GDD) = Bankpanik oder Crash, „Kreditcrash“ (Roadmap) = nur der große. Passt zum GDD („Zinssprung, Bankpanik, Crash“; Zeitsprung I: „eine Bankenpanik, falls das Kreditklima überhitzt ist“).
- Für Gesetze zählt auch eine Bankpanik als Krise (`crash` im Blick des Parlaments, Trust kauft Pleitefirmen) – sonst hätte die Einkommensteuer mit den selteneren Crashs ihren wichtigsten Grund verloren.
- Kein Kündigen bestehender Kredite in Kapitel 1: Der Crash kürzt den Rahmen für neue Kredite, bestehende behalten ihren Zins. Kündigen (GDD §8 „hoch Verschuldete brechen binnen zwei Runden zusammen“) kommt mit Kapitel 2/3.
- Die Weltbibel sagt über Costa Negra und Qasir nur je einen Satz; Mechanik (Aufstand, Embargo), Treiber und Zeitungstexte sind Entwürfe von Claude. Verstaatlichung bleibt allgemein (nicht an ein Land gebunden).
- Jede Runde zieht jetzt 20 statt 14 Zufallszahlen (gleich viele in jeder Runde) – alle Welten sind dadurch neu gewürfelt, die Statistik oben ist neu gemessen.

**Offen / Entwurf.** Alle neuen Zahlen und Zeitungstexte sind Platzhalter bzw. Entwürfe. Aktienkurse je Phase und Kauf auf Kredit (Kapitel 3), Kündigung von Krediten im Crash, eigene Bank mit Bankrun, Volkswirt im Personal (genauere Schätzung), Konzessionen in Costa Negra/Qasir (Kapitel 4) und wer dort verstaatlicht, Spielereingriffe (Öl an eine Seite liefern, Lobby für/gegen Kriegseintritt), Bankaufsicht als Gesetz (drückt die Verschuldung), Welt-Einstellungen ruhig/stürmisch. Seed-Streuung beim Crash-Anteil (9–15 %) liegt komfortabel im Rahmen, aber nicht genau in der Mitte.

## Nachprüfung 4.4 (gleiche Version 0.4.4)

- **Alter Spielstand mitten im Boom** (bestätigt): Der Ersatzwert rechnete aus Klima 90 eine Verschuldung von 75 – die Welt war sofort nach dem Laden überhitzt, und der nächste Auslöser wäre ohne Boomverlauf ein großer Crash gewesen. Jetzt `startLeverage`: höchstens `bubbleFrom − 1` (gilt auch für neue Welten; dort ändert sich mit den heutigen Zahlen nichts, sie kommen höchstens auf ~40). Test mit einem Format-16-Stand bei Klima 90.
- **Frühwarnung Ausland** (bestätigt): Nur rund die Hälfte der Aufstände hatte „Unruhen in Costa Negra“ vorher, weil die Meldung schon ab 55 kam (häufigste Weltmeldung, ~6 % der Runden) und hinter Spannung, Geld und Nachwirkung der Panik stand; „Verstimmung in Qasir“ ging im Krieg hinter den diplomatischen Noten unter. Jetzt: Schwellen 62/62 (knapp unter Aufstand 65/Embargo 70, `worldModel.news`), Rang direkt nach der Blase. Gemessen (300 Kampagnen): ~75 % der Aufstände und ~95 % der Embargos gewarnt; „Unruhen in Costa Negra“ steht in ~4 %, „Verstimmung in Qasir“ in ~2 % der Runden. balance.yaml prüft, dass die Warn-Schwellen nicht über den Auslöse-Schwellen liegen. Test analog zur Blasenwarnung. Rest-Lücke bei Aufständen: Unruhe springt manchmal in einer Runde über 65, oder eine Umfrage/ein Ereignis belegt die eine Weltmeldung der Runde.
- **Kreditzyklus in Kapitel 1 kaum spürbar** (bestätigt, bewusst so gelassen): Kapitel 1 hat 16 Runden; dort gibt es Bankpaniken (in ~11 % der Welten), Bankrahmen und Zinsaufschlag je Phase und die Zeitungsmeldungen – aber keinen großen Crash (0 %) und kein Embargo (das erste kommt in aller Regel erst Jahrzehnte später). Das ist gewollt: Crash, Kündigung von Krediten und Embargo sind Stoff ab Kapitel 2/3 (Zeitsprünge, GDD §13), Kapitel 1 ist der Einstieg. Neue Kennzahl in `npm run bots` (docs/botlaeufe.md, Abschnitt „Kreditzyklus“): Bankrottquote je Strategie in Seeds mit/ohne Kreditkrise im Kapitel, eingeteilt an der Welt ohne Spieler. Ergebnis 0.4.4: gierig 17,3 % mit Krise gegenüber 15,1 % ohne (81 von 1000 Seeds mit Krise) – ein kleiner, aber sichtbarer Unterschied. Kein Zielwert; ob Kapitel 1 mehr Zyklus braucht, klärt das Balancing (GDD §15).


## Zeitsprünge (4.5, Version 0.4.5)

Code: `src/sim/timeskip.ts` (Sprung, Weichen, Chronik, Inhalte lesen), Merkzeichen `src/sim/timeskipMarks.ts`, Oberfläche `src/ui/TimeskipScreen.tsx`, Zahlen `content/balance.yaml` → `timeskip`, Texte `content/timeskip.yaml` (Entwurf). Tests: `src/sim/timeskip.test.ts`.

**Ablauf (GDD §2/§13).** Am Ende von Kapitel 1 (erreicht oder verfehlt, nicht nach Pleite oder Verkauf an Crane) und nach der Entscheidung zur Aktiengesellschaft: Knopf „Die Jahre ziehen ins Land …“ → Brief an den Verwalter mit zwei **Direktiven** – Haltung (wagemutig / ausgewogen / vorsichtig) und Familie (die Firma zuerst / wie bisher / viel Zeit zu Hause). Dann rechnet die Welt **24 Quartale (Jahr 5–10)** weiter. **Weichen-Telegramme** halten den Sprung an, wenn die Welt sie hergibt: Bankenpanik (nur bei überhitztem Kreditklima: tilgen oder weiter auf Pump), die ersten Automobile (immer im Jahr 7: bei einer Benzinanlage einsteigen?), Öl in Okara (mit 60 % im Jahr 6: Pachten kaufen oder Bullard überlassen), Ruth erwartet ein Kind (sicher – gewürfelt wird nur der Zeitpunkt ab Jahr 6, mehr Familienzeit = früher, spätestens im letzten Jahr: zu Hause bleiben oder Geschäfte). Das Telegramm zeigt Kasse, Schulden und freien Bankrahmen; eine Antwort, die mehr kostet als die Kasse, geht „auf Kredit“, reicht auch der Rahmen nicht, ist sie gesperrt. Danach die **Chronik „Die Jahre dazwischen“** – eine Zeitungsspalte je Jahr (Weltereignisse, Wahlen, Gesetze, Posted Price, neue und trockene Bohrungen, erschöpfte Felder, Kreditkündigungen, Bullard, aufgebende Wildcatter, Familie) und eine Bilanz vorher/nachher. Dann **Kapitel 2 (Platzhalter)**: Frühjahr 98 = Jahr 11, Jacob 35, 16 Runden mit den Systemen aus Kapitel 1, in der Kopfleiste gestempelt „Kapitel 2 · im Bau“; an seinem Ende ein eigener Abschluss ohne Prüfung und ohne Aktien.

**Vereinfachte Regeln je Quartal.** Förderung wie im Spiel (Druck, Erschöpfung), Posted Price aus dem Salt-Hill-Angebot (Jacob, Bullard, Nachbarn) und dem Welttrend, das Weltmodell rückt mit `advanceWorld` weiter (Salt Hill fließt winzig ein, Gesetze tagen), Verkauf über den billigsten eigenen Weg (Pipeline, Fuhrwerke, sonst Bahn), Unterhalt je Quelle und Fuhrwerk, Zinsen. Nachbarquellen versiegen mit 3 %/Quartal, neue kommen bei gutem Preis (so pendelt der Preis am Salt Hill gegen ~1 $). Kreditkrise (Bankpanik oder Crash) in der Welt: Die Bank kündigt 30 % der Schulden plus 0,6 × Auslastung des Bankrahmens, nach „weiter auf Pump“ noch 30 % mehr (höchstens alles); gezahlt wird aus der Kasse über der Rücklage, den Rest bringen die schwächsten Quellen zum halben Wert; im Jahr der Kündigung bohrt der Verwalter nicht, nach „weiter auf Pump“ zwei Jahre länger nicht und ohne neuen Kredit. **Je Jahr:** tilgen nach Haltung; neue Bohrungen (eigene ungebohrte Pachten, Nachbohren auf eigenen Funden bis zum Druckverlust, freie Ranches nach Geologen-Schätzung ab einer Mindestchance je Haltung; höchstens `maxNewWells` je Haltung × Familienfaktor; Budget aus Überschuss über der Rücklage × Anteil × Familienfaktor, dazu ein Kredit über einen Anteil des freien Bankrahmens, wenn es etwas zu bohren gibt); wagemutig erschließt einen Nachbarbezirk (8.000 $), sobald am offenen Land weniger als halb so viele lohnende Ziele sind, wie er bohren darf – dort bohrt er ohne Geologen nach der Zonenkarte; Bullard bohrt mit 50 % eine Quelle (sein eigener Zufall); Beziehungen ändern sich nach der Familien-Direktive. Familienzeit kostet unabhängig vom Geld: „viel Zeit zu Hause“ = 0,6 × so viele Bohrungen und 85 % des Verkaufserlöses (ohne Jacobs Aufsicht), „die Firma zuerst“ = 1,25 × Bohrungen und 103 %. **Zahlungsfähigkeit am Jahresende:** Kasse im Minus → Notkredit, aber nur bis zum Bankrahmen; reicht das nicht, Notverkauf von Quellen; reicht auch das nicht, ist die Firma **pleite** – der Sprung endet in diesem Jahr, nach der Chronik („Das Ende der Firma“) kommt der Pleite-Bildschirm (GDD §2: frühes Ende).

**Determinismus.** Zufall aus eigenen Strömen je Zweck – `seed + ':zeitsprung1:bohren'` (Bohrergebnisse des Verwalters), `:clara` (Zeitpunkt der Clara-Weiche), `:okara` (ob die Okara-Weiche kommt und ob dort Öl ist) – und den Strömen im Zustand. So hängt eine Welt-Weiche nie davon ab, wie viele Probebohrungen der Verwalter macht. `runTimeskip` rechnet bei jedem Aufruf **von vorn** mit allen schon beantworteten Weichen und hält an der ersten offenen an. Im Spielstand steht nur `jump` (Direktiven + Antworten) – nie ein halber Sprung. Gleicher Seed + gleiche Entscheidungen = dieselbe Welt; andere Entscheidungen in Kapitel 1, andere Direktiven oder andere Antworten = andere Welt (Tests).

**Spielstand.** Format 18: `chapter`, `chapterStart` (Runden zählen über Kapitel weiter; Kapitel 2 = Runde 41–56, angezeigt als Runde 1–16), `neighbourOffset` (Nachbarquellen nach dem Sprung gegenüber der Kapitel-1-Formel), `jump`, `timeskips` (Chronik mit `read`). Ältere Stände (12–17) laden als Kapitel 1 ohne Sprung. Clara steht optional in `family.clara/claraBorn`, Beteiligungen optional in `ventures` (Benzinanlage `benzin.since`, Okara `okara.holder/oil/since`; fehlt = keine – darum bleibt es bei Format 18). Pleite im Sprung: `ending: 'pleite'`, `totalRounds` = Runde der Pleite, Chronik mit `bankrupt: true`. Ereignis-Bedingungen `minRound/maxRound` zählen ab dem Kapitelbeginn; neu sind `minChapter/maxChapter` und `minThomasAge/maxThomasAge`.

**Gemessen** (nach der Prüfung, `npm run bots` → Abschnitt „Zeitsprung I“ in docs/botlaeufe.md: 150 Kapitelenden des Standard-Bots × 9 Direktiven × 2 Antwort-Sätze; Pleite zählt 0): Ø Imperiumswert nach dem Sprung wagemutig ~266.000 $ (p10 −4.700, p90 582.000), ausgewogen ~143.000 $ (p90 342.000), vorsichtig ~134.000 $ (p90 333.000). Von Firmen mit Quelle am Kapitelende: wagemutig ~404.000 $ bei der größten Streuung (Standardabweichung 188.000 gegen 116.000), aber in Welten mit Kreditkrise 15 % weniger (ausgewogen/vorsichtig 5–7 %), Kreditkündigung 27 % gegen 14 %/10 %, Pleite 13,3 % gegen 11,1 %/11,3 %; in ~12 % der Seeds endet wagemutig unter ausgewogen. Die p10 (~−4.000 $) sind die ~⅓ der Kapitelenden ohne fördernde Quelle und mit Schulden – sie gehen im Sprung pleite (~11–13 %) oder kommen mit Schulden in Kapitel 2 (dort von 60 Partien noch 5 pleite, alle ohne Quelle). Familie: „viel Zeit zu Hause“ ~147.000 $ gegen „wie bisher“ 194.000 $ (−24 %; je Haltung −14 bis −31 %), „die Firma zuerst“ +5 %; Ruth 100 / 89 / 63. Clara kommt in jedem Sprung ohne Pleite zur Welt. Bankpanik-Weiche (nur diese Antwort gewechselt): wagemutig verliert mit „weiter auf Pump“ im Schnitt ~23.000 $ und ist in 75 % der Seeds schlechter; ausgewogen leiht kaum, dort ist der Unterschied klein. Kapitel 1 ist unverändert (alle Tabellen von `npm run bots` gleich wie vorher, alle Zielwerte im Rahmen).

**Entscheidungen (ohne Rückfrage).**
- Direktiven nur Haltung und Familie. Budget-Aufteilung und Führung (Manager) aus GDD §2 kommen mit Personal (§11) bzw. späteren Kapiteln; die Haltung bündelt vorerst Budget (Bohren/Tilgen/Rücklage).
- Okara liegt nicht auf der Cordova-Karte: Die Pachten sind eine Beteiligung (`src/sim/ventures.ts`). Ob dort Öl kommt, steht fest, sobald die Weiche kommt – egal, wer die Pachten nimmt. Jacob mit Fund: 900 $ × Weltpreis-Faktor je Quartal ab dem Jahr danach, auch in Kapitel 2 (Rundenende), im Imperiumswert mit 8 Quartalseinnahmen. „Bullard soll sie haben“: Bullard kassiert dieselben Einnahmen. Merkzeichen `okara_pachten`, `okara_fund`, `okara_bullard` für spätere Inhalte.
- Clara wird sicher im Zeitsprung I geboren (Weltbibel, GDD §12; spätere Kapitel bauen auf ihr auf). Die Familien-Direktive bestimmt den Zeitpunkt und die Bindung (Ruth, Clara), nicht ob es sie gibt. Die Weiche fragt, ob Jacob bei der Geburt zu Hause ist. Clara zählt ab dann wie Thomas: eigener Effekt `clara`, Vernachlässigung, Zustandswort im Protokoll und im Familienschnitt (Kraft aus Familienzeit). Ein eigener Telegrammtext je Direktive steht noch aus. Nur eine Pleite vor Jahr 10 verhindert sie.
- Der Benzin-Einstieg bringt ab dem Jahr danach +0,05 $ je verkauftem Barrel – auch nach dem Sprung (Preis des Trusts, `jacobPrice`) – und das Merkzeichen `benzin_frueh`.
- Kapitel 2 spielt Kapitel-1-Ereignisse weiter, aber nicht die, die nur in die ersten Jahre passen: `maxThomasAge: 3` an den Kleinkind-Ereignissen (Nacht, erstes Wort, Krupp, Taufe, Abend zu dritt), `maxChapter: 1` an Pension, Fieber in der Pension und Ruths Büchern. Ab Kapitel 2 steht „Ein Abend mit den Kindern“ im Kalender (Ruth, Thomas, Clara; Entwurf). Der Brief der Mutter bleibt – er ist der Alltagsbrief für die Briefarten-Garantie und passt auch zehn Jahre später.
- Unbebohrte Pachten und Optionen verfallen im Sprung, gemietete Türme gehen zurück, laufende Bohrungen bringt der Verwalter zu Ende (Ergebnis = Geologie), eine Pipeline im Bau ist fertig.
- `once`-Ereignisse aus Kapitel 1 kommen in Kapitel 2 nicht wieder.

**Prüfung nach 1b56692 (alle elf Befunde nachgemessen, alle echt).**
1. *Doppelte Bohrloch-Kennungen* nach Notverkauf und Nachbohren: neue Kennung = höchste Nummer der Ranch + 1 (`nextWellId`, im Spiel und im Sprung).
2. *Clara konnte in Kapitel 2 nur verlieren*: Effekt `clara`, Clara im Familienschnitt und im Protokoll, Familienabend ab Kapitel 2 mit Clara.
3. *Haltung ohne Wirkung* (Grenze waren die freien Ranches, nicht das Geld): Bohrungen je Jahr nach Haltung, wagemutig erschließt einen Nachbarbezirk und leiht jedes Jahr, Kreditkrise nach Auslastung. Kennzahl in `npm run bots`.
4. *Familienzeit kostete nichts*: weniger Bohrungen und weniger Erlös bei „viel Zeit zu Hause“, unabhängig vom Budget.
5. *Fertig-Kriterium nur formal*: Die Tests vergleichen jetzt die **Firma** (Quellen, Kasse, Schulden, Merkzeichen, Weichen, Ruth) mit Mindestgrößen statt `worldModel not.toEqual`. Einordnung: Das GDD-Kriterium „andere Entscheidungen → andere Welt“ meint für Kapitel 1/2 Jacobs Welt – Firma, Familie, Rivalen, Beteiligungen. Das Weltmodell (Regierung, Gesetze, Weltpreis) reagiert auf Salt Hill bewusst nur winzig (Jacob ist ein Wildcatter, §7); spürbare Hebel ins Weltmodell (öffentliches Handeln 4.2 gibt es schon, später Raffinerie, Marktmacht, Spenden) kommen mit den Kapiteln, in denen Jacob groß genug ist.
6. *Weichen und Bohrungen teilten einen Zufallsstrom*: eigene Ströme je Zweck (siehe Determinismus); Test: Okara-Weiche, Okara-Fund und Claras Geburtsjahr sind bei wagemutig und vorsichtig gleich.
7. *Clara nicht sicher*: sicher, nur der Zeitpunkt wird gewürfelt.
8. *Okara und Benzin verpufften*: dauerhafte Beteiligungen in `ventures` (siehe oben), Bullard kassiert Okara bei „Bullard soll sie haben“.
9. *Notkredite ohne Grenze*: nur bis zum Bankrahmen, dann Notverkauf, dann Pleite im Sprung; Weichen-Kosten aus Kasse, sonst auf Kredit, sonst gesperrt; Telegramm mit Kasse/Schulden/Rahmen. Der Verwalter leiht nur noch, wenn es etwas zu bohren gibt (früher auch ins Leere).
10. *Bankpanik kaum spürbar*: Kündigung nach Auslastung + „Pump“-Aufschlag, Rücklage zählt nicht als frei, Bohrstopp, nach „Pump“ kein Kredit mehr. Grenze des Modells: Der Bankrahmen (2.000 $ je Quelle) ist klein gegen die Quartalseinnahmen einer Quelle – Notverkäufe bleiben darum selten (~1–3 %), die Strafe ist vor allem verlorenes Wachstum. Echte Überschuldung braucht größere Rahmen; das gehört zum Balancing von Kapitel 2.
11. *Kapitel 2 spielte Baby- und Pensions-Ereignisse*: Bedingungen `maxThomasAge`/`maxChapter` (siehe oben); Test über 16 Runden Kapitel 2.

**Offen.** Kapitel 2 selbst (Raffinerie, Aktien, Ziele, eigene Ereignisse; Thomas' Sätze im Familienfenster sind noch die eines Babys). Zeitsprung II–VI. Ein Clara-Telegramm je Familien-Direktive. Größere Kreditrahmen, damit Überschuldung im Boom auch gesunde Firmen trifft (GDD §15). Weichen-Texte und Clara-Sätze sind Entwürfe (`draft: true`). Alle `timeskip`-Zahlen sind Platzhalter – die Balance klärt sich mit Kapitel 2.
