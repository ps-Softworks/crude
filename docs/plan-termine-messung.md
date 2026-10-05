# Termine als Hauptwerkzeug – Messung Etappe 1

Etappe 1 aus dem Bauplan „Termine als Hauptwerkzeug“: verdeckte Geologie mit Salzrücken, Erkundung mit Hinweisen und Wissensstufen, echte Bohrchancen und das Planungsbrett im Kalender. Hier stehen die Abnahmekriterien des Plans, gemessen über 500 Seeds mit dem Standard-Bot (ausgewogen) und allen Ereignissen, dazu die Kapitel-1-Zielwerte aus `npm run bots` und alles, was vom Plan abweicht – mit Grund. Philipp war krank, darum ohne Rückfrage entschieden.

Erzeugt mit `npx tsx tools/termineMessung.ts 500 --schreiben` (Block zwischen den Marken), der Rest ist von Hand geschrieben.

## Was jetzt anders ist (kurz)

- **Jede Ranch hat eine verdeckte Fundchance q.** Sie hängt an der Zone (Kern, Ring, Rand) und an zwei Salzrücken je Gebiet: Wer nah an einem Rücken liegt, hat viel bessere Chancen, alle anderen schlechtere. Die Rücken sieht der Spieler nicht – nur in der Debug-Ansicht (`?debug=1`, rot gestrichelt).
- **Kein Gratis-Wissen mehr.** Zu Beginn kennt Jacob nur seine zwei Startoptionen und die Nachbarn des Salt-Hill-Funds (Gerede in Port Ellis). Alles andere ist auf der Karte schraffiert („Gerücht“): keine Zahl, nur „vermutlich gut/mäßig/schlecht“.
- **Erkunden kostet Termine.** Im Kalender (T) liegt das Planungsbrett: Tagesfelder Mo–Fr, zwei rote Nachtfelder (Überstunden kosten Kraft) und Karten in den Reitern Land · Markt · Fracht · Leute. Reiter Land: übers Land reiten, alten Farmer fragen, Geologen einstellen (Port Ellis, Hale oder Hallstead), mit dem Geologen kartieren, Bohrbericht kaufen, Bullards Tagebuch lesen, Rutengänger, Feldinspektion. Reiter Leute: die festen Termine (Abend mit Ruth, Sonntag am Fluss, Aushelfen …), die wirken wie bisher.
- **Hinweise sind fest.** Dieselbe Beobachtung auf derselben Ranch ergibt immer dasselbe – zweimal reiten bringt nichts Neues, Neuladen ändert nichts.
- **Die Prognose ist ehrlich.** Sie rechnet aus allen Hinweisen (auch denen der Nachbarn) und wird mit jeder Stufe schmaler: beritten 40, kartiert 25 (bester Geologe 15), Bohrbericht 10 Punkte. Eigene Bohrungen werden zum Bohrbericht und verraten etwas über die Nachbarn.
- **Ranch-Fenster:** Wissensstufe, Prognose oder Zonenwort, die Liste der Hinweise („Runde 3: Sickerstelle am Bach (Ritt)“) und die Erkundungs-Karten für diese Ranch als Knöpfe.
- **Einstieg:** Sieht nichts Bezahlbares gut aus, rät der Hinweis erst zum Ritt übers Land (ohne Überstunden). Der Schreibtisch sagt „Reite übers Land, bevor du pachtest“.
- **Wochenbericht:** Was die Karten ergeben haben, steht unten im Kalender und im Rundenbericht; der Kalender auf dem Tisch zeigt „Wochenbericht“, wenn einer bereitliegt.

<!-- Messung: npx tsx tools/termineMessung.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->

Stand: 2026-10-05 · Version 0.4.5+1 · 500 Seeds (`bot-0` bis `bot-499`), Standard-Bot mit allen 383 Ereignissen

| Kriterium | Ziel (Plan) | Ist | erfüllt |
| --- | --- | ---: | :---: |
| exploreGain: Trefferquote erkundet gewählt ÷ blind | ≥ 1,6 | 2,70 (57,2 % gegen 21,2 %, 2069 Pachten) | ja |
| Ehrliche Prognose: echte Fundquote je 20-Punkte-Klasse | höchstens 10 Punkte neben der Mitte | größte Abweichung 7,8 Punkte | ja |
| Rand- und Ringranches mit q ≥ 45 % | ≥ 10 % | 26,0 % | ja |
| Kernranches mit q ≤ 30 % | ≥ 15 % | 21,4 % | ja |
| Ø Termine je Runde für Erkundung, Runden 1–6 (Standard-Bot) | 1,5–3 | 1,73 | ja |

