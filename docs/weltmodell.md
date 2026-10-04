# Weltmodell

Stand: 2026-10-04 · Version 0.4.3

Erzeugt mit `npm run welt` (tools/weltlaeufe.ts, Regeln in src/sim/world.ts und src/sim/laws.ts, Zahlen in content/balance.yaml unter worldModel, Gesetze in content/laws/).
300 Welten (Seeds `welt-0` bis `welt-299`) über eine ganze Kampagne: 292 Runden = 73 Spieljahre, **ohne Spieler**. Rechenzeit 0.3 s.

- Alle Werte endlich: **ja** · Krisenzahlen in der Mehrheit der Welten im GDD-Ziel: **ja**

## Verläufe

Je Zelle: 10 % · **Median** · 90 % der Welten am Ende des Spieljahres; Min/Max über alle Welten und Jahre.

| Größe | Jahr 0 | Jahr 1 | Jahr 2 | Jahr 4 | Jahr 5 | Jahr 10 | Jahr 15 | Jahr 20 | Jahr 25 | Jahr 30 | Jahr 40 | Jahr 50 | Jahr 60 | Jahr 73 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Weltpreis (Index) | 1,00 · **1,00** · 1,00 | 0,99 · **1,00** · 1,00 | 0,98 · **1,00** · 1,02 | 0,85 · **1,00** · 1,07 | 0,85 · **0,99** · 1,09 | 0,83 · **0,96** · 1,23 | 0,82 · **1,00** · 1,31 | 0,80 · **0,99** · 1,27 | 0,79 · **0,96** · 1,17 | 0,73 · **0,94** · 1,12 | 0,76 · **0,90** · 1,08 | 0,70 · **0,86** · 1,01 | 0,70 · **0,84** · 0,95 | 0,65 · **0,80** · 0,93 | 0,35 | 2,34 |
| Nachfrage (Index) | 1,00 · **1,00** · 1,00 | 1,05 · **1,05** · 1,05 | 1,09 · **1,09** · 1,09 | 1,19 · **1,19** · 1,20 | 1,24 · **1,25** · 1,25 | 1,54 · **1,55** · 1,56 | 1,90 · **1,92** · 1,93 | 2,33 · **2,36** · 2,39 | 2,83 · **2,88** · 2,92 | 3,41 · **3,48** · 3,54 | 4,74 · **4,85** · 4,95 | 6,13 · **6,26** · 6,36 | 7,30 · **7,41** · 7,49 | 8,26 · **8,32** · 8,36 | 1,00 | 8,37 |
| Förderkapazität (Index) | 1,18 · **1,19** · 1,19 | 1,24 · **1,24** · 1,25 | 1,28 · **1,30** · 1,31 | 1,37 · **1,42** · 1,49 | 1,41 · **1,48** · 1,58 | 1,68 · **1,86** · 1,97 | 2,05 · **2,26** · 2,43 | 2,55 · **2,77** · 3,03 | 3,14 · **3,41** · 3,69 | 3,85 · **4,11** · 4,49 | 5,33 · **5,72** · 6,20 | 7,00 · **7,42** · 8,12 | 8,28 · **8,74** · 9,33 | 9,35 · **9,90** · 10,88 | 1,18 | 13,23 |
| Lager (Quartalsbedarf) | 0,25 · **0,25** · 0,25 | 0,25 · **0,25** · 0,25 | 0,25 · **0,25** · 0,25 | 0,23 · **0,25** · 0,29 | 0,23 · **0,25** · 0,29 | 0,20 · **0,26** · 0,30 | 0,19 · **0,24** · 0,30 | 0,19 · **0,24** · 0,30 | 0,20 · **0,25** · 0,30 | 0,21 · **0,24** · 0,31 | 0,20 · **0,24** · 0,29 | 0,21 · **0,25** · 0,30 | 0,21 · **0,24** · 0,29 | 0,21 · **0,25** · 0,30 | 0,00 | 0,98 |
| Kreditklima (0–100) | 35 · **48** · 59 | 37 · **49** · 63 | 38 · **49** · 65 | 35 · **51** · 66 | 34 · **50** · 65 | 32 · **50** · 67 | 32 · **47** · 67 | 31 · **47** · 63 | 31 · **47** · 63 | 33 · **45** · 61 | 33 · **47** · 61 | 31 · **45** · 61 | 32 · **46** · 60 | 34 · **47** · 63 | 13 | 100 |
| Stimmung (0–100) | 50 · **54** · 59 | 47 · **52** · 56 | 47 · **51** · 55 | 43 · **50** · 56 | 44 · **51** · 55 | 39 · **50** · 56 | 37 · **48** · 55 | 38 · **48** · 54 | 38 · **49** · 55 | 40 · **48** · 54 | 40 · **49** · 55 | 42 · **49** · 55 | 42 · **49** · 55 | 42 · **50** · 56 | 3 | 67 |
| Außenspannung (0–100) | 12 · **18** · 26 | 12 · **19** · 25 | 12 · **19** · 25 | 12 · **19** · 25 | 12 · **18** · 26 | 11 · **19** · 60 | 13 · **21** · 84 | 15 · **23** · 75 | 15 · **24** · 68 | 15 · **24** · 79 | 15 · **24** · 68 | 17 · **26** · 63 | 20 · **29** · 56 | 20 · **30** · 58 | 2 | 100 |
| Technikstand (0–100) | 6 · **8** · 10 | 7 · **9** · 10 | 7 · **9** · 11 | 8 · **10** · 12 | 9 · **11** · 13 | 12 · **15** · 17 | 16 · **20** · 23 | 21 · **25** · 29 | 27 · **32** · 37 | 34 · **40** · 45 | 51 · **57** · 62 | 67 · **72** · 76 | 80 · **84** · 86 | 91 · **93** · 94 | 6 | 94 |
| Nationalismus (0–100) | 9 · **14** · 19 | 11 · **15** · 20 | 12 · **17** · 23 | 15 · **20** · 26 | 16 · **21** · 27 | 20 · **28** · 37 | 25 · **34** · 46 | 29 · **39** · 54 | 33 · **45** · 60 | 38 · **48** · 66 | 45 · **56** · 71 | 52 · **63** · 75 | 54 · **69** · 78 | 47 · **70** · 83 | 5 | 100 |

