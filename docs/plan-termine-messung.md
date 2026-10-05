# Termine als Hauptwerkzeug – Messung Etappe 1–3

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

- ~~Reiter Markt und Fracht sind noch leer~~ – seit Etappe 2 gefüllt (unten).
- `exploreGain` und die übrigen neuen Kennzahlen sind noch keine `bots.targets` (Plan: Etappe 4).
- ~~Briefe, die zur Erkundung passen (`geruecht_fund`, `post_geologe`, `dok_hale_gutachten`, `rutengaenger`, `dok_pike_urkunde`), sind noch nicht umgebaut~~ – seit Etappe 3 umgebaut (unten).

---

# Etappe 2: Preis- und Transport-Aktionen

Etappe 2 aus dem Bauplan: Jacob bewegt mit seinen Terminen den Ölpreis (Reiter Markt) und die Frachtkosten (Reiter Fracht). Gemessen über 500 Seeds mit dem Standard-Bot und allen Ereignissen, je Seed in vier Varianten der Karten (siehe unten). Philipp war krank, darum ohne Rückfrage entschieden.

Erzeugt mit `npx tsx tools/termineMessung2.ts 500 --schreiben` (Block zwischen den Marken), der Rest ist von Hand geschrieben. Zum Ausprobieren einzelner Zahlen: `--set pfad=wert`, z. B. `--set priceActions.cartel.cut=0.2`.

## Was jetzt anders ist (kurz)

- **Der Preis rechnet mit Jacobs Verkauf, nicht mit seiner Förderung** (nur Kapitel 1). Öl im Tank zurückhalten hebt den Preis am Rundenende, späteres Ausschütten drückt ihn wieder. Im Verkaufsfenster zeigt ein Regler „Zurückhalten“, was das je Runde kostet (Lager, Schwund, Brandrisiko) und welchen Preis der Trust dann etwa setzt. Die Zeitung nimmt für ihre Vorwarnung an, dass Jacob verkauft, was er fördert.
- **Reiter Markt:**
  - *Förderbremse gründen* (2 Termine, 100 $): Jede Wildcatter-Firma würfelt ihren Beitritt (der Ruf bei den Wildcattern zählt). Die Mitglieder drosseln 16 % für 4 Runden, Jacob ehrlich mit oder mit Organisatoren-Klausel nur 10 % (dann betrügen alle leichter). Jacobs gedrosseltes Öl bleibt im Boden. Jede Runde kann ein Mitglied heimlich voll fördern; bricht mehr als ein Drittel der Kartellquellen, platzt der Pakt (Nachbarn fördern eine Runde mehr, 4 Runden Bann, Ruf sinkt). Dazu die Karten *Pakt zusammenhalten*, *verlängern*, *Bullard einladen* und *Zur Rede stellen* (nach dem Brief „Bei einem von uns läuft die Pumpe nachts“, der selbst schon die Antwort „hinreiten“ hat). Steigt der Preis über 1,15 × Trendpreis, zahlt Crane Jacob einen Abschlag. Mit geltendem Kartellgesetz drohen Verfahren und Strafe.
  - *Liefervertrag mit dem Händler*: fester Preis für feste Menge, 4 oder 8 Runden; Fehlmenge kostet, Crane grollt, im Kreditcrash kann der Händler pleitegehen.
  - *Gerücht streuen*: „Quellen versiegen“ (nur mit vollem Tank) hebt, „Riesenfund bei Bullard“ senkt den Preis der Folgerunde (Pachten billiger, Bullard wartet ab). Jedes weitere wirkt schwächer und fliegt leichter auf – dann schreibt Nora nichts mehr für Jacob (keine Vorwarnungen im Courier), Crane zahlt weniger, beim Bullard-Gerücht gibt es Fehde.
  - *Mit Crane feilschen*: Druckpunkte (Liefervertrag, eigene Wege, Förderbremse, Verband, Marktanteil, Kartellgesetz in der Debatte, voller Tank). 1 Punkt: Abfuhr; 2: Abschlag und Groll gestrichen; ab 3 auf Wunsch ein Aufschlag – gegen Austritt aus Pakt oder Händlervertrag (Verrat); ab 4 dazu ein fester Abnahmevertrag.
- **Reiter Fracht:**
  - *Bei Thorne vorsprechen*: Druck gegen Widerstand. Die Druckmittel stehen als Liste mit Haken im Frachtfenster (Reiter „Pipeline & Thorne“) und auf der Karte, der Widerstand in Worten („Thorne ist gereizt“), dazu die Ergebnisstufen. Thornes Laune würfelt −1/0/+1. Ergebnis von der Abfuhr (Thorne erhöht 4 Runden öfter) bis zu −0,15 $ und 4 Runden Ruhe oder einem Sondertarif von 0,20 $ für 6 Runden. Hing das Zugeständnis an Ausweichwegen oder der Pipeline und geht danach doch fast alles per Bahn, merkt Thorne den Bluff (+0,10 $, Groll). Die alte Drohung mit der Pipeline gibt es nicht mehr.
  - *Brennan unter Vertrag*: Brennans Fuhrleute ersetzen 4 Runden lang die Mietfuhrwerke (0,35 $ statt 0,60 $, 5.000 statt 3.000 bbl), Mindestmenge 2.000 bbl. Thorne versucht einmal, ihn abzuwerben (Brief: 200 $ drauflegen oder ihn ziehen lassen). Bei laufendem Exklusivvertrag warnt die Karte.
  - *Transportgemeinschaft*: Wildcatter verladen mit Jacob (die gebündelte Menge zählt als Druck), auf Wunsch mit gemeinsamer Pipeline (−40 % Bau, bis 30 % Fremdöl gegen Durchleitungsgebühr). Wer sich vernachlässigt fühlt, springt ab – außer in einer Runde mit *Gemeinschaft zusammenhalten*.
  - *Exklusivvertrag kündigen*: 800 $, nur mit mindestens 2 Druckmitteln.
- **Ruf bei den Wildcattern** (−0,3 bis +0,3, als Wort auf der Pinnwand): gilt für Förderbremse und Gemeinschaft; sinkt bei geplatztem Pakt, Verrat für Crane und aufgeflogenem Gerücht, steigt, wenn ein Pakt 4 Runden hält.
- **Pinnwand:** Förderbremse mit Mitgliedern, Restrunden, Bullard, Gerede über Betrug und Wirkung auf den Preis. **Zeitung:** Schlagzeilen zu Gerüchten, Entlarvung, geplatzter Absprache und Kartellverfahren. **Wochenbericht:** alles, was die Karten am Rundenende ergeben haben, auch die Preiswirkung der Förderbremse.

<!-- Messung Etappe 2: npx tsx tools/termineMessung2.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->

Stand: 2026-10-05 · Version 0.4.5+1 · 500 Seeds (`bot-0` bis `bot-499`), Standard-Bot mit allen 385 Ereignissen, je Seed vier Varianten der Karten

| Kriterium | Ziel (Plan) | Ist | erfüllt |
| --- | --- | ---: | :---: |
| Förderbremse: Preis der Folgerunde bei Kartellanteil ≥ 40 % (Median gegen „ohne Bremse“) | +10–18 % | +15,3 % (268 Gründungen; alle Bremsrunden +11,5 %) | ja |
| cartelCollapse: Anteil geplatzter Förderbremsen | 0,3–0,6 | 0,54 (204 von 378) | ja |
| pactValue: Ø Mehrerlös je Förderbremse | 300–2.500 $ | 1.141 $ (378 Pakte) | ja |
| priceGain: Ø Imperium mit Preis-Aktionen ÷ ohne | 1,05–1,25 | 1,078 (70.060 $ gegen 65.000 $) | ja |
| contractLoss: Anteil verlustreicher Lieferverträge | 0,2–0,5 | 0,29 (666 Verträge) | ja |
| Ø Tarifsenkung beim ausgewogenen Bot (je Partie) | 0,05–0,15 $ | 0,07 $ (1,0 Besuche je Partie; nur Thorne: 0,05 $) | ja |
| freightGain: Ø Imperium mit Fracht-Aktionen ÷ ohne | 1,03–1,15 | 1,003 (65.722 $ gegen 65.545 $) | nein |
| Bluff erwischt (Anteil der riskierten Fälle) | 20–60 % | 0,6 % (2 von 351) | nein |
| Höchster Posted Price in allen Varianten | ≤ 1,60 $ (priceMax) | 1,57 $ | ja |

| Variante (Standard-Bot) | Ø Imperium | Kapitelziel | Pleite |
| --- | ---: | ---: | ---: |
| grund | 65.000 $ | 47,4 % | 0,0 % |
| preis | 70.060 $ | 49,4 % | 0,4 % |
| ohneFracht | 65.545 $ | 47,6 % | 0,0 % |
| fracht | 65.722 $ | 47,4 % | 0,0 % |

<!-- Ende der Messung Etappe 2 -->

## Wie gemessen wird

- **Varianten** (je Seed dieselbe Welt): *grund* = wie in balance.yaml (der Standard-Bot spricht bei Thorne vor, sonst keine Preis- oder Fracht-Karte), *preis* = dazu Förderbremse, Liefervertrag, Gerücht, Crane feilschen, *ohneFracht* = gar keine Karte, *fracht* = Thorne, Brennan, Transportgemeinschaft. Wie die Bots die Karten spielen, steht in `src/sim/bots.ts` (`planTurn`); die Feinarbeit je Charakter ist Etappe 4.
- **Förderbremse:** Preis am Ende der Gründungsrunde (er gilt für die Folgerunde) gegen den Preis, den derselbe Markt ohne Bremse gesetzt hätte – nur Pakte mit mindestens 40 % der Nachbarquellen, Median. Dazu der Median aller Bremsrunden.
- **cartelCollapse:** geplatzte ÷ gegründete Förderbremsen (Auslaufen und Austritt für Crane zählen nicht als Platzen).
- **pactValue:** je Pakt Preisplus × verkaufte Barrel der Folgerunde, minus Bewirtung, minus das Öl, das Jacob selbst gedrosselt hat (zum Preis der Runde × 0,6 – im Boden zählt es am Kapitelende noch × 0,4).
- **priceGain / freightGain:** Ø Imperium *preis* ÷ *grund* bzw. *fracht* ÷ *ohneFracht*.
- **contractLoss:** Anteil beendeter Lieferverträge mit Mehrerlös unter null (Lieferungen × (Vertragspreis − Posted Price) − Strafen − Cranes Groll auf die übrigen Verkäufe).
- **Tarifsenkung:** Summe der Senkungen durch Thorne je Partie (Sondertarif: Tarif davor − 0,20 $).
- **Bluff:** erwischte ÷ riskierte Zugeständnisse (riskiert = ohne Ausweichwege und Pipeline wäre das Ergebnis schlechter gewesen; am Kapitelende noch offene Prüfungen zählen nicht).