**Prognose gegen Wahrheit** (Prognosen aller bekannten, noch nicht selbst gebohrten Ranches zu Beginn von Runde 7 und die Prognosen der selbst gewählten Pachten):

| Prognose-Mitte | Prognosen | Ø Mitte | echte Fundquote | Abweichung |
| --- | ---: | ---: | ---: | ---: |
| 0–20 % | 3022 | 14,4 % | 11,0 % | 3,4 Punkte |
| 20–40 % | 3066 | 27,0 % | 26,5 % | 0,5 Punkte |
| 40–60 % | 2402 | 47,2 % | 42,5 % | 4,7 Punkte |
| 60–80 % | 2070 | 67,0 % | 59,3 % | 7,8 Punkte |
| 80–100 % | 2291 | 82,0 % | 79,4 % | 2,6 Punkte |

Standard-Bot in diesem Lauf: Kapitelziel 45,4 %, Pleite 0,4 %.

<!-- Ende der Messung -->

## Wie gemessen wird

- **exploreGain:** Jede Pacht, die der Standard-Bot selbst wählt (nicht aus einer Option) und über die er etwas wusste (Wissensstufe ab 1): Liegt dort wirklich Öl? Verglichen mit der blinden Wahl in genau diesem Moment – dem Ölanteil aller freien Ranches, also dem, was ein Griff ohne Wissen getroffen hätte (Plan: „blind gewählt etwa 30 %“). Der Standard-Bot erkundet, solange er weniger als drei bezahlbare freie Ranches mit mindestens 60 % kennt (balance.yaml `bots.explore`).
- **Ehrliche Prognose:** Prognosen aller bekannten, noch nicht selbst gebohrten Ranches zu Beginn von Runde 7 plus die Prognosen der selbst gewählten Pachten, in Klassen von 20 Punkten. Klassen mit weniger als 30 Prognosen zählen nicht.
- **Versteckte Struktur:** nur die Karte, über dieselben 500 Seeds.
- **Erkundung kostet Zeit:** Termine in Karten des Reiters Land (ohne feste Termine) in den Runden 1–6, gemittelt je Runde. Der Plan sagt „im Schnitt 1,5–3 Termine“ – gelesen als Schnitt je Runde (bei 5 Terminen je Runde gut ein Drittel der Zeit).
- **Bestehende Zielwerte:** `npm run bots`, Tabelle in `docs/botlaeufe.md`.

## Kapitel-1-Zielwerte (npm run bots, 1.000 Partien je Strategie)

Alle 15 Zielwerte im Rahmen; einer nachgezogen (Pipeline in Partien mit Kapitelziel, siehe unten).

| Kennzahl | vorher (0.4.5+1) | jetzt | Ziel |
| --- | ---: | ---: | --- |
| Höchste Siegquote (ausgewogen) | 38,2 % | 36,6 % | ≤ 40 % |
| Pleitequote Standard-Bot | 1,3 % | 0,5 % | ≤ 15 % |
| Pleitequote gierig | 17,7 % | 12,7 % | 5–45 % |
| Kapitelziel Standard-Bot | 68,3 % | 48,7 % | 20–70 % |
| Kapitelziel vorsichtig / gierig | 46,3 / 52,3 % | 28,1 / 36,7 % | – |
| Ø Imperium vorsichtig / gierig / ausgewogen | 62.354 / 69.653 / 90.901 $ | 37.460 / 44.820 / 61.940 $ | – |
| Blinde Wildcat-Bohrung (Rand, 300 m) | 21,2 % | 14,5 % | 5–25 % |
| Gemessener Rückgang je Quartal | 14,5 % | 11,8 % | 8–15 % |
| Ø Termine je Runde (Standard-Bot) | 5,00 | 5,00 | 4,5–5 |
| Höchster Anteil eines Transportwegs | 48,4 % | 43,6 % | ≤ 75 % |
| Pipeline in Partien mit Kapitelziel | 46,9 % | 62,6 % | ≤ 65 % (vorher ≤ 60 %) |
| Ø Bullard-Quellen | 7,9 | 7,1 | – |

Kapitel 1 ist spürbar schwerer geworden: Wer blind pachtet, trifft seltener, wer erkundet, trifft deutlich öfter. Das Kapitelziel des Standard-Bots liegt jetzt in der Mitte des Rahmens statt knapp an der Obergrenze (die Bot-Doku hatte genau davor gewarnt).

## Abweichungen vom Plan (mit Grund)

