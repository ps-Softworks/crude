# Weltmodell

Stand: 2026-10-04 · Version 0.4.1

Erzeugt mit `npm run welt` (tools/weltlaeufe.ts, Regeln in src/sim/world.ts, Zahlen in content/balance.yaml unter worldModel).
300 Welten (Seeds `welt-0` bis `welt-299`) über eine ganze Kampagne: 292 Runden = 73 Spieljahre, **ohne Spieler**. Rechenzeit 0.1 s.

- Alle Werte endlich: **ja** · Krisenzahlen in der Mehrheit der Welten im GDD-Ziel: **ja**

## Verläufe

Je Zelle: 10 % · **Median** · 90 % der Welten am Ende des Spieljahres; Min/Max über alle Welten und Jahre.

| Größe | Jahr 0 | Jahr 1 | Jahr 2 | Jahr 4 | Jahr 5 | Jahr 10 | Jahr 15 | Jahr 20 | Jahr 25 | Jahr 30 | Jahr 40 | Jahr 50 | Jahr 60 | Jahr 73 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Weltpreis (Index) | 1,00 · **1,00** · 1,00 | 1,02 · **1,03** · 1,03 | 1,02 · **1,03** · 1,04 | 0,94 · **1,01** · 1,06 | 0,88 · **0,99** · 1,05 | 0,80 · **0,93** · 1,30 | 0,86 · **1,10** · 1,45 | 0,80 · **1,03** · 1,33 | 0,86 · **1,05** · 1,31 | 0,83 · **1,05** · 1,27 | 0,85 · **1,04** · 1,23 | 0,84 · **1,02** · 1,22 | 0,85 · **1,02** · 1,15 | 0,84 · **1,01** · 1,14 | 0,35 | 2,27 |
| Nachfrage (Index) | 1,00 · **1,00** · 1,00 | 1,05 · **1,05** · 1,05 | 1,09 · **1,09** · 1,09 | 1,19 · **1,19** · 1,20 | 1,24 · **1,25** · 1,25 | 1,54 · **1,55** · 1,56 | 1,90 · **1,92** · 1,93 | 2,33 · **2,36** · 2,39 | 2,83 · **2,88** · 2,92 | 3,41 · **3,48** · 3,54 | 4,74 · **4,85** · 4,95 | 6,13 · **6,26** · 6,36 | 7,30 · **7,41** · 7,49 | 8,26 · **8,32** · 8,36 | 1,00 | 8,37 |
| Förderkapazität (Index) | 1,18 · **1,18** · 1,18 | 1,23 · **1,23** · 1,23 | 1,27 · **1,28** · 1,29 | 1,38 · **1,41** · 1,46 | 1,45 · **1,49** · 1,55 | 1,64 · **1,88** · 1,98 | 2,00 · **2,23** · 2,45 | 2,53 · **2,81** · 3,13 | 3,11 · **3,40** · 3,73 | 3,86 · **4,14** · 4,44 | 5,39 · **5,71** · 6,21 | 7,02 · **7,41** · 8,17 | 8,34 · **8,81** · 9,44 | 9,42 · **9,94** · 10,81 | 1,18 | 13,09 |
| Lager (Quartalsbedarf) | 0,25 · **0,25** · 0,25 | 0,24 · **0,24** · 0,24 | 0,24 · **0,24** · 0,24 | 0,23 · **0,24** · 0,26 | 0,23 · **0,25** · 0,28 | 0,18 · **0,26** · 0,30 | 0,13 · **0,21** · 0,27 | 0,16 · **0,21** · 0,28 | 0,15 · **0,19** · 0,25 | 0,14 · **0,18** · 0,24 | 0,11 · **0,15** · 0,20 | 0,08 · **0,12** · 0,17 | 0,07 · **0,10** · 0,14 | 0,05 · **0,08** · 0,13 | 0,00 | 0,55 |
| Kreditklima (0–100) | 43 · **50** · 57 | 46 · **53** · 60 | 48 · **55** · 64 | 50 · **61** · 71 | 45 · **63** · 73 | 32 · **61** · 77 | 33 · **55** · 75 | 30 · **50** · 72 | 33 · **48** · 67 | 31 · **48** · 67 | 35 · **48** · 67 | 33 · **48** · 65 | 34 · **48** · 63 | 35 · **49** · 64 | 17 | 100 |
| Stimmung (0–100) | 50 · **54** · 59 | 47 · **52** · 56 | 47 · **51** · 55 | 47 · **51** · 55 | 47 · **52** · 56 | 40 · **50** · 58 | 35 · **46** · 56 | 34 · **47** · 54 | 37 · **47** · 55 | 38 · **48** · 54 | 39 · **48** · 55 | 42 · **49** · 55 | 42 · **49** · 55 | 43 · **50** · 55 | 8 | 66 |
| Außenspannung (0–100) | 12 · **18** · 26 | 12 · **19** · 25 | 12 · **19** · 25 | 11 · **18** · 25 | 11 · **18** · 25 | 11 · **19** · 41 | 14 · **27** · 100 | 17 · **27** · 98 | 17 · **28** · 85 | 17 · **27** · 85 | 17 · **26** · 72 | 18 · **27** · 71 | 18 · **28** · 62 | 20 · **30** · 48 | 1 | 100 |
| Technikstand (0–100) | 6 · **8** · 10 | 7 · **9** · 10 | 7 · **9** · 11 | 8 · **10** · 12 | 9 · **11** · 13 | 12 · **15** · 17 | 16 · **20** · 23 | 21 · **25** · 29 | 27 · **32** · 37 | 34 · **40** · 45 | 51 · **57** · 62 | 67 · **72** · 76 | 80 · **84** · 86 | 91 · **93** · 94 | 6 | 94 |
| Nationalismus (0–100) | 9 · **14** · 19 | 11 · **15** · 20 | 12 · **17** · 23 | 15 · **20** · 26 | 16 · **21** · 27 | 20 · **28** · 35 | 26 · **35** · 45 | 31 · **43** · 57 | 35 · **49** · 61 | 40 · **53** · 67 | 46 · **58** · 74 | 52 · **64** · 76 | 53 · **68** · 79 | 50 · **70** · 81 | 5 | 100 |