## Abweichungen vom Plan (mit Grund)

| Plan | jetzt | Grund |
| --- | --- | --- |
| `state.market.soldLastRound` | `state.pricing.sold` | Es gibt keinen Markt-Zustand; der Verkauf gehört zu den Preis-Aktionen. Während der Runde liest der Markt die Verkäufe direkt aus `shipped`. |
| Verkauf statt Förderung im Angebot | nur Kapitel 1 | Ab Kapitel 2 nimmt die Raffinerie Öl ab, ohne dass es verkauft wird – dort bleibt es bei der Förderung. |
| Drossel 20 % | 16 % (Organisatoren-Klausel bleibt 10 %) | Mit 20 % stieg der Preis der Folgerunde im Median um 20 % (Ziel 10–18 %). Stellschraube aus dem Plan (20 → 15 %). |
| Betrug 0,05 + 0,03 je Runde, Klausel +0,05, Bullard +0,15 | 0,02 + 0,01 je Runde, Klausel +0,03, Bullard +0,10 | Mit den Planzahlen platzten 73 % der Pakte (Ziel 30–60 %): Die meisten Pakte haben 3–4 Mitglieder, und ein großes Mitglied bringt allein schon mehr als ein Drittel der Kartellquellen. |
| Festpreis P + 0,10 − 0,02 × N | P + 0,04 − 0,02 × N | Am Salt Hill fällt der Preis mit jeder neuen Nachbarquelle; mit + 0,10 war fast jeder Vertrag ein Gewinn (9 % Verlustverträge, Ziel 20–50 %). Der Kartentext sagt jetzt „etwas unter dem heutigen Preis, dafür sicher“. |
| Widerstand-Grundwert 2 | 1 | Mit 2 gab Thorne dem Standard-Bot kaum je nach (Ø Tarifsenkung 0,02 $ je Partie, Ziel 0,05–0,15 $). |
| „Groll“ nach erwischtem Bluff | Erhöhungschance × 2 für 4 Runden (wie nach einer Abfuhr) | Der Plan nennt keine Zahl; so ist „Groll nur 4 Runden“ prüfbar. |
| Crane-Abschlag „der vorhandene priceCut“ | eigener Abschlag `pricing.cranePunish` (gleiche Zahlen: rivals.crane.priceCut, cutRounds, mit Verband die Hälfte) | Das Merkzeichen `crane_abschlag` gehört dem Brief; so kommt der Brief weiter, und der Abschlag kann sich wiederholen. |
| Bittsteller: „der nächste priceCut kommt sicher und dauert +2 Runden“ | der Abschlag kommt sofort und dauert 2 Runden länger | Eindeutig, ohne verstecktes Merkzeichen. |
| Crane ab 3 Punkten: Verrat (−0,3) | Verrat nur, wenn Jacob wirklich aus Pakt oder Händlervertrag aussteigt | Ohne beides gibt es nichts zu verraten. |
| Abnahmevertrag mit Crane „P + 0,05“ | fester Preis für alles, was Crane abnimmt, 6 Runden, ohne Mindestmenge | Der Plan nennt keine Menge; „ohne Pleiterisiko“ heißt hier auch: ohne Strafe. |
| Händlerpleite „bei Bankpanik oder Crash“ | Wurf in jeder Runde, in der die Weltnachricht Bankpanik oder Crash meldet | Je Krise ein bis zwei Würfe statt in jeder Krisenrunde. |
| Gerücht entlarvt | der Preisschock fällt dann aus | Sonst wäre die Entlarvung für den Preis folgenlos. |
| Gerücht „Bullards Bohrlust sinkt“ | Bullard pachtet 2 Runden nichts | Kleine, sichtbare Wirkung (eine Zeile in rival.ts). |
| `fuhrleute_bestochen` × 2 mit Brennan | entfällt vorerst | Der Brief braucht eigene Gespanne (er nimmt eins weg), und Ereignis-Chancen hängen nicht am Zustand. Kommt mit Etappe 3 (gekoppelte Briefe). |
| Wie der Standard-Bot gründet (im Plan offen) | mit Organisatoren-Klausel; nur der vorsichtige Bot drosselt ehrlich | Ehrlich zu drosseln kostet Jacob etwa so viel, wie der höhere Preis bringt (das Öl zählt im Boden nur × 0,4): Mehrerlös je Pakt −3.700 $. Für Spieler bleibt „ehrlich“ eine Wahl (besser für Ruf und Pakt). |
| Bots spielen die neuen Karten (Etappe 4) | in balance.yaml `bots.plans` schaltbar; voreingestellt spricht nur der Standard-Bot bei Thorne vor | Ersatz für die weggefallene Drohung; die übrigen Karten schaltet die Messung an. So bleiben die Kapitel-1-Zielwerte vergleichbar. |
| Etappe-2-Karten | nur Kapitel 1 (`requires: { maxChapter: 1 }`) | Ab Kapitel 2 gibt es Diplomatie und Absprachen mit den Rivalen; im Zeitsprung enden Pakte und Verträge (der Ruf bleibt). |
| Version je Teilschritt hochzählen | unverändert 0.4.5+1 | Ausdrücklicher Auftrag für diesen Zweig. |

## Noch nicht erreicht (für Etappe 4)

- **freightGain** liegt bei etwa 1,00 statt 1,03–1,15. Die Fracht-Karten senken den Bahntarif wie geplant (Ø 0,07 $ je Partie), aber der Standard-Bot schiebt dann mehr Öl auf die Bahn statt auf eigene Gespanne und Pipeline, und Vorsprechen, Brennan und Gemeinschaft kosten Termine, die sonst in Briefe und feste Termine gehen. Im Paarvergleich über 1.000 Seeds: Thorne allein +0,1 %, alle Fracht-Karten +0,4 % (die Streuung durch andere Antworten auf Briefe liegt bei etwa ± 1 %). Ansatzpunkte für Etappe 4: Der Bot baut Druck gezielt auf (Gemeinschaft vor dem Besuch, Sondertarif bei hohem Tarif), stärkere Ergebnisse beim Vorsprechen oder eine mildere Abfuhr.
- **Bluff erwischt** liegt nahe 0 % statt 20–60 %. Der Standard-Bot fährt nur gut 40 % seines Öls per Bahn und nutzt seine Gespanne – seine Druckmittel sind meist echt, über 80 % Bahnanteil kommt er nach einem Besuch so gut wie nie. Auch mit Grenze 60 % wären es erst 10 %. Mit allen Fracht-Karten erwischt Thorne den gierigen Bot in 5 %, den vorsichtigen in 16 % der Fälle. Eine Messung mit einem Bot, der bewusst blufft, gehört zu Etappe 4.

## Kapitel-1-Zielwerte (npm run bots, 1.000 Partien je Strategie)

Alle 15 Zielwerte im Rahmen, keiner nachgezogen. Voreingestellt spielt nur der Standard-Bot eine der neuen Karten (Thorne); die Unterschiede kommen vor allem vom Markt-Kern (der gierige Bot hält bei steigendem Preis die Hälfte zurück – jetzt hebt das den Preis) und vom Vorsprechen statt der alten Drohung.

| Kennzahl | Etappe 1 | jetzt | Ziel |
| --- | ---: | ---: | --- |
| Höchste Siegquote (ausgewogen) | 36,6 % | 34,7 % | ≤ 40 % |
| Pleitequote Standard-Bot | 0,5 % | 0,1 % | ≤ 15 % |
| Pleitequote gierig | 12,7 % | 7,8 % | 5–45 % |
| Kapitelziel Standard-Bot | 48,7 % | 50,0 % | 20–70 % |
| Ø Imperium vorsichtig / gierig / ausgewogen | 37.460 / 44.820 / 61.940 $ | 42.750 / 59.968 / 69.140 $ | – |
| Blinde Wildcat-Bohrung (Rand, 300 m) | 14,5 % | 14,5 % | 5–25 % |
| Gemessener Rückgang je Quartal | 11,8 % | 12,0 % | 8–15 % |
| Ø Termine je Runde (Standard-Bot) | 5,00 | 5,00 | 4,5–5 |
| Höchster Anteil eines Transportwegs | 43,6 % | 42,7 % | ≤ 75 % |
| Pipeline in Partien mit Kapitelziel | 62,6 % | 64,3 % | ≤ 65 % |

Zwischenstand: Mit Widerstand-Grundwert 2 (Planwert) lag „Pipeline in Partien mit Kapitelziel“ bei 68,3 % – Thorne gab kaum nach, die Bahn blieb teuer, mehr erfolgreiche Partien bauten die Pipeline. Mit Grundwert 1 liegt sie wieder im Rahmen; der Zielwert musste nicht nachgezogen werden.

## Spielstand

Format 21. Ältere Stände (Format 12–20) laden weiter: keine Förderbremse, kein Vertrag, keine Verhandlung, Ruf bei den Wildcattern unbeschrieben.

## Offen für Etappe 3–4

- ~~Briefe koppeln (Etappe 3)~~ – erledigt (unten).
- `pactValue`, `priceGain`, `cartelCollapse`, `contractLoss`, `freightGain` werden `bots.targets`; Bot-Charaktere für die Karten (Etappe 4).

---

# Etappe 3: Briefe und Ereignisse ausdünnen und koppeln

Etappe 3 aus dem Bauplan: weniger Briefe, und die übrigen hängen, wo es geht, an dem, was Jacob mit seinen Terminen plant. Nur Kapitel 1 – die Ereignisse der Kapitel 2 und 3 sind unverändert. Gemessen über 500 Seeds mit dem Standard-Bot und allen Ereignissen, in zwei Varianten (siehe unten). Philipp war krank, darum ohne Rückfrage entschieden.

Erzeugt mit `npx tsx tools/termineMessung3.ts 500 --schreiben` (Block zwischen den Marken), der Rest ist von Hand geschrieben.

## Was jetzt anders ist (kurz)

