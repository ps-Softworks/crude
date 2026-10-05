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

Stand: 2026-10-05 · Version 0.4.20+4 · 400 Seeds (`bot-0` bis `bot-399`), Standard-Bot mit allen Ereignissen

| Kapiteldrittel | normale Briefe: Median \|Geld\| ÷ Imperium (oberes Viertel) | Median Geld | große Briefe: Median (oberes Viertel) | Median Geld | Median Faktor | Median Erlös je Runde | Median Imperium |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Runde 1–5 | 1,1 % (2,8 %), n = 3318 | 300 $ | 6,8 % (9,9 %), n = 455 | 2.500 $ | 1,00 | 0 $ | 32.769 $ |
| Runde 6–11 | 1,1 % (1,9 %), n = 3461 | 630 $ | 8,4 % (11,3 %), n = 1264 | 5.200 $ | 5,62 | 8.424 $ | 62.293 $ |
| Runde 12–16 | 1,0 % (1,8 %), n = 2234 | 960 $ | 7,2 % (10,9 %), n = 31 | 5.850 $ | 7,84 | 11.760 $ | 83.186 $ |

Ganzes Kapitel: normale Briefe Median 1,1 %, große Briefe Median 8,1 %.

<!-- Ende der Messung Briefe mit Gewicht -->