Median je Spieljahr als Kurve (Jahr 0 bis 73):

- Weltpreis (▁ 0,7 … █ 1,4): `▄▄▄▄▄▄▄▄▃▃▃▄▄▄▅▅▅▄▄▄▄▄▄▄▅▅▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄`
- Weltpreis 90 % (▁ 0,7 … █ 2,0): `▃▃▃▃▃▃▃▃▃▄▄▄▅▅▅▅▅▅▅▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▃▄▄▄▄▄▄▄▃▃▃▃▃▃`
- Kreditklima (▁ 30 … █ 70): `▅▅▅▆▆▇▇▇▇▆▆▅▅▅▅▅▅▅▅▅▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄`
- Außenspannung 90 % (▁ 0 … █ 100): `▃▃▃▃▃▃▃▃▃▃▄▅▅▆▇██████▇▇▇▇▇▇▆▆▇▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▅▆▆▆▆▆▆▆▆▆▅▅▅▅▅▆▆▅▅▅▆▆▅▅▆▅▅▄`
- Stimmung (▁ 30 … █ 60): `▇▆▆▆▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▆`

## Krisen je Kampagne

| Krise | Ziel je Kampagne (GDD §15) | Ø | 10 % · 50 % · 90 % der Welten | Welten im Ziel | Ø in den ersten 20 Jahren |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kreditkrisen (Crash) | 2–4 | 2,86 | 1 · 3 · 5 | 75,7 % | 1,28 |
| Ölschwemmen (Riesenfund) | 1–3 | 2,08 | 0 · 2 · 4 | 69,3 % | 0,58 |
| Kriege in Übersee | 0–2 | 1,58 | 0 · 1 · 3 | 78,7 % | 0,45 |
| Verstaatlichungen | – | 0,81 | 0 · 1 · 2 | – | 0,00 |
| Regierungswechsel (von 18 Wahlen) | – | 7,75 | 5 · 8 · 11 | – | 1,45 |

Regierung: Handelspartei 29,7 %, Volksbund 32,7 %, Provinzliga 37,6 % der Regierungszeit.

## Preisausschläge

- Größter Preisrückgang binnen eines Jahres je Welt: Median 42,9 %, 90 % 54,8 %; Welten mit einem Einbruch von mindestens 40 %: 65,3 % (GDD §7.3: „fast −50 % in einem Jahr“ soll vorkommen).
- Größter Preisanstieg binnen eines Jahres: Median 46,9 %, 90 % 61,0 %.