Median je Spieljahr als Kurve (Jahr 0 bis 73):

- Weltpreis (▁ 0,7 … █ 1,4): `▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂`
- Weltpreis 90 % (▁ 0,7 … █ 2,0): `▃▃▃▃▃▃▃▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▃▃▂▂▂▂▂`
- Kreditklima (▁ 30 … █ 70): `▄▄▄▅▅▅▅▅▅▅▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄`
- Außenspannung 90 % (▁ 0 … █ 100): `▃▃▃▃▃▃▃▃▄▄▅▅▅▆▆▇▆▆▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▅▅▅▆▆▆▅▆▆▅▆▅▅▅▅▅▆▅▆▅▆▆▅▅▅▄▅▅▅▅▅▅▆▆▆▆▆▆▅▅▅`
- Stimmung (▁ 30 … █ 60): `▇▆▆▆▆▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▆▅▅▅▆▅▆▅▅▅▅▅▅▅▅▆▅▅▆▆▅▆▅▅▆▅▆▆▆▆`

## Krisen je Kampagne

| Krise | Ziel je Kampagne (GDD §15) | Ø | 10 % · 50 % · 90 % der Welten | Welten im Ziel | Ø in den ersten 20 Jahren |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kreditkrisen (Crash) | 2–4 | 2,87 | 1 · 3 · 5 | 75,0 % | 0,95 |
| Ölschwemmen (Riesenfund) | 1–3 | 2,08 | 0 · 2 · 4 | 69,3 % | 0,58 |
| Kriege in Übersee | 0–2 | 1,37 | 0 · 1 · 3 | 85,3 % | 0,34 |
| Verstaatlichungen | – | 0,77 | 0 · 1 · 2 | – | 0,00 |
| Regierungswechsel (von 18 Wahlen) | – | 8,64 | 5 · 9 · 12 | – | 2,31 |