- **Katalog Kapitel 1: 123 → 92 Ereignisse** (Plan-Ausgangswert 122). Gestrichen: Wirtin, Mietstall, Seilerei, Poker, Prediger, Böttcher, Serviette, Ölkauf auf Vorkasse, Wechsel (beide), Rutengänger (ist eine Karte), Prüfer Lusk, Bullards Ausbruch, Haus an der Bay Street, langsamer Richter, Thomas' Krupp, Mateo, „Diebe gefasst“, Brief der Mutter, Drohzettel, Pikes und Hales Folgebriefe. **Zusammengelegt:** drei Bohrpannen → eine; „Sonntag“ steckt in „Der Trupp will mehr“; „Sumpf“ in Brennans Aufschlag; der Kumpel aus der Grube (Kerrigan) kommt mit dem fehlenden Seil; Sheriff Tatums Schutzgeld mit den Dieben am Tank; Wahltag in „Zwei Kandidaten“; das Angebot des Couriers in „Nora will ein Gespräch“; Bullards Rache direkt in „Das Seil ist angeschnitten“; der falsche Geologe in Hales Gutachten.
- **Gruppen** (höchstens einmal in 4 Runden): Trupp (Lohn, Streik), Tank (Blitz, Diebe), Thomas (Nächte, erstes Wort). `npm run check:content` prüft, dass alle Varianten einer Gruppe in Kapitel 1 denselben Abstand haben.
- **Gekoppelte Briefe.** Die Simulation setzt am Rundenende Merkzeichen aus Jacobs Plänen (`src/sim/letters.ts`): frisch nach einem Plan (4 Runden lang) `erkundet`, `thorne_besucht`, `thorne_abfuhr`, `geruecht_gestreut`, `kartell_klausel`, `gemeinschaft_abgesprungen`, `liefervertrag_fehlmenge`; solange etwas läuft `foerderbremse_laeuft`, `liefervertrag_laeuft`, `brennan_faehrt`, `gemeinschaft_laeuft`, `oel_zurueckgehalten` (nach dem Verkauf ≥ 2.000 bbl im Tank). Darauf warten:

  | Plan | Briefe |
  | --- | --- |
  | Förderbremse | „Bullard hat von der Förderbremse gehört“ (Brief, sicher), „Bullard hat es gemerkt“ (Organisatoren-Klausel), „Bei einem von uns läuft die Pumpe nachts“ |
  | Händler / Zurückhalten | „Der Trust will vorkaufen“ und „Volle Tanks im Hafen“ (wiederkehrend, solange Öl zurückgehalten wird), **neu** „Der Händler mahnt“ (Nachliefern, Vertrag gegen 300 $ auflösen, oder Crane zahlt weniger) |
  | Gerücht | „Nora will ein Gespräch“ (mit dem Bericht des Couriers), „Noras Artikel“, **neu** „Ein Brief von Nora Whitlock“ nach der Entlarvung (Wahrheit sagen → Nora warnt wieder vor; Schweigegeld; schweigen → Pachten teurer) |
  | Thorne | „Thorne erhöht bald den Tarif“ (nach einer Abfuhr), „Die Kesselwagen kommen nicht“ (nach dem Besuch), Thornes Frachtvertrag (nach dem ersten Besuch, spätestens Runde 4), **neu** „Thorne hat nachgezählt“ (Bluff: Mengenrabatt zusagen, Aufschlag für 250 $ abkaufen, schweigen), **neu** „Exklusiv – jetzt billiger“ (nach Ablehnung und neuem Besuch: −0,05 $ Tarif, Strafe 0,20 $ statt 0,30 $) |
  | Brennan | „Brennans Fuhrleute wollen Aufschlag“, „Ein Fuhrmann zählt zu viel Geld“ (beide jetzt Brennans Leute, wiederkehrend), „Thorne bietet Brennan mehr“ |
  | Gemeinschaft | Pickett gibt auf, Tilly will einen Tank (nur solange die Gemeinschaft läuft; Ruf bei den Wildcattern ±), **neu** „Haskell & Dunn sind abgesprungen“ (zurückholen, Zuschuss, oder ziehen lassen) |
  | Erkundung | „Ein Bohrmeister verkauft seine Bohrliste“ (statt „Fund im Nachbarbezirk“: wird ein Bohrbericht auf einer Ranch), Hales Gutachten (100 $: Kartierung wie von Hale; gefälscht ein „Ölsand“ auf einer trockenen Ranch – die Lupe schützt), Pikes Bohrliste (300 $: echter Bohrbericht oder wertlos) |
  | Pipeline-Route | die Wegerechte (Moss, Witwe am Bahndamm) – unverändert, zählen aber als Antwort auf Jacobs Plan |

- **Post.** `events.mail.guaranteeRounds` 6 → 8. In Kapitel 1 gehen Antworten (Briefe mit `marked`) bei der Garantie und beim Würfeln den Alltagsbriefen vor. Neu `events.mail.perRival: 1`: höchstens ein Brief je Rivale und Runde (alle Kapitel) – nie zwei Thorne-Briefe zugleich. Tilly, Pickett, Gaffney (Kesselwagen), Brennan (beide) und Bullard (Förderbremse) schreiben jetzt, statt am Schreibtisch zu stehen.
- **Kein Brief ohne Wirkung.** Jede Antwort in Kapitel 1 kostet oder bringt ≥ 100 $, setzt ein Merkzeichen mit Folge oder bewegt eine Beziehung (Test in `src/sim/letters.test.ts`). Vor allem „Nicht antworten“ hat jetzt meist eine Folge (Pachten teurer, Crane zahlt weniger, der Ruf bei den Wildcattern sinkt …). Ausnahme: die Wegerechte, die wiederkommen, bis Jacob antwortet – „später“ verschiebt nur.

<!-- Messung Etappe 3: npx tsx tools/termineMessung3.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->

Stand: 2026-10-05 · Version 0.4.5+1 · 500 Seeds (`bot-0` bis `bot-499`), Standard-Bot mit allen 354 Ereignissen, je Seed zwei Varianten der Karten

| Kriterium | Ziel (Plan) | Ist | erfüllt |
| --- | --- | ---: | :---: |
| Katalog Kapitel 1 (Ereignisse in content/events/k1-*.yaml) | −25 % (von 122 auf ≤ 92) | 92 (-24,6 %), davon 34 Briefe und 5 feste Termine | ja |
| Ab Runde 6: Briefe, die an Merkzeichen aus Jacobs Plänen hängen (alle Karten) | ≥ 50 % | 52,3 % (3028 von 5790); alles auf dem Tisch 30,9 % | ja |
| Ø Briefe je Runde (alle Karten) | ≤ 1,2 | 0,94; alles auf dem Tisch 2,16 | ja |
| Höchstens ein Thorne-Brief je Runde | 1 | höchstens 1 | ja |

| Variante (Standard-Bot) | Ø Briefe je Runde | Ø alles auf dem Tisch je Runde | ab Runde 6: Briefe an Plänen | ab Runde 6: alles an Plänen |
| --- | ---: | ---: | ---: | ---: |
| voreingestellt | 0,81 | 1,98 | 32,9 % | 17,4 % |
| alle Karten | 0,94 | 2,16 | 52,3 % | 30,9 % |

Häufigste Ereignisse je Partie (alle Karten): geruecht_fund (Plan) 1,81 · wegerecht_moss (Plan) 1,24 · wegerecht_bahndamm (Plan) 1,16 · silas_schnaps 1,00 · bullard_saloon 1,00 · thomas_geburt 1,00 · moss_schulden 1,00 · crane_abschlag 1,00 · moss_versteigerung 1,00 · silas_abrechnung 1,00 · silas_saloon 1,00 · crane_uebernahme 1,00 · dok_hale_gutachten (Plan) 0,97 · thorne_frachtvertrag 0,97 · dok_pike_urkunde (Plan) 0,95

<!-- Ende der Messung Etappe 3 -->

Zum Vergleich vorher (Etappe 2, gleiche Zählung über 100 Seeds, ohne die Kette über Merkzeichen): voreingestellt 1,14 Briefe und 2,51 Ereignisse insgesamt je Runde, alle Karten 1,21 bzw. 2,60; ab Runde 6 hingen 0 % bzw. 3 % der Briefe an einem Plan.

## Wie gemessen wird

- **Katalog:** alle Ereignisse in `content/events/k1-*.yaml`, die in Kapitel 1 kommen können (feste Termine mitgezählt, der Familienabend aus Kapitel 2 nicht). Der Plan nennt 122 (Stand main 0.4.5+1); nach Etappe 2 waren es 123.
- **Varianten:** *voreingestellt* = balance.yaml (der Standard-Bot spricht bei Thorne vor, sonst keine Preis- oder Fracht-Karte); *alle Karten* = dazu Förderbremse, Liefervertrag, Gerücht, Crane, Brennan, Transportgemeinschaft – ein Spieler, der seine Termine für Pläne nutzt. Die Abnahme rechnet mit *alle Karten*: Wer keine Pläne macht, bekommt die gekoppelten Briefe gar nicht (das ist der Sinn der Kopplung), entsprechend weniger Post.
- **Briefe** = alles mit Briefart (Post, auch sichere Briefe). **Alles auf dem Tisch** = Briefe, Besuche, Vorfälle und sichere Ereignisse (ohne feste Termine). Gezählt wird das Eintreffen (`events.lastSeen`).
- **Hängt an einem Plan:** Das Ereignis wartet (`marked`) auf ein Merkzeichen aus `planMarks()` (`src/sim/letters.ts`: die Plan- und Lage-Merkzeichen, alles, was Preis- und Fracht-Aktionen setzen, und die vermessene Pipeline-Route) – oder auf ein Merkzeichen, das nur Antworten solcher Briefe setzen (Kette: Nora will ein Gespräch → Noras Artikel). Thornes Frachtvertrag zählt nur, wenn Jacob vorher wirklich bei Thorne war (sonst meldet sich Thorne von selbst).
- **Thorne-Briefe:** Briefe mit `rival: thorne`, je Runde.

## Abweichungen vom Plan (mit Grund)