## Kapitel 1 (Runde 1–16)

- Faktor auf den Trendpreis am Salt Hill nach 16 Runden: 10 % 0,981 · Median 1,003 · 90 % 1,017 (Grenze ±15,0 %).
- Zinsaufschlag der Bank je Runde: 10 % -0,25 · Median 0,00 · 90 % 0,00 Prozentpunkte (Grenze ±3,00).
- Welten mit einem Crash in Kapitel 1: 4,3 %; mit einem Krieg: 0,0 %.
- Ob die Kapitel-1-Balance hält, zeigt `npm run bots` (docs/botlaeufe.md) – die Bots spielen mit Weltmodell.

## Beispielwelt `welt-0`

- Jahr 14: Crash (Weltpreis 0,86, Kreditklima 27, Spannung 16)
- Jahr 14: Riesenfund (Weltpreis 0,66, Kreditklima 27, Spannung 15)
- Jahr 15: Banken erholt (Weltpreis 0,63, Kreditklima 29, Spannung 14)
- Jahr 19: Wahl: Provinzliga regiert (Weltpreis 1,21, Kreditklima 49, Spannung 27)
- Jahr 27: Wahl: Handelspartei regiert (Weltpreis 0,99, Kreditklima 61, Spannung 27)
- Jahr 31: Wahl: Provinzliga regiert (Weltpreis 0,93, Kreditklima 78, Spannung 25)
- Jahr 34: Crash (Weltpreis 0,83, Kreditklima 30, Spannung 18)
- Jahr 36: Banken erholt (Weltpreis 0,89, Kreditklima 37, Spannung 20)
- Jahr 43: Krieg (Weltpreis 0,96, Kreditklima 68, Spannung 75)
- Jahr 46: Frieden (Weltpreis 1,06, Kreditklima 75, Spannung 22)
- Jahr 46: Crash (Weltpreis 0,84, Kreditklima 26, Spannung 20)
- Jahr 48: Banken erholt (Weltpreis 0,64, Kreditklima 31, Spannung 16)
- Jahr 59: Wahl: Volksbund regiert (Weltpreis 1,03, Kreditklima 48, Spannung 27)
- Jahr 63: Wahl: Provinzliga regiert (Weltpreis 1,03, Kreditklima 45, Spannung 26)
- Jahr 67: Wahl: Handelspartei regiert (Weltpreis 1,04, Kreditklima 50, Spannung 33)
- Jahr 71: Wahl: Provinzliga regiert (Weltpreis 0,99, Kreditklima 64, Spannung 38)

<!-- Ab hier von Hand geschrieben: npm run welt lässt den Rest stehen. -->

## Wie das Weltmodell rechnet (4.1)

Code: `src/sim/world.ts` (eine Runde = `advanceWorld`), Auswertung `src/sim/worldRun.ts`, Zeitungsmeldungen `src/sim/worldNews.ts`, Zahlen `content/balance.yaml` → `worldModel`, Texte `content/newspaper.yaml` (`world_…`). Die Welt hat einen eigenen Zufall (Seed + „:welt“); Karte, Ereignisse und Rivalen würfeln wie vorher.

**Die neun Weltgrößen (GDD §7.1)**

| Größe | Im Zustand | Was sie treibt | Was sie auslöst |
| --- | --- | --- | --- |
| Angebot & Lager | `capacity`, `output`, `stock`, `pipeline` | Neubohrungen nach Preis und Kreditklima (mit 6 Runden Verzug), Erschöpfung 2 %/Runde, Riesenfunde, Verstaatlichung | Ölschwemme, Preissturz |
| Nachfrage | `demand` (+ `effectiveDemand`) | Wachstum bis zur Sättigung, Technik beschleunigt; Aufrüstung, Krieg (+), Crash (−) | Knappheit, Preisanstieg |
| Kreditklima | `credit` 0–100 | Boom (Preis über 1), Spekulation über 50 (schaukelt sich auf), Regierung, Rückkehr zur Mitte | Crash: Klima fällt auf ein Drittel, Neubohrungen halbiert, Nachfrage −8 %, Zinssprung |
| Öffentliche Stimmung | `mood` 0–100 | teures Öl, Arbeitslosigkeit (Crash), Krieg, Wohlstand (Kreditklima) | Wahlsiege |
| Politische Lage | `parties`, `government`, `electionIn` | Stimmung (sauer → Volksbund, froh → Handelspartei), billiges Öl → Provinzliga, Regierungsmüdigkeit; Wahl alle 16 Runden | Regierung färbt das Kreditklima (Handel lockert, Volksbund bremst) |
| Außenspannung | `tension` 0–100, `war` | Knappheit (Preis über 1,1), Aufrüstung über 40 (ab gut 60 stärker als die Diplomatie), Nationalismus | Krieg in Übersee (Nachfrage +12 %), danach Entspannung |
| Technikstand | `tech` 0–100 | wächst logistisch (Forschung aller Firmen) | billigerer Trendpreis, schnellere Nachfrage |
| Nationalismus | `nationalism` 0–100 | Ölhunger der Welt (× Nachfrage), Spannung | Verstaatlichung: −6 % Kapazität |
| (Ölpreis) | `price` | T · (Nachfrage / mögliche Förderung)^1,4 · Lagerdruck, begrenzt 0,35–2,8 | alles oben |