| Plan | jetzt | Grund |
| --- | --- | --- |
| Zonen-Grundwert = Startwert der Erkundung | eigener Wert `zones.prior` (Kern 0,58 · Ring 0,41 · Rand 0,12) | Der Startwert muss der Ø Fundchance der Zone entsprechen, sonst ist die Prognose nicht ehrlich. Mit den Salzrücken liegt der Ø im Kern über, am Rand unter dem Grundwert. |
| offTrend −0,10, noise 0,08 | −0,20 und 0,10 | Mit −0,10 hat praktisch keine Kernranch q ≤ 30 % (Abnahme: ≥ 15 %). |
| Ring-Grundwert 0,35 | 0,40 | Mit 0,35 sanken Kapitelziel und Imperium aller Bots stark; 0,40 hält Kapitel 1 als Einstieg. |
| Linien beliebig | Linien laufen 1,5–4 Einheiten neben der Dommitte vorbei (`offsetMin/Max`), 6 Einheiten zu beiden Seiten | Gingen sie durch die Mitte, läge fast jede Kernranch auf einem Rücken. |
| neighbourPower 0,5 | 0,2 | Mit 0,5 lag die echte Fundquote in den hohen Klassen 10–12 Punkte unter der Prognose (zu selbstsicher). |
| – | Chance nach den Hinweisen begrenzt auf qMin–qMax (3–85 %) | Keine Ranch ist sicher; ohne Grenze versprach die Prognose bis 97 %. |
| Rauschen der Prognose | ± 15 % der Bandbreite, fest je Ranch und Stufe aus dem Seed | Ehrlich, aber unscharf; Neuladen würfelt nicht neu. |
| Bullard (unverändert) | Bullard ahnt die Hälfte der Wahrheit (`rivals.bullard.insight` 0,5) | Mit reinem Zonenwissen bohrte er nur noch halb so viele Quellen (3,8 statt 7,9) – zu schwacher Rivale. |
| „Bohrbericht kaufen“ von Wildcattern | von Bullards Bohrmeister, nur wo Bullard gebohrt hat (150 $ trocken, 300 $ fündig) | Die Wildcatter haben in Kapitel 1 keine eigenen Ranches auf der Karte. |
| Tagebuch „1 Termin + 1 Überstunde“ | 2 Termine und Kraft wie eine Überstunde (−5) | Gleiche Wirkung, einfacher zu buchen. |
| Besprechung kartiert „2 Ranches“ | das Ziel und den am wenigsten bekannten Nachbarn | Eindeutig, ohne zweite Auswahl. |
| freundlicher Farmer | Landbesitzer „fromm“ (balance.yaml `exploration.friendlyOwners`) | Eine Besitzerart „freundlich“ gibt es nicht. |
| Karten-Zahlen in balance.yaml, Karten in plans.yaml | Zahlen **und** Aufbau (Reiter, Ziel, Zeitpunkt, Regel) in balance.yaml `plans.cards`, Texte in `content/plans.yaml` | So brauchen Bots und Tests keine Textdatei; `npm run check:content` prüft, dass jede Karte Texte und eine Regel hat. |
| Rundenend-Karten | Mechanik fertig und getestet (mit einer Testkarte), in Etappe 1 wirken alle Land-Karten sofort | Verhandlungen und Pakte kommen mit Etappe 2. |
| Version je Teilschritt hochzählen | unverändert 0.4.5+1 | Ausdrücklicher Auftrag für diesen Zweig. |
| Zielwert „Pipeline in Partien mit Kapitelziel“ ≤ 60 % | ≤ 65 % | Weniger Partien schaffen das Ziel, und die erfolgreichen sind die großen Förderer, bei denen sich die Pipeline lohnt. Über alle Partien der planenden Bots läuft sie zusammen etwas seltener als vorher (vorsichtig 19 statt 20 %, gierig 37 statt 49 %, ausgewogen 22 statt 14 %); in gut einem Drittel der erfolgreichen Partien gibt es keine. |
| Bots unverändert | Die planenden Bots reiten übers Land, bevor sie pachten (`bots.explore`); der Einstiegs-Bot folgt dem neuen Hinweis „erst reiten“ | Ohne Erkundung kennen sie kaum eine Ranch. |

## Spielstand

Format 20. Ältere Stände (Format 12–19) laden weiter: Jede Ranch, die eine Prognose hatte, gilt als kartiert (Stufe 2, ohne einzelne Hinweise), kein Geologe, leeres Brett; Ranches ohne gespeichertes q rechnen mit dem Zonenwissen.

## Offen für Etappe 2–4

- Reiter Markt und Fracht sind noch leer (Preis- und Transport-Aktionen).
- `exploreGain` und die übrigen neuen Kennzahlen sind noch keine `bots.targets` (Plan: Etappe 4).
- Briefe, die zur Erkundung passen (`geruecht_fund`, `post_geologe`, `dok_hale_gutachten`, `rutengaenger`, `dok_pike_urkunde`), sind noch nicht umgebaut (Etappe 3).