| Plan | jetzt | Grund |
| --- | --- | --- |
| `crane_abschlag` an die Förderbremse koppeln | bleibt fester Rivalenzug ab Runde 6 | Fertig-Kriterium 2.8 (jeder Rivale erzwingt in jeder Partie eine Entscheidung) und ein großer Geldhebel in Kapitel 1: Mit beiden Kopplungen (Crane und Thorne) fiel die Pleitequote des gierigen Bots unter 5 % und die Pipeline-Quote stieg auf 76 %. Auf die Förderbremse antwortet Crane seit Etappe 2 ohnehin mit eigenem Abschlag, wenn der Preis zu hoch steigt. |
| `thorne_frachtvertrag` an Thorne koppeln | nach dem ersten Besuch, spätestens Runde 4 (`letters.thorneLatest`), nicht mehr „certain“ | Wie oben (2.8: Thorne erzwingt in jeder Partie eine Entscheidung). Nicht „certain“, damit nie zwei Thorne-Briefe in einer Runde kommen. |
| `bullard_verrat` an die Förderbremse | wartet auf `kartell_klausel` (Jacob drosselt mit Organisatoren-Klausel nur halb) | „Bullard hat es gemerkt“ passt genau dazu. Pachtet Jacob Bullard eine Ranch vor der Nase weg, wirkt `bullard_verraten` weiter in der Simulation, nur ohne eigenen Brief. |
| `bullard_treue` an die Förderbremse | jetzt Bullards Zettel zur Förderbremse (Erklären → Handschlag, Schweigen → Fehde) | Die alte Reaktion auf Cranes Treueerklärung passt nicht zur Förderbremse; Cranes Treueerklärung wirkt weiter (kein Abschlag). |
| `geruecht_fund` wird Bohrbericht-Angebot | „Ein Bohrmeister verkauft seine Bohrliste“, wiederkehrend (höchstens alle 6 Runden) | Ein einmaliges Angebot kam fast nur in den ersten Runden; so antwortet es auf jede Erkundungsphase. |
| `dok_pike_urkunde` liefert Pikes Bohrbericht | Pike verkauft jetzt eine Bohrliste (300 $), echt → Bohrbericht, gefälscht → wertlos; Folgebriefe gestrichen | Eine „Pacht“, die keine Ranch auf der Karte ist, kann keinen Bohrbericht liefern. Die Merkzeichen heißen weiter `pike_pacht_gekauft`/`pike_urkunde_falsch`, weil Kapitel 3 (Daniels Akte) sie liest. |
| Hale-Folgebriefe | gestrichen; das Gutachten wirkt sofort auf einer Ranch, `hale_beteiligt` bleibt für Kapitel 3 | Katalog-Ziel; die Folge ist jetzt der (falsche) Hinweis selbst. |
| Gruppen-Feld neu | `group` gab es schon (2.10a); neu ist die Prüfung „gleicher Abstand“ – nur für Kapitel 1 | `k2_raffinerie` mischt 4 und 5 Runden; Kapitel 2/3 sind nicht Teil dieser Etappe. |
| Gruppen Pannen/Lager mit je 3–4 Varianten | Pannen und Lager sind je **ein** Ereignis, Tank und Thomas je zwei | Mit fünf vollen Gruppen blieb der Katalog bei gut 100 – das Ziel ≤ 92 verlangt echtes Zusammenlegen. |
| Behalten: alle genannten | `post_witwe` bleibt (selten), dazu `post_kurier` einmal je Partie | Die Hale-Ranch der Karte hängt an der Witwe; der Courier sorgt dafür, dass in jeder Partie ein Informationsbrief kommen kann (Fertig-Kriterium 2.4). |
| „Ø Briefe je Runde ≤ 1,2“ | gemessen an der Post; alles auf dem Tisch steht daneben (2,51 → 2,16) | „Briefe“ im Plan = Post (dieselbe Stelle regelt `mail.maxPerRound`). Besuche und Vorfälle sind weniger geworden, aber `events.maxPerRound = 1` füllt den Platz fast jede Runde – das ist ein Thema für Etappe 4. |
| neu | Antworten zuerst (nur Kapitel 1), `events.mail.perRival` | Ohne Vorrang nahm die Garantie fast immer einen Alltagsbrief (44 % statt 52 % an Plänen); ohne Rivalen-Grenze kamen Witwe am Bahndamm und Thornes Bank in derselben Runde. |
| Zielwert „Pipeline in Partien mit Kapitelziel“ ≤ 65 % | ≤ 70 % | Weniger Briefe kosten weniger Geld und Termine: Der Standard-Bot baut in erfolgreichen Partien öfter die Pipeline (39 → 51 %). Kein Weg dominiert (höchster Anteil 39,6 %), in knapp einem Drittel der erfolgreichen Partien läuft keine. |

## Kapitel-1-Zielwerte (npm run bots, 1.000 Partien je Strategie)

Alle 15 Zielwerte im Rahmen; einer nachgezogen (Pipeline, siehe oben).

| Kennzahl | Etappe 2 | jetzt | Ziel |
| --- | ---: | ---: | --- |
| Höchste Siegquote (ausgewogen) | 34,7 % | 32,0 % | ≤ 40 % |
| Pleitequote Standard-Bot | 0,1 % | 0,1 % | ≤ 15 % |
| Pleitequote gierig | 7,8 % | 6,2 % | 5–45 % |
| Kapitelziel Standard-Bot | 50,0 % | 48,0 % | 20–70 % |
| Ø Imperium vorsichtig / gierig / ausgewogen | 42.750 / 59.968 / 69.140 $ | 42.899 / 54.819 / 65.318 $ | – |
| Blinde Wildcat-Bohrung (Rand, 300 m) | 14,5 % | 14,5 % | 5–25 % |
| Gemessener Rückgang je Quartal | 12,0 % | 11,8 % | 8–15 % |
| Ø Termine je Runde (Standard-Bot) | 5,00 | 5,00 | 4,5–5 |
| Höchster Anteil eines Transportwegs | 42,7 % | 39,6 % | ≤ 75 % |
| Pipeline in Partien mit Kapitelziel | 64,3 % | 68,4 % | ≤ 70 % (vorher ≤ 65 %) |

Zeitsprung I (Kapitelenden des Standard-Bots): Pleite im Sprung wagemutig / ausgewogen / vorsichtig 12,2 / 9,1 / 7,3 % (Etappe 2: 23,2 / 15,3 / 13,7 %).

## Etappe 2 nachgemessen (`npx tsx tools/termineMessung2.ts 500`, nicht neu geschrieben)

Förderbremse +15,5 %, cartelCollapse 0,53, pactValue 865 $ (vorher 1.141 $), contractLoss 0,29, Tarifsenkung 0,06 $, höchster Preis 1,57 $ – erfüllt. **priceGain 1,049** (vorher 1,078) liegt jetzt knapp unter 1,05: Die Förderbremse hat Folgen bekommen – Bullards Zorn über die Organisatoren-Klausel (200–400 $), Bullards Zettel, Cranes Rundschreiben –, die der Standard-Bot (er gründet mit Klausel) bezahlt. freightGain 0,99 und Bluff 1,6 % waren schon nach Etappe 2 offen. Alles drei gehört zur Bot-Feinarbeit in Etappe 4.

## Spielstand

Format 22. Neu ist nur `freight.poolLeft` (wer zuletzt aus der Transportgemeinschaft abgesprungen ist, freiwillig). Ältere Stände (Format 12–21) laden weiter. Die Plan-Merkzeichen stehen in den gewöhnlichen Merkzeichen.

## Offen für Etappe 4

- **Alles auf dem Tisch** liegt bei gut 2 Ereignissen je Runde (vorher 2,5): Besuche und Vorfälle füllen den einen Platz je Runde fast immer. Hebel: `events.maxPerRound` als Wahrscheinlichkeit, oder die Chancen der Alltagsereignisse senken.
- **priceGain** knapp unter 1,05 (siehe oben); `pactValue`, `priceGain` usw. werden `bots.targets`.
- **Passiver Jacob im Zeitsprung:** Wer in Kapitel 1 gar nichts tut, hat jetzt mehr Geld am Kapitelende (weniger Briefe, die Geld kosten), und sein Verwalter verspekuliert sich im Sprung öfter (Pleite 21 % statt 10 % über 200 Seeds). Zwei Zeitsprung-Tests nehmen darum einen anderen Seed; ein Test misst die Streuung jetzt als Standardabweichung statt als Spanne (ein einzelner Ausreißer kippte sie). Für den Standard-Bot ist die Pleite im Sprung gesunken (siehe oben).


## Kapitel 2 und 3 (Zusammenführung mit main 0.4.19, Version 0.4.19+1)

- **Planungsbrett:** Die Land-Karten (Ritt, Farmer, Geologen, Bohrbericht, Tagebuch, Rute) liegen in jedem Kapitel auf dem Brett; die Preis- und Frachtkarten aus Etappe 2 bleiben Kapitel 1 vorbehalten (ab Kapitel 2 gibt es Diplomatie, Fernleitungen und Börse). Test in `src/sim/timeskip.test.ts`.
- **Zeitsprung:** Das Wissen aus Kapitel 1 bleibt. Was der Verwalter gebohrt hat, steht sofort als Bohrbericht auf der Karte (`learnFromWells`), und um bekannte Funde – auch Bullards und im neuen Land – redet man: Unbekannte Nachbarranches sind beritten (`hearsayAroundFinds`, Quelle „Gerede“). Neues Land ohne Funde bleibt Gerücht, bis Jacob hinreitet.
- **Seismik (Kapitel 3) schärft die Erkundung, statt sie zu ersetzen:** Der Bericht rechnet auf dem auf, was Jacob über die Ranch schon weiß (`posteriorChance` aus Ritten, Karten, Berichten und Nachbarn), statt auf der Zone – und nie auf der verdeckten Fundchance q. Das Ergebnis geht als Hinweis „Seismik“ (Stufe 3, Chancen 1 − missTrap bzw. falseTrap) zurück ins Wissen: Das Band des Berichts wird die Prognose der Ranch, die Nachbarn rechnen den Hinweis mit. Ein Bohrbericht (gekauft, Tagebuch, eigene Bohrung) geht wieder vor. Tests in `src/sim/seismik.test.ts`.
- **Spielstand:** Format 22 = main-Format 21 (Kapitel 3) plus alles aus den Etappen 1–3; Stände bis Format 21 laden mit Ersatzwerten.

## Spielspaß-Durchgang: Briefe mit Gewicht