Regierung: Handelspartei 22,9 %, Volksbund 36,7 %, Provinzliga 40,5 % der Regierungszeit.

## Krisen über die Zeit

Jede Welt ist neu (GDD §7.2): Crashs und Kriege sollen nicht in allen Welten zur selben Zeit kommen. Je Fenster von 5 Spieljahren: Ø Krisen je Welt und Anteil der Welten, deren erster Crash dort liegt (der Rest: ohne Crash).

| je Welt | J. 0–4 | J. 5–9 | J. 10–14 | J. 15–19 | J. 20–24 | J. 25–29 | J. 30–34 | J. 35–39 | J. 40–44 | J. 45–49 | J. 50–54 | J. 55–59 | J. 60–64 | J. 65–69 | J. 70–72 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Crashs | 0,14 | 0,24 | 0,29 | 0,28 | 0,23 | 0,21 | 0,17 | 0,18 | 0,20 | 0,16 | 0,18 | 0,17 | 0,14 | 0,19 | 0,08 |
| erster Crash (Anteil Welten) | 14,3 % | 19,3 % | 18,0 % | 8,7 % | 6,3 % | 5,3 % | 3,3 % | 4,7 % | 4,3 % | 2,3 % | 3,3 % | 1,0 % | 2,3 % | 0,3 % | 0,3 % |
| Kriege | 0,00 | 0,07 | 0,11 | 0,15 | 0,11 | 0,13 | 0,10 | 0,11 | 0,09 | 0,09 | 0,11 | 0,07 | 0,06 | 0,12 | 0,05 |

## Preisausschläge

- Größter Preisrückgang binnen eines Jahres je Welt: Median 43,1 %, 90 % 56,8 %; Welten mit einem Einbruch von mindestens 40 %: 61,3 % (GDD §7.3: „fast −50 % in einem Jahr“ soll vorkommen).
- Größter Preisanstieg binnen eines Jahres: Median 44,6 %, 90 % 61,2 %.

## Kapitel 1 (Runde 1–16)

- Faktor auf den Trendpreis am Salt Hill nach 16 Runden: 10 % 0,924 · Median 0,998 · 90 % 1,034 (Grenze ±15,0 %).
- Zinsaufschlag der Bank je Runde: 10 % -0,25 · Median 0,00 · 90 % 0,25 Prozentpunkte (Grenze ±3,00).
- Runden, in denen der Faktor höchstens ±2 % vom Neutralwert abweicht: 79,6 %; Zins billiger: 27,6 %, teurer: 28,4 % der Runden.
- Wahlen in Kapitel 1: 300; es siegt Handelspartei 68,7 %, Volksbund 17,3 %, Provinzliga 14,0 %; Wiederwahl 75,7 %.
- Welten mit einem Crash in Kapitel 1: 10,0 %; mit einem Krieg: 0,0 %.
- Ob die Kapitel-1-Balance hält, zeigt `npm run bots` (docs/botlaeufe.md) – die Bots spielen mit Weltmodell.

## Gesetze (4.3)

Kein Gesetz hat ein festes Jahr: Druck aus dem Weltzustand → Antrag → Debatte → Abstimmung (content/laws/, Ablauf in balance.yaml unter worldModel.laws).

| Gesetz | Welten mit Beschluss | Jahr des Beschlusses 10 % · 50 % · 90 % | verschiedene Runden | Ø Anträge | Ø Niederlagen | beschlossen in Kapitel 1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Einkommensteuer | 67,0 % | 12 · 25 · 60 | 137 | 0,95 | 0,28 | 0,0 % |
| Kartellgesetz | 89,7 % | 10 · 26 · 59 | 155 | 1,22 | 0,32 | 0,0 % |