**Drei Rückkopplungen.** (1) Preis → Neubohrungen → Angebot → Preis: dämpft sich, aber erst nach dem Verzug – dazwischen laufen Tanks über oder leer. (2) Boom → Kreditklima → mehr Bohrungen und Spekulation → Klima steigt weiter → Crash; nach dem Crash fehlen Bohrungen, das Öl wird knapp, der nächste Boom beginnt. (3) Knappheit → Spannung → Aufrüstung → Nachfrage → Knappheit → Krieg.

**Kapitel 1 spürt die Welt sanft.** Der Trendpreis des Posted Price am Salt Hill wird mit `1 + 0,3 × (Weltpreis − 1)` multipliziert (höchstens ±15 %); neue Bankkredite bekommen einen Zinsaufschlag aus dem Kreditklima (±1 Punkt, im Crash +2, höchstens ±3, auf Viertelpunkte). Die Zeitung bringt höchstens eine Weltmeldung je Runde: was geschah (Crash, Krieg, Frieden, Verstaatlichung, Riesenfund, Wahl, Erholung) oder ein Frühwarnzeichen (enges/lockeres Geld, diplomatische Noten, Unmut) – nie eine Zahl. Salt Hill fließt mit seinem Über- oder Unterangebot winzig in die Welt ein (`saltHillInput`). Die Bank zeigt den heutigen Zins mit Aufschlag. Im Debug-Reiter stehen die Weltgrößen als Zahl.

**Spielstand.** Format 14 speichert `worldModel`; ältere Stände (Format 12/13) bekommen eine ruhige Durchschnittswelt (`neutralWorld`).

**Spieler-Eingriffe.** `advanceWorld` nimmt `WorldInput` (Angebot, Kredit, Stimmung, Spannung, Nationalismus verschieben). Kapitel 1 nutzt nur das Angebot; Lobby, Presse, Bank usw. hängen sich ab Kapitel 2 hier ein. Für Zeitsprünge gibt es `skipWorld`.

**Entscheidungen (ohne Rückfrage getroffen).**
- Die drei Schleifen standen im GDD nur als Hinweis („Schleife 1 dämpft, 2 und 3 schaukeln sich auf“); die Zuordnung oben ist aus §7.1/§7.2 abgeleitet.
- Ölschwemme = Riesenfund (Zufall je Runde, häufiger nicht). Gezählt werden Riesenfunde; Preiseinbrüche stehen getrennt unter „Preisausschläge“.
- Krieg ist immer „in Übersee“ (Aldmark gegen Varenhold); ob die Föderation eintritt, entscheidet erst das Parlament in späteren Kapiteln.
- Parteien kehren langsam zur Mitte zurück, die regierende Partei verliert etwas (Regierungsmüdigkeit) – sonst regierte eine Partei jahrzehntelang.
- Zielbereiche aus GDD §15 gelten je Kampagne; die Tests verlangen, dass die Mehrheit (> 60 %) der Welten darin liegt.

**Offen.** Welt-Einstellungen ruhig/normal/stürmisch (GDD §15) – dafür reicht später ein Satz Faktoren auf die Schwellen. Regionale Preise (§7.3 je Region), Gesetze (§10), Quoten, Kartell und die Wirkung der Spieler-Eingriffe kommen mit den späteren Kapiteln. Alle Zahlen in `worldModel` sind Platzhalter.