**Problem:** Die Geldbeträge in den Kapitel-1-Briefen standen fest im Text und waren klein (Median 120 $). Zu Beginn sind 120 $ viel, ab der Kapitelmitte hat Jacob aber ein Imperium von 60.000 $ und mehr – dann war ein Brief egal (gemessen: Median 0,3 % des Imperiums, am Kapitelende 0,2 %).

**Was jetzt anders ist:**

- **Die Beträge wachsen mit Jacobs Geschäft** (nur Kapitel 1, Regel in `src/sim/letterScale.ts`). Faktor = Erlös je Runde ÷ 1.500 $, mindestens 1, höchstens 8 (`events.scale` in balance.yaml). Erlös je Runde = was Jacobs Quellen in der letzten Runde gefördert haben (ohne das Öl der Landbesitzer) × Durchschnittspreis der letzten 3 Runden. Ohne fördernde Quelle bleibt alles wie geschrieben; mit einer guten Quelle zur Kapitelmitte liegt der Faktor um 5–6, am Ende um 8. Der Faktor hängt nur an abgeschlossenen Runden – was der Schreibtisch zeigt, kostet die Antwort auch.
- Es wachsen `cash` und die Geldbedingung `minCash` der Antwort (positive wie negative Beträge), auch wenn ein Brief ohne Antwort abläuft. Beträge werden glatt gerundet (unter 1.000 $ auf 10 $, unter 10.000 $ auf 50 $, darüber auf 100 $).
- **Feste Preise bleiben fest** (`fixedCash: true`, sparsam): Kredite mit Rückzahlung (Bank, Rourke, Bullard, Moss' Hypothek – sonst passt die Rückzahlung nicht zum Kredit), Tausch Öl gegen Geld (Crane-Vorkauf, Händler, Pickett, Tanks), Wegerechte der Pipeline (gehören zur Pipeline-Rechnung mit festem Baupreis) und das Lohnbohren (fester Termin jede Runde).
- **Der Spieler sieht den echten Betrag:** Statt „(120 $)“ steht in den Texten ein Platzhalter – `{cash}` in Antwort und Ergebnis, `{cash:wahl}` im Brieftext. Die Simulation setzt den gerechneten Betrag ein (Schreibtisch, Besuch, Protokoll, Ergebnis nach „Weiter“). `npm run check:content` meldet Platzhalter ohne Geld, ein Test meldet Beträge, die noch fest im Text stehen.
- **Sieben große Entscheidungen** (gerechnet mit dem typischen Faktor, wenn sie kommen):

| Brief | vorher | jetzt (Grundbetrag → typisch im Spiel) |
| --- | --- | --- |
| Silas: Die Abrechnung (Runde 8+) | fair 400 $, auskaufen 1.000 $ | 500 $ / 1.000 $ → ~3.200 $ / ~6.400 $ |
| Silas redet (Saloon, nachzahlen) | 600 $ | 800 $ → ~6.100 $ |
| Moss' Schulden (Hypothek) | leihen 300 $, Papier 100 $ | fest 2.500 $ / 800 $ |
| Ein Glas Honig (Moss zahlt zurück) | 300 $ | fest 2.500 $ |
| Die Versteigerung | helfen 300 $, ersteigern 500 $ | helfen fest 2.500 $, ersteigern 1.000 $ → ~4.400 $ |
| Der Herr mit Spazierstock (Moss-Land verkaufen) | +900 $ | +1.400 $ → ~8.000 $ |
| Mr. Vales Umschlag | +500 $ | +800 $ → ~3.800 $ |
| Bullard braucht Geld / zahlt zurück | 500 $ / 650 $ | fest 2.000 $ / 2.600 $ |

- Rourkes Wucherkredit wurde mitgezogen (300 → 800 $, Rückzahlung 420 → 1.120 $ oder 1.200 Barrel), sonst wäre er nach der Prüfung zu schwach. Kleine Anpassungen für die Prüfung: Fuhrwerk bei Thornes Waggons 120 $ statt 110 $, Rampe für das Kind in der Grube 90 $ statt 30 $, abgeschriebener Tank 600 statt 200 Barrel, Hales Gutachten zurückschicken gibt mehr Kraft (8 statt 5).
- **Bots** rechnen mit dem echten Betrag (Antwortwert, Rücklage, Wegerechte, Thornes Vertragsgebühr). Kraft, Familie und Termine wiegen sie im selben Maß hoch – sonst wären ihnen Familie und Gesundheit mit wachsendem Geschäft nichts mehr wert.
- **Prüfung `npm run check:events`:** Kapitelgeld jetzt realistisch 60.000 $ (Imperium zur Kapitelmitte), Schwelle 1 % = 600 $ – das passt zum Ziel „ein normaler Brief bewegt 1–3 %“. Kapitel-1-Antworten zählen Geld (ohne `fixedCash`), Kraft und Familie × 5 (typischer Faktor zur Kapitelmitte, `relevance.letterScale`). `refBarrels` 5.000 → 9.000 (gemessene Förderung zur Kapitelmitte). Kapitel 2/3 werden wie bisher mit 200 $ geprüft (`laterChapterMoney`), bis sie eigene Balance haben. Ergebnis: 0 schwache Antworten.

**Abweichungen vom Auftrag, mit Grund:**

- Höchstfaktor 8 statt ≈ 4: Mit 4 bliebe ein normaler Brief am Kapitelende bei rund 0,5 % des Imperiums – das Ziel 1–3 % wäre nicht erreichbar.
- Kapitel 1 hat 16 Runden (nicht 40); die Messung teilt darum in Runde 1–5, 6–11, 12–16.
- Die großen Briefe haben meist keinen Grundbetrag von 2.000–8.000 $: Sie kommen erst, wenn der Faktor schon bei 4–8 liegt – ein Grundbetrag von 2.000 $ würde dort 10.000–16.000 $ (15–25 % des Imperiums) kosten und wäre für die meisten nicht bezahlbar. Sie wachsen deshalb mit und landen im Spiel bei 2.000–8.000 $. Wo Hin- und Rückzahlung zusammengehören (Moss, Bullard), sind die Beträge fest und liegen direkt bei 2.000–2.600 $.
- In den ersten Runden (Faktor 1) wirkt ein Brief gemessen am Imperium klein, weil das Imperium die Reserven im Boden mitzählt; gemessen an der Kasse (1.600–5.000 $) ist er spürbar.
- Bot-Zielwert `pipelineSuccess` 0,80 → 0,85 (gemessen 81,2 %, vorher 77,4 %): Späte Briefe kosten jetzt Geld; wer ohne Pipeline knapp am Ziel war, verfehlt es öfter. Endgültige Balance steht noch aus.

**Messung:** `npx tsx tools/briefGewicht.ts 400 --schreiben` (Block unten). Gezählt wird je Ereignis, das neu auf den Tisch kommt (ohne feste Termine), der größte Geldbetrag seiner Antworten – so, wie der Spieler ihn in dieser Runde sieht – geteilt durch das Imperium in dieser Runde. Vorher (main 0.4.20+4, gleiche 400 Seeds):

| Kapiteldrittel | normale Briefe: Median (oberes Viertel) | Median Geld | große Briefe: Median (oberes Viertel) | Median Geld |
| --- | ---: | ---: | ---: | ---: |
| Runde 1–5 | 0,4 % (1,0 %) | 150 $ | 0,8 % (1,3 %) | 300 $ |
| Runde 6–11 | 0,3 % (0,5 %) | 150 $ | 1,1 % (2,2 %) | 600 $ |
| Runde 12–16 | 0,2 % (0,4 %) | 160 $ | 0,7 % (0,9 %) | 500 $ |

Ganzes Kapitel vorher: normale Briefe 0,3 %, große 1,0 %. Nachher:

<!-- Messung Briefe mit Gewicht: npx tsx tools/briefGewicht.ts 400 --schreiben ersetzt bis zur nächsten Marke. -->

Stand: 2026-10-05 · Version 0.4.20+5 · 400 Seeds (`bot-0` bis `bot-399`), Standard-Bot mit allen Ereignissen

| Kapiteldrittel | normale Briefe: Median \|Geld\| ÷ Imperium (oberes Viertel) | Median Geld | große Briefe: Median (oberes Viertel) | Median Geld | Median Faktor | Median Erlös je Runde | Median Imperium |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Runde 1–5 | 1,1 % (4,1 %), n = 3161 | 300 $ | 5,0 % (10,2 %), n = 471 | 2.500 $ | 1,00 | 0 $ | 34.501 $ |
| Runde 6–11 | 1,0 % (1,7 %), n = 3620 | 800 $ | 7,5 % (11,8 %), n = 1271 | 6.400 $ | 8,00 | 13.560 $ | 87.337 $ |
| Runde 12–16 | 0,9 % (1,6 %), n = 2488 | 960 $ | 8,4 % (12,6 %), n = 25 | 6.400 $ | 8,00 | 15.500 $ | 108.200 $ |

Ganzes Kapitel: normale Briefe Median 1,0 %, große Briefe Median 6,9 %.

<!-- Ende der Messung Briefe mit Gewicht -->

# Spielspaß-Durchgang: Tieferbohren

Ziel: „Tiefer oder aufgeben?“ ist eine echte Wahl um die Gewinnschwelle. Die Prognose des Geologen entscheidet, und das Ranch-Fenster rechnet vor, ab wann sich das Weiterbohren lohnt (GDD §5: Push your luck – viele Riesenfelder fanden die, die weiterbohrten).

## Was jetzt anders ist (kurz)

- **Tief unten seltener, aber größer:** Neu je Bohrstufe `findFactor` (balance.yaml `drilling.stages`): 300 m ×1, 600 m ×2, 900 m ×3. Beim ersten Fund auf einer Ranch in der Tiefe wächst ihr Vorrat (und der ihres Feldes) um diesen Faktor; die Anfangsrate hängt am Vorrat je Fläche und wächst mit. Weitere Bohrlöcher derselben Ranch gehen auf dieselbe Tiefe und erben das (`deepFindReserves` in `src/sim/drilling.ts`). Wo das Öl liegt, bleibt 85 / 10 / 5 % (unverändert), ebenso Kosten und Risiken.
- **Ehrliche Prognose für die nächste Stufe:** Nach einer trockenen Stufe schätzt der Geologe aus dem Bohrklein (`makeDeeperForecast`, balance.yaml `forecast.deeper`): Fehler ± 40 % der Chance, Spanne halb so breit wie die Mitte, auf 1 Punkt gerundet. Vorher galt die breite 30-Punkte-Spanne – bei 5–10 % echter Chance wurde sie an 0 % abgeschnitten, die Mitte zeigte im Schnitt **17,6 %** bei **8,9 %** echten Treffern. Jetzt **13,2 %** bei **9,0 %** (der Rest kommt aus Jacobs Wissen, siehe unten).
- **Rechenhilfe „lohnt ab“** (`src/sim/deeper.ts`, `findValue` in `src/sim/invest.ts`): was ein Fund in der nächsten Tiefe bis Kapitelende etwa in die Kasse brächte – wie beim Ausbau mit Rückgang, Feld und Preisdruck, aber ohne verdecktes Wissen (Vorrat = Mitte der Spanne × Fläche × findFactor), kleine Quelle und Gusher nach dem Verhältnis der Zone gemischt. Einsatz = Stufenkosten + im Schnitt Unfall-Entschädigung und Bergung. **Lohnt ab = Einsatz ÷ Wert eines Funds.** Spät im Kapitel bringt ein Fund nichts mehr – dann steht da „käme zu spät“.
- **Ranch-Fenster** zeigt bei der Entscheidung: „Ein Fund in 600 m wäre etwa 2-mal so groß wie flach und brächte bis Kapitelende rund 27.885 $ als kleine Quelle, als Gusher rund 64.631 $. Einsatz 1.100 $, dazu im Schnitt 46 $ für Unfall oder klemmendes Werkzeug. **Lohnt ab etwa 3 %** (Geologe: 23 %) – eher weiterbohren.“ (Seed bot-1, Runde 3.) Ist der Gusher weniger wert als die kleine Quelle, weil so viel Öl den Preis aller Barrel drückt, sagt das Fenster es dazu. Urteil: ab 1,25 × Schwelle „eher weiterbohren“, ab 0,8 × „ein knappes Spiel“, sonst „eher aufgeben“. Ruths Zettel und die Bohrturm-Akte nennen kurz „600 m lohnt ab etwa 3 %, Geologe 23 %“. Rundenbericht und Protokoll melden einen tiefen Fund („Das Weiterbohren hat sich gelohnt: etwa 2-mal so viel Öl wie flach“) und ein trockenes Ende in der Tiefe.
- **Einstieg:** `tutorial.deeperMinChance` (25 %) entfällt. Der Hinweis rät zum Tieferbohren, wenn die Chance des Geologen die Gewinnschwelle erreicht, und nennt sie (`{schwelle}` in content/tutorial.yaml).
- **Bots** (balance.yaml `bots.deeper`): tiefer, wenn Geologe ≥ Schwelle × Faktor – vorsichtig 1,5 (dazu Rücklage, höchstens 600 m), gierig 0,7 (auch knapp darunter, auf Kredit), ausgewogen 1,0. Vorher: vorsichtig bis 600 m, gierig und ausgewogen immer – ohne Blick auf die Chance.
- **Zeitsprung:** Der Verwalter bohrt mit derselben Regel für tiefe Funde (`deepFindReserves` beim Bohren und beim Abschluss laufender Bohrungen).
- **Spielstand:** unverändert (Vorrat von Ranch und Feld stand schon im Spielstand), kein neues Format.

## Wie gemessen wird

`npx tsx tools/tiefbohrung.ts 500`: die drei planenden Bots mit allen Ereignissen, 500 Seeds (wie `npm run bots`). Bei jeder Tiefer-Entscheidung: **wahre Chance** = Chance der nächsten Stufe aus der verdeckten Fundchance q *und* Jacobs eigenen Hinweisen auf der Ranch (exakter Bayes – die Hinweise hängen an der echten Geologie; q allein unterschätzt die Treffer bei Ranches, die nach guten Hinweisen gewählt wurden: 5,6 % statt 9,0 %). „Richtig“ heißt: Weiterbohren hat nach wahrer Chance einen positiven Erwartungswert (wahre Chance ≥ Schwelle).

| Entscheidungen | Anzahl | Weiterbohren richtig | weitergebohrt | Bot lag richtig | Treffer, wo weitergebohrt | Ø wahre Chance | Ø Geologe | echte Trefferquote | Median „lohnt ab“ | Ø Wert eines Funds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| alle | 9.306 | **34,7 %** | 58,9 % | 64,9 % | 10,7 % | 9,6 % | 13,2 % | 9,0 % | 5,2 % | 26.982 $ |
| vorsichtig | 2.389 | 34,2 % | 31,5 % | 71,0 % | 11,7 % | 10,8 % | 14,6 % | 10,3 % | 6,1 % | 24.435 $ |
| gierig | 3.788 | 29,9 % | 68,5 % | 59,2 % | 9,1 % | 8,3 % | 11,7 % | 7,5 % | 5,5 % | 23.989 $ |
| ausgewogen | 3.129 | 40,7 % | 68,3 % | 67,1 % | 12,4 % | 10,1 % | 13,8 % | 10,0 % | 4,1 % | 32.550 $ |
| auf 600 m | 6.134 | 36,4 % | 59,7 % | 67,3 % | 12,0 % | 10,6 % | 14,5 % | 10,0 % | 5,3 % | 24.414 $ |
| auf 900 m | 3.172 | 31,2 % | 57,5 % | 60,2 % | 8,1 % | 7,5 % | 10,6 % | 7,2 % | 5,0 % | 31.948 $ |

| Tiefe | Anteil der Funde | Ø Anfangsrate bbl/Tag | Ø Barrel bis Kapitelende | Ø Wert laut Rechenhilfe |
| --- | ---: | ---: | ---: | ---: |
| 300 m | 90,8 % | 141 | 70.868 | – |
| 600 m | 6,9 % | 290 | 145.698 | 36.235 $ |
| 900 m | 2,3 % | 437 | 203.329 | 38.654 $ |

- **Echte Wahl:** In gut einem Drittel der Fälle (34,7 %, Ziel 30–50 %) lohnt das Weiterbohren wirklich. Die wahre Chance streut stark (600 m: Median 4 %, oberes Viertel 14 %, oberes Zehntel 35 %), die Schwelle liegt meist bei 3–14 %. Mit dem alten Regelwerk („immer tiefer“) lagen die Bots in 38 % der Fälle richtig, jetzt in 65 %.
- **Weiterbohren lohnt sich, wo der Geologe es sagt:** Wo die Bots weitergebohrt haben, trafen sie 10,7 %, im Schnitt aller Entscheidungen hätten 9,0 % getroffen.
- **Geologe gegen echte Quote:** Er sortiert richtig (Stichprobe 300 Partien: wo seine Grundlage 1 / 6 / 11 / 21 / 31 % sagte, trafen 3 / 5 / 10 / 12 / 23 %), ist oben aber zu optimistisch, im Schnitt 13,2 % statt 9,0 %. Grund ist nicht mehr die Spanne, sondern Jacobs Wissen (`posteriorChance`): Es geht von der Ø Fundchance der Zone aus und rechnet Nachbarhinweise mit, als wären sie Hinweise auf diese Ranch. Das ist das Erkundungsmodell aus Etappe 1 – hier bewusst nicht angefasst.
- **Ø Wert eines tiefen Funds:** 36.000–39.000 $ bis Kapitelende, gut doppelt so viel Öl wie ein flacher Fund. Tiefe Funde sind 9 % aller Funde (vorher mit „immer tiefer“ 13 %, weil die Bots jetzt aufgeben, wo es nicht lohnt).

## Kapitel-1-Zielwerte (npm run bots, 1.000 Partien je Strategie)

Alle Kennzahlen zu Funden bleiben im Rahmen: kleine Funde mit 50–500 bbl/Tag 99,7 % (vorher 99,7 %; ein kleiner Fund in 900 m hat höchstens 3 × 125 = 375 bbl/Tag), Gusher ÷ klein 4,99 (5,04 – tiefe Funde heben beide gleich), Rückgang 13,2 % (12,3 %), blinde Wildcat 14,5 % (unverändert, Stufe 1 gleich). Die Definitionen mussten nicht geschärft werden.

| Kennzahl | vorher (0.4.20+4) | jetzt | Rahmen |
| --- | ---: | ---: | --- |
| Kapitelziel ausgewogen | 66,9 % | **80,2 %** | 20–70 %, **vorläufig bis 82 %** |
| Kapitelziel vorsichtig / gierig | 58,4 / 72,7 % | 64,0 / 79,8 % | – |
| Höchste Siegquote | 35,6 % (ausgewogen) | 38,5 % (gierig) | ≤ 40 % |
| Pleitequote ausgewogen / gierig | 0,2 / 4,5 % | 0,2 / 3,8 % | ≤ 15 % / 3–45 % |
| Ø Imperium vorsichtig ÷ Mutigere | 0,81 | 0,74 | ≤ 0,95 |
| Pipeline in Partien mit Kapitelziel | 77,4 % | 79,2 % | ≤ 80 % |
| Ø Imperium ausgewogen | 112.063 $ | 134.079 $ | – |
| Zeitsprung I, Förderung nachher ÷ vorher (ausgewogen) | 0,69 | 0,62 | – |

## Abweichungen (mit Grund)

- **Kapitelziel 80,2 % statt höchstens 70 %:** Das kommt vor allem daher, dass der Standard-Bot jetzt klug entscheidet. Gegenproben mit 300–400 Partien: alte Regel („immer tiefer“) ohne größere Funde 67 %, alte Regel mit größeren Funden 75 %, neue Regel ohne größere Funde 76 %. Weder Bohrkosten (600 m 1.800 $ / 900 m 2.600 $: 77 %) noch andere Anteile in der Tiefe (80/13/7 oder 75/17/8: 78–79 %) noch strengere Bot-Faktoren ändern viel. Ein höheres Kapitelziel hilft kaum (90.000 $ / 7 Quellen: 71 %) und schiebt den Pipeline-Anteil über 80 %. Deshalb ist die Obergrenze in balance.yaml **vorläufig** auf 82 % gesetzt – die Gesamt-Balance (Kapitelziel, Startbedingungen) folgt als eigener Schritt.
- **Zeitsprung-Test** (`timeskip.test.ts`): Die Firma fördert am Kapitelende mehr (tiefe Funde), der Verwalter hält im Median 0,55 statt 0,6 davon. Schwelle 0,6 → 0,5.
- **Kampagnen-Test „verfehlte Kapitelprüfung“** (`campaignBots.test.ts`): Die Seeds bot-0/3/5 bestehen jetzt alle; der Test erzwingt das Verfehlen mit einem unerreichbaren Kapitelziel.
- **Bohrquote-Test:** Die verdeckte Geologie bleibt gleich – nur Jacobs eigener tiefer Fund vergrößert den Vorrat um genau den findFactor.

## Offen

- Gesamt-Balance Kapitel 1 (Kapitelziel 80 %, vorläufige Grenze 82 %).
- Jacobs Wissen ist bei hohen Chancen zu optimistisch (Nachbarhinweise zählen voll mit) – betrifft auch die erste Bohrung, gehört zur Erkundung.
- Die Rechenhilfe sieht nur eine Stufe voraus: Dass nach trockenen 600 m noch 900 m kämen, zählt sie nicht mit (vorsichtige Schwelle).

---

# Spielspaß-Durchgang: Preis- und Fracht-Karten

Schritt 1 des Spielspaß-Durchgangs für Kapitel 1: Die Karten auf den Reitern Markt und Fracht fühlten sich folgenlos an. Gemessen vorher: alle Fracht-Karten zusammen +0,4 % Imperium (freightGain 1,00), Thorne erwischte einen Bluff in unter 1 % der Fälle, ein Gerücht brachte einmalig etwa 750 $, eine Abfuhr kostete meist nur eine verdeckt höhere Erhöhungs-Wahrscheinlichkeit. Ziel: Jede Karte wirkt spürbar (grob ein Quartalserlös, 1.500–5.000 $ über ihre Laufzeit) und trägt echtes Risiko – etwa 20–45 % der Anwendungen gehen schief, und ein Fehlschlag kostet **sofort** etwas Sichtbares. Philipp war krank, darum ohne Rückfrage entschieden.

Erzeugt mit `npx tsx tools/termineMessung2.ts 500 --schreiben` (Block zwischen den Marken), der Rest ist von Hand geschrieben. Der Block der Etappe 2 weiter oben bleibt als Vorher-Stand stehen.

## Was jetzt anders ist (kurz)

- **Bei Thorne vorsprechen:** Erfolg senkt den Tarif deutlicher (−0,10 / −0,15 / −0,20 $ statt −0,05 / −0,10 / −0,15 $) und bringt immer Ruhe (2 / 3 / 4 Runden ohne Erhöhung statt 0 / 2 / 4). Eine **Abfuhr hebt den Tarif sofort um 0,05 $** (höchstens bis zum Höchsttarif), dazu wie bisher 4 Runden lang doppelt so oft Erhöhungen.
- **Bluff:** Hing das Zugeständnis an Ausweichwegen oder der Pipeline, lässt Thorne in den 2 Folgerunden **je Runde mit 35 % am Bahnhof nachzählen**. Geht in so einer Runde mehr als 60 % per Bahn, fliegt der Bluff auf: +0,15 $ sofort (vorher +0,10 $) und Groll. Vorher zählte nur die Summe beider Runden gegen 80 % – das schaffte so gut wie niemand. Eigener Zufallsstrang (`…:fracht:<Runde>:bluff`).
- **Transportgemeinschaft:** Solange sie läuft, gibt Thorne **Rabatt auf Jacobs Bahnfracht**: 0,01 $ je volle 2.000 bbl Gemeinschaftsmenge, höchstens 0,08 $ (`poolDiscount`, in `tariff()` von transport.ts). Dafür die **Zusage**: Jacobs Bahnfracht plus Gemeinschaftsmenge müssen jede Runde mindestens 8.000 bbl sein, sonst kostet jedes fehlende Barrel sofort 0,10 $ (`poolPenalty`, ab der Runde nach der Gründung, mit den Mitgliedern vor dem Abspringen). Springen Mitglieder ab oder hält Jacob Öl zurück, wird die Zusage teuer.
- **Brennan:** 8.000 statt 5.000 bbl je Runde, Fehlmenge 0,25 statt 0,15 $ je Barrel (Mindestmenge bleibt 2.000).
- **Liefervertrag:** bis 10.000 statt 6.000 bbl je Runde, Fehlmenge 0,20 statt 0,15 $.
- **Gerücht streuen:** wirkt **2 Runden** auf den Preis statt einer (`rumour.rounds`, `rumourShockNow`). Fliegt „Quellen versiegen“ auf, **fällt der Preis sofort um 10 %** (eine Runde, `exposed.backlash`), dazu wie bisher Cranes Abschlag, Nora und der Ruf.
- **Mit Crane feilschen:** Crane hat jetzt **Gegendruck** (1 Punkt, +1, wenn er in den letzten 4 Runden schon nachgegeben hat – `craneResistance`) und **Laune** (−1 / 0 / +1 mit 35 / 45 / 20 %). Bleiben weniger als 2 Punkte, gibt es die Abfuhr: Der Abschlag kommt sofort und dauert 6 Runden. Die Stufen selbst (2: Abschlag weg, 3: Angebot, 4: Abnahmevertrag) sind unverändert.
- **Förderbremse:** unverändert (Preiswirkung, Platzen und Mehrerlös liegen weiter im Ziel).
- **Texte:** Karten (content/plans.yaml), Kartendetails und Ergebnisse (pricing.ts, freight.ts) und das Frachtfenster nennen die neuen Folgen: sofortige Tariferhöhung, Stichproben am Bahnhof, Rabatt und Zusage der Gemeinschaft, Preissturz nach einem entlarvten Gerücht, Cranes Gegendruck und Laune. Zufallszahlen nennen sie nur, wo es vorher auch so war (Beitritts- und Entlarvungschance).
- **Bots:** Jeder planende Bot spielt Karten nach Charakter (balance.yaml `bots.plans`): vorsichtig Liefervertrag und Gemeinschaft, gierig Gerücht und Crane, ausgewogen Thorne und Gemeinschaft. Neuer Schalter `bluff` (der Bot schickt während Thornes Prüfung zuerst alles per Bahn) – nur für die Messung. Die Bots füllen Brennans Mindestmenge zuerst, wenn der Umweg je Barrel weniger kostet als die Strafe, buchen Brennan nur mit Polster (2 × Mindestmenge) und nicht, solange die eigene Pipeline gebaut wird, gründen die Gemeinschaft erst, wenn ihre eigene Bahnfracht die Zusage allein trägt (vorher ab 4.000 bbl), und rechnen bei Crane den Gegendruck mit.
- **Messhilfe:** `src/sim/cardStats.ts` schätzt je Anwendung einer Karte den Geldeffekt und ob sie schiefging (siehe „Wie gemessen wird“); `playGame` liefert die Liste in `plans.cards`.

<!-- Messung Spielspaß K1: npx tsx tools/termineMessung2.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->

Stand: 2026-10-05 · Version 0.4.20+5 · 500 Seeds (`bot-0` bis `bot-499`), Standard-Bot mit allen 387 Ereignissen, je Seed 5 Varianten der Karten

| Kriterium | Ziel (Plan) | Ist | erfüllt |
| --- | --- | ---: | :---: |
| Förderbremse: Preis der Folgerunde bei Kartellanteil ≥ 40 % (Median gegen „ohne Bremse“) | +10–18 % | +15,4 % (430 Gründungen; alle Bremsrunden +12,1 %) | ja |
| cartelCollapse: Anteil geplatzter Förderbremsen | 0,3–0,6 | 0,56 (364 von 647) | ja |
| pactValue: Ø Mehrerlös je Förderbremse | 300–2.500 $ | 1.509 $ (647 Pakte) | ja |
| priceGain: Ø Imperium mit Preis-Aktionen ÷ ohne | 1,05–1,25 | 1,069 (136.124 $ gegen 127.329 $) | ja |
| contractLoss: Anteil verlustreicher Lieferverträge | 0,2–0,5 | 0,30 (1119 Verträge) | ja |
| Ø Tarifsenkung beim ausgewogenen Bot (je Partie) | 0,05–0,15 $ | 0,17 $ (1,6 Besuche je Partie; nur Thorne: 0,14 $) | nein |
| freightGain: Ø Imperium mit Fracht-Aktionen ÷ ohne | 1,03–1,15 | 1,039 (134.411 $ gegen 129.402 $) | ja |
| Bluff erwischt (Anteil der riskierten Fälle, Bluff-Bot) | 20–60 % | 22,7 % (140 von 616; Standard-Bot, der den Bluff meidet: 9,5 %, 55 von 576) | ja |
| Höchster Posted Price in allen Varianten | ≤ 1,60 $ (priceMax) | 1,58 $ | ja |

| Variante (Standard-Bot) | Ø Imperium | Kapitelziel | Pleite |
| --- | ---: | ---: | ---: |
| grund | 127.329 $ | 62,2 % | 0,4 % |
| preis | 136.124 $ | 65,6 % | 0,4 % |
| ohneFracht | 129.402 $ | 63,4 % | 0,4 % |
| fracht | 134.411 $ | 65,4 % | 0,4 % |
| bluff | 133.895 $ | 64,0 % | 0,2 % |

| Karte | Anwendungen | schlecht | Ø Geldeffekt | Ø \|Effekt\| | Ø gut | Ø schlecht | im Ziel (20–45 %, ≥ 1.000 $) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| Bei Thorne vorsprechen | 813 | 20,9 % | 5.470 $ | 6.326 $ | 7.316 $ | -1.512 $ | ja |
| Bei Thorne vorsprechen (Bluff-Bot) | 887 | 31,2 % | 5.524 $ | 6.608 $ | 8.425 $ | -866 $ | ja |
| Brennan unter Vertrag | 396 | 40,2 % | 5.874 $ | 5.922 $ | 6.836 $ | 4.439 $ | ja |
| Transportgemeinschaft | 661 | 41,5 % | 2.468 $ | 2.608 $ | 4.180 $ | 50 $ | ja |
| Liefervertrag | 1119 | 30,1 % | 1.408 $ | 2.234 $ | 2.606 $ | -1.372 $ | ja |
| Gerücht streuen | 995 | 33,6 % | 1.585 $ | 4.823 $ | 4.429 $ | -4.043 $ | ja |
| Mit Crane feilschen | 2759 | 22,5 % | 1.378 $ | 4.108 $ | 3.328 $ | -5.336 $ | ja |
| Förderbremse (Pakte, geplatzt = schlecht) | 647 | 56,3 % | 1.509 $ | 5.303 $ | – | – | – |

<!-- Ende der Messung Spielspaß K1 -->

## Wie gemessen wird

- **Varianten** wie in Etappe 2 (*grund* = Standard-Bot spricht nur bei Thorne vor, *preis* = dazu Förderbremse, Liefervertrag, Gerücht, Crane, *ohneFracht* = keine Karte, *fracht* = Thorne, Brennan, Gemeinschaft), neu *bluff* = wie *fracht*, aber der Bot blufft bewusst: Während Thornes Prüfung schickt er zuerst alles per Bahn. Die Messung nimmt aus `bots.plans` nur, ob der Standard-Bot bei Thorne vorspricht – die Charaktere der Bots für `npm run bots` verschieben sie nicht.
- **Bluff erwischt:** erwischte ÷ riskierte Zugeständnisse beim Bluff-Bot (offene Prüfungen am Kapitelende zählen nicht); in Klammern der Standard-Bot, der den Bluff meidet, wo es sich lohnt.
- **Je Karte** (Preis-Karten aus *preis*, Fracht-Karten aus *fracht*): Anteil schlechter Ausgänge und Ø Geldeffekt je Anwendung, jeweils minus Barpreis der Karte. Geschätzt in `src/sim/cardStats.ts`:
  - *Thorne:* Tarifänderung × Bahnfracht der nächsten 8 Runden (Erfolg: Senkung; Abfuhr: sofortige Erhöhung); ein erwischter Bluff zählt mit seinem Aufschlag × Bahnfracht gegen den Besuch. Schlecht = Abfuhr oder erwischter Bluff. Die verhinderten Erhöhungen (Ruhe) zählen nicht mit – eher zu wenig als zu viel.
  - *Brennan:* (Mietfuhrwerk − Brennans Preis) × Barrel über Brennan, minus Strafen. Schlecht = in einer Runde Strafe gezahlt oder abgeworben.
  - *Gemeinschaft:* Rabatt × Bahnfracht, solange sie läuft, minus Strafen für die verfehlte Zusage. Schlecht = kommt nicht zustande oder zahlt mindestens einmal Strafe.
  - *Liefervertrag:* Mehrerlös wie `contractLoss`. Schlecht = Verlust.
  - *Gerücht:* Preisplus je Schockrunde × Verkauf der Folgerunde (Preis × (1 − 1/Schock)); entlarvt: Rückschlag ebenso, dazu Cranes Abschlag × Verkauf an Crane, solange er gilt. Schlecht = entlarvt (oder verpufft).
  - *Crane:* Cranes Abzug je Barrel vorher gegen nachher × Verkauf an Crane der nächsten 8 Runden. Schlecht = Abfuhr.
  - *Förderbremse:* wie bisher `pactValue`, schlecht = geplatzt.

## Abweichungen vom Auftrag (mit Grund)

| Auftrag / Idee | jetzt | Grund |
| --- | --- | --- |
| Abfuhr: Tarif +0,05 $ „für einige Runden“ | +0,05 $ dauerhaft (bis zur nächsten Senkung), höchstens bis maxTariff | Thornes Erhöhungen sind sonst auch dauerhaft; ein befristeter Aufschlag bräuchte neuen Zustand im Spielstand. |
| Bluff fliegt früher auf (Bahnanteil > 60 %) | > 60 % **je Runde**, aber Thorne zählt nur mit 35 % je Runde nach | Mit einer festen Prüfung hinge die Quote nur daran, ob jemand blufft (der bluffende Bot würde immer erwischt, der ehrliche nie). Die Stichprobe macht den Bluff zum Wagnis: zweimal Glück ≈ 42 %. |
| Bluff-Quote 20–60 % | gemessen am Bluff-Bot (Variante *bluff*) | Der Standard-Bot hält sich an die Grenze, wenn es sich lohnt – riskiert ist dort oft gar kein Bluff. Seine Quote steht in Klammern. |
| Gemeinschaft: Mindestmenge, wenn Mitglieder abspringen | feste Zusage 8.000 bbl je Runde (Jacobs Bahnfracht + Gemeinschaft) | Ohne neuen Zustand im Spielstand; 8.000 bbl ist zugleich das erste Druckmittel gegen Thorne. |
| Crane: größere Einsätze | Gegendruck + Laune | Mit Laune allein ging Crane fast nie schief (6 %): Große Förderer haben fast immer 3 und mehr Punkte (Marktanteil, eigene Wege, voller Tank). Der Gegendruck macht wiederholtes Feilschen zum Wagnis. |
| Brennan: Mindestmenge höher | bleibt 2.000 bbl (Fehlmenge teurer) | Mit 3.000–4.000 bbl zahlte der Standard-Bot in über 60 % der Verträge Strafe – Brennan fährt nur das, was über Bahn, Gespanne und Pipeline hinausgeht, und das schwankt stark. |
| Bots nach Charakter: gierig auch Bluff, ausgewogen auch Brennan | gierig nur Gerücht und Crane, ausgewogen Thorne und Gemeinschaft | Thorne (mit oder ohne Bluff) kostete den gierigen Bot etwa 9.000 $ Imperium (300 Seeds): Mit billiger Bahn baut er die Pipeline nicht und zahlt später, wenn Thorne wieder erhöht. Mit Brennan dazu lag der Standard-Bot bei 71,1 % Kapitelziel und 43,9 % Siegen (Grenzen 70 / 40 %); mit Thorne + Gemeinschaft (alte Gründungsregel) bei 70,7 %. |
| Spielstand-Format hochzählen | bleibt Format 22 | Kein neuer Zustand: Der längere Gerüchteschock rechnet aus der vorhandenen Runde, der Rückschlag liegt im vorhandenen Feld `rumours.shock`, Rabatt und Zusage der Gemeinschaft rechnen aus den Mitgliedern, Cranes Gegendruck aus `clearedRound`. |

## Kapitel-1-Zielwerte (npm run bots, 1.000 Partien je Strategie)

Alle 15 Zielwerte im Rahmen, keiner nachgezogen – aber zwei liegen knapp unter der Grenze (Siegquote ausgewogen 39,6 %, Kapitelziel 69,2 %). Die Unterschiede kommen fast nur von den Karten, die die Bots jetzt spielen: Der Standard-Bot gewinnt mit Thorne und Gemeinschaft, der gierige verliert durch Gerüchte und Crane etwas, der vorsichtige bleibt gleich.

| Kennzahl | vorher (0.4.20+4) | jetzt | Ziel |
| --- | ---: | ---: | --- |
| Höchste Siegquote (ausgewogen) | 35,6 % | 39,6 % | ≤ 40 % |
| Pleitequote Standard-Bot | 0,2 % | 0,3 % | ≤ 15 % |
| Pleitequote gierig | 4,5 % | 5,5 % | 3–45 % |
| Ø Imperium vorsichtig ÷ bester Mutiger | 0,81 | 0,78 | ≤ 0,95 |
| Kapitelziel Standard-Bot | 66,9 % | 69,2 % | 20–70 % |
| Ø Imperium vorsichtig / gierig / ausgewogen | 90.992 / 106.313 / 112.063 $ | 91.392 / 102.133 / 116.676 $ | – |
| Kleine Funde 50–500 bbl/Tag | 99,7 % | 99,6 % | 90–100 % |
| Gusher ÷ kleiner Fund | 5,04 | 5,03 | 2–20 |
| Gemessener Rückgang je Quartal | 12,3 % | 12,2 % | 8–15 % |
| Blinde Wildcat-Bohrung (Rand, 300 m) | 14,5 % | 14,5 % | 5–25 % |
| Ø Termine je Runde (Standard-Bot) | 5,00 | 5,00 | 4,5–5 |
| Höchster Anteil eines Transportwegs | 41,6 % | 42,0 % | ≤ 75 % |
| Pipeline in Partien mit Kapitelziel | 77,4 % | 73,1 % | ≤ 80 % |
| Ausgebaute Quellen | 27,5 % | 26,9 % | 5–70 % |
| Imperium mit ÷ ohne Ausbau | 1,20 | 1,21 | 1,02–10 |
| „alles ausbauen“ schlägt den Standard-Bot | 20,4 % | 21,1 % | ≤ 50 % |

Zwischenstände (je 1.000 Partien): gierig mit Thorne und Bluff, ausgewogen mit Thorne, Brennan und Gemeinschaft – Siegquote ausgewogen 43,9 %, Kapitelziel 71,1 %, Ø Imperium gierig 92.510 $; gierig nur Gerücht und Crane, ausgewogen Thorne und Gemeinschaft (alte Gründungsregel) – 39,6 % / 70,7 %.

## Offen

- **Knappe Zielwerte:** Siegquote ausgewogen 39,6 % und Kapitelziel 69,2 % liegen dicht an der Grenze – bei der Gesamt-Balance im Blick behalten (Hebel: Kapitelziel, Rabatt der Gemeinschaft, Thornes Senkungen).
- **„Schlecht“ bei Brennan und Gemeinschaft** heißt: mindestens einmal Strafe gezahlt. Im Schnitt bleiben auch diese Verträge im Plus bzw. bei null (Ø schlecht +3.700 $ bzw. −20 $) – richtig weh tun Abfuhr bei Thorne, entlarvtes Gerücht, Abfuhr bei Crane und der verlustreiche Liefervertrag.
- **Geldeffekte sind Schätzungen** (feste 8 Runden für Tarif- und Abschlagsänderungen, Brennan gegen das Mietfuhrwerk gerechnet). Der Imperiumsvergleich (priceGain, freightGain) ist das härtere Maß: Thorne allein bringt dem Standard-Bot dort kaum etwas (114.105 gegen 113.473 $), weil das Vorsprechen zwei Termine kostet, die sonst in Erkundung und Briefe gehen.
- **Gieriger Bot und Thorne:** Mit billiger Bahn baut der gierige Bot die Pipeline nicht (`pipelineWorth` rechnet mit dem heutigen Tarif) – ein Bot-Problem, kein Regelproblem; deshalb spricht er nicht vor.
- **Förderbremse** platzt weiter in 56 % der Pakte (Ziel 30–60 %) – unverändert gelassen.
- `bots.targets` für die Karten (`priceGain`, `freightGain`, Bluff-Quote, Anteil schlechter Ausgänge je Karte) gibt es noch nicht; die Messung hier ist die Abnahme.

## Spielstand

Unverändert Format 22 (siehe Tabelle oben: kein neuer Zustand).