Marktanteil des größten Konzerns (Crane Trust), 10 % · Median · 90 %: Jahr 0: 31,6 % · **38,2 %** · 44,5 %; Jahr 10: 34,5 % · **39,4 %** · 44,6 %; Jahr 20: 33,4 % · **39,3 %** · 44,7 %; Jahr 40: 25,4 % · **33,8 %** · 43,0 %; Jahr 73: 23,0 % · **27,5 %** · 37,3 %.

## Beispielwelt `welt-0`

- Jahr 14: Riesenfund (Weltpreis 0,75, Kreditklima 57, Spannung 15)
- Jahr 15: Wahl: Provinzliga regiert (Weltpreis 0,69, Kreditklima 53, Spannung 14)
- Jahr 23: Wahl: Handelspartei regiert (Weltpreis 1,02, Kreditklima 38, Spannung 16)
- Jahr 27: Wahl: Provinzliga regiert (Weltpreis 0,95, Kreditklima 65, Spannung 18)
- Jahr 31: Crash (Weltpreis 0,81, Kreditklima 27, Spannung 20)
- Jahr 32: Banken erholt (Weltpreis 0,81, Kreditklima 41, Spannung 16)
- Jahr 37: Crash (Weltpreis 0,94, Kreditklima 28, Spannung 60)
- Jahr 39: Banken erholt (Weltpreis 0,83, Kreditklima 38, Spannung 57)
- Jahr 41: Krieg (Weltpreis 1,19, Kreditklima 43, Spannung 87)
- Jahr 43: Einkommensteuer Antrag (Weltpreis 1,61, Kreditklima 74, Spannung 100)
- Jahr 43: Einkommensteuer abgelehnt (50 % Ja) (Weltpreis 1,46, Kreditklima 82, Spannung 100)
- Jahr 44: Crash (Weltpreis 0,93, Kreditklima 30, Spannung 100)
- Jahr 44: Frieden (Weltpreis 0,74, Kreditklima 32, Spannung 22)
- Jahr 46: Banken erholt (Weltpreis 0,50, Kreditklima 36, Spannung 19)
- Jahr 47: Wahl: Volksbund regiert (Weltpreis 0,75, Kreditklima 32, Spannung 17)
- Jahr 51: Wahl: Provinzliga regiert (Weltpreis 0,95, Kreditklima 47, Spannung 19)
- Jahr 59: Wahl: Volksbund regiert (Weltpreis 0,85, Kreditklima 45, Spannung 23)
- Jahr 63: Wahl: Provinzliga regiert (Weltpreis 0,83, Kreditklima 48, Spannung 24)
- Jahr 67: Wahl: Volksbund regiert (Weltpreis 0,81, Kreditklima 52, Spannung 32)
- Jahr 71: Wahl: Provinzliga regiert (Weltpreis 0,79, Kreditklima 53, Spannung 37)

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
- *Kartellgesetz* (`antitrust`): Druck bei Trust-Anteil ab 40 % (+1) und ab 50 % (+1), Stimmung ≤ 45 (+0,6), Volksbund regiert (+1), Volksbund-Fraktion ≥ 38 % (+0,4), Handelspartei regiert (−0,8); Schwelle 11. Zustimmung Handel 10 %, Volksbund 85 %, Provinzliga 50 %. Wirkung: Trust-Anteil −0,003 je Runde, Stimmungsziel +1; Regeln `cartelBan` 1, `breakupFrom` 0,5.
- *Einkommensteuer* (`income_tax`): Druck bei Krieg (+2,2), Crash (+1,8), Spannung ≥ 60 (+0,6), Stimmung ≤ 40 (+0,4), Volksbund (+0,6), Handelspartei (−0,8); Schwelle 10. Zustimmung 15/80/40 %, Krieg +10, Crash +4, Kreditklima ≥ 65 −5 Punkte. Wirkung: Kreditklima −0,15 je Runde (Gleichgewicht ≈ −3 Punkte), Stimmungsziel +0,5; Regel `incomeTax` 0,07.

**Marktanteil des Trusts** (`laws.trustShare`, Hilfsgröße für das Kartellgesetz, GDD §10 „eine Firma über 40 %“): startet je Welt bei 30–46 %, kehrt langsam zu 38 % zurück, steigt in jeder Crash-Runde (+0,6 Punkte, Pleitefirmen werden aufgekauft) und nach Riesenfunden (+3 Punkte). Würfelt mit dem Gesetzes-Zufall.

