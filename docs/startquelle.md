# Startquelle (0.4.20+25)

Die erste Startoption liegt auf einer Ranch mit **sicherem Öl in 300 m**: eigene kleine Lagerstätte
(`lease.startOptions.sureReserves`), erstes Loch ohne Unfall und Klemmen, Prognose „Öl sicher“, der Einstieg
rät zuerst zu ihr (Hinweis `lease_sure`) und schickt Jacob übers Land, während der Turm bohrt (`explore_wait`).
Die zweite Startoption bleibt Zufall.

## Frage

Wie viel Öl braucht die Startquelle für einen sauberen Anfang? Maßstab (Philipp): Sie soll mindestens reichen,
bis eine weitere Quelle Öl bringt, und sich selbst lohnen.

## Was die Messung gezeigt hat

1. **Die Dauer hängt nicht an der Menge.** Die Anfangsrate einer Quelle ist ein Anteil ihres Vorrats; mit 9 %
   Rückgang je Runde leert sich jede Quelle in etwa gleich vielen Runden. Vorher hing die Rate zusätzlich an der
   Ranchgröße: Auf einer kleinen Ranch waren 20.000 bbl nach 4 Runden weg, auf einer großen hielten sie das ganze
   Kapitel. Darum fördert die Startquelle jetzt mit fester Rate `sureRateShare` 0,13 × Vorrat je Runde – ein Loch
   trägt so etwa 13 Runden, länger als selbst langsame Spieler bis zur zweiten Quelle brauchen (90 % bis Runde 7–9).
2. **Die Menge bestimmt das Geld je Runde** – und damit, ob man aus eigener Kasse eine zweite Quelle findet.
   Der Einsteiger (folgt den Hinweisen, sucht danach nur mit eigenem Geld, kein Kredit, ein Loch nach dem anderen)
   findet eine zweite Quelle in 60 % (6.000 bbl), 85 % (15.000), 91 % (25.000) und 93 % (40.000) der Partien.
   Ab etwa 25.000 bbl bringt mehr Öl kaum noch etwas.
3. **Gewählt: 25.000 bbl.** Die Startquelle trägt bis zur zweiten Quelle (100 % beim Einsteiger), lohnt sich immer
   (Median 9.100 $ Gewinn nach Bohrkosten, Fracht und Förderzins), niemand geht pleite. Die Bots erreichen das
   Kapitelziel etwas seltener als mit der alten „guten Option“, die oft mitten in einem großen Feld lag.

## Messung

`npx tsx tools/startquelle.ts 100 6000,10000,15000,20000,25000,30000,40000` – je Menge 100 Partien Kapitel 1 mit
Ereignissen, Seeds `bot-0` … `bot-99`. „alle Bots“ = vorsichtig, ausgewogen, gierig, betrügerisch zusammen.

- **fördert bis Runde:** letzte Runde, in der die Startquelle noch förderte (Median).
- **reicht bis 2. Quelle:** Die Startquelle war zuerst da und fördert noch, wenn eine Quelle auf einer anderen Ranch fündig wird.
- **lohnt sich:** Erlös der Startquelle (Bahnpreis nach Fracht und Förderzins) minus ihre Bohrkosten > 0.
- Die Bots bohren oft mehrere Löcher auf die sichere Ranch und leeren sie so schneller – die Menge bleibt dieselbe.

| Menge (bbl) | Bot | Anfangsrate | Startquelle fördert bis Runde (Median) | 2. Quelle: Anteil, Runde Median / 90 % | reicht bis 2. Quelle | ohne 2. Quelle: fördert noch am Ende | lohnt sich (Median Gewinn) | Pleite | Kapitelziel |
|---|---|---|---|---|---|---|---|---|---|
| 6.000 | einsteiger | 780 | 13 | 60 %, R 4 / 7 | 100 % | 0 % | 100 % (1.563 $) | 0 % | 2 % |
| 6.000 | **alle Bots** | 780 | 14 | 71 %, R 4 / 8 | 98 % | 0 % | 99 % (2.145 $) | 4 % | 38 % |
| 10.000 | einsteiger | 1.300 | 13 | 75 %, R 4 / 7 | 100 % | 0 % | 100 % (3.117 $) | 0 % | 2 % |
| 10.000 | **alle Bots** | 1.300 | 13 | 82 %, R 4 / 8 | 99 % | 3 % | 100 % (4.377 $) | 4 % | 45 % |
| 15.000 | einsteiger | 1.950 | 13 | 85 %, R 4 / 7 | 99 % | 0 % | 100 % (5.127 $) | 0 % | 4 % |
| 15.000 | **alle Bots** | 1.950 | 13 | 85 %, R 4 / 8 | 98 % | 0 % | 100 % (7.175 $) | 4 % | 50 % |
| 20.000 | einsteiger | 2.600 | 13 | 88 %, R 4 / 8 | 100 % | 0 % | 100 % (7.195 $) | 0 % | 6 % |
| 20.000 | **alle Bots** | 2.600 | 13 | 89 %, R 4 / 8 | 97 % | 2 % | 100 % (9.916 $) | 4 % | 51 % |
| 25.000 | einsteiger | 3.250 | 13 | 91 %, R 4 / 7 | 100 % | 0 % | 100 % (9.133 $) | 0 % | 7 % |
| 25.000 | **alle Bots** | 3.250 | 13 | 91 %, R 4 / 8 | 96 % | 3 % | 100 % (12.080 $) | 3 % | 56 % |
| 30.000 | einsteiger | 3.900 | 13 | 91 %, R 4 / 7 | 100 % | 0 % | 100 % (10.967 $) | 0 % | 9 % |
| 30.000 | **alle Bots** | 3.900 | 13 | 91 %, R 4 / 8 | 96 % | 0 % | 100 % (15.012 $) | 4 % | 56 % |
| 40.000 | einsteiger | 5.200 | 13 | 93 %, R 4 / 7 | 100 % | 0 % | 100 % (14.508 $) | 0 % | 6 % |
| 40.000 | **alle Bots** | 5.200 | 13 | 95 %, R 4 / 9 | 95 % | 0 % | 100 % (20.064 $) | 2 % | 60 % |