**Gemessen (300 Welten, ganze Kampagne).** Kartellgesetz in ~90 % der Welten, Einkommensteuer in ~67 %, Beschlüsse zwischen Jahr ~10 und ~60 (Median Jahr 25/26), über 130 verschiedene Runden, rund jede dritte Abstimmung scheitert. In Kapitel 1 kommt ab und zu ein Antrag, beschlossen wird praktisch nie (0 von 300; 4 von 1000 beim Kartellgesetz). Test „Fertig-Kriterium 4.3“: je Gesetz mindestens 5 % der Welten ohne Beschluss, 10–90-%-Spanne mindestens 20 Jahre, keine Runde mit mehr als 5 % der Beschlüsse; Einkommensteuer fällt in über 85 % der Fälle in Krieg/Crash; ein Gesetz ohne erfüllbaren Grund kommt nie. Ohne beschlossenes Gesetz läuft die Welt Zahl für Zahl wie ohne Katalog (eigener Zufall); die Krisenzahlen oben bleiben im GDD-Ziel. `npm run bots`: alle 15 Zielwerte im Rahmen, Ergebnisse unverändert.

**Spielstand.** Format 16 speichert `worldModel.laws`; Stände aus Format 12–15 bekommen „noch nichts beschlossen“ (`withLawDefaults`: Sitze = heutige Anteile, Trust 38 %).

**Entscheidungen (ohne Rückfrage).**
- Gesetzesspezifische Zahlen (Druckpunkte, Schwelle, Zustimmung, Wirkung) stehen im Gesetz selbst (content/laws), wie `chance` bei Ereignissen – so ist ein Gesetz eine Datei. Der allgemeine Ablauf steht in balance.yaml.
- Der Katalog hängt an `balance.laws` (geladen wie die Karte über `parseGameData`), damit `endRound` und alle Aufrufer unverändert bleiben. `advanceWorld(…, laws)` ohne Katalog = kein Parlament.
- Kapitel 1 liest die Regeln (`lawRules`) noch nicht: Es gibt dort keine Gewinnabrechnung und kein Kartellverfahren. Beschlossene Gesetze wirken aber schon auf die Welt (Kreditklima → Zins, Stimmung). Die Zeitung bringt die Gesetzesmeldung als eigenen Block unter den Kurzmeldungen (wie das Wahlergebnis), die Abstimmung als öffentliche Zahl in Prozent.
- Neue Hilfsgröße Trust-Marktanteil statt Jacobs echtem Anteil: In Kapitel 1 ist Jacob winzig; ab Kapitel 2/3 soll `trustShare` vom echten Markt (Jacob, Crane, Rivalen) kommen.
- Lobby nur vorbereitet: `WorldInput.lobby` mit fordern (+3 Druck), verhindern (−6 Punkte Zustimmung), verzögern (+2 Runden Debatte), verwässern (Regeln aus `lobby.weaken.rules`); welche Züge ein Gesetz anbietet, steht in seiner Datei. Keine Oberfläche, keine Gefallen-Währung.

**Offen / Entwurf.** Alle Zahlen und Zeitungstexte der zwei Gesetze sind Entwürfe von Claude (`draft: true`). Aufheben von Gesetzen (z. B. Steuer nach dem Krieg senken), Gesetze der Provinz (Ölkommission, Quoten) vs. Bund, die übrigen acht Gesetze aus GDD §10 (Transportpflicht, Steuerabzug, Quoten, Gewerkschaft, Bankaufsicht, Kriegswirtschaft, Importquoten, Umwelt), Gefallen als Währung und Lobby-Oberfläche (Senator Grady), Abrechnung von `incomeTax`/`cartelBan`/`breakupFrom` ab Kapitel 2, `trustShare` aus dem echten Markt, ein Brief oder Besuch, wenn ein Gesetz Jacob betrifft.
