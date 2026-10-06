# Bots für die Systeme von Kapitel 2 und 3 – Plan (Sitzung „bot runner“, 06.10.2026)

Ziel: Die Kampagnen-Bots (src/sim/campaignBots.ts, botsKapitel3.ts) nutzen jedes System, das Kapitel 2/3
anbietet, nach ihrem Charakter – damit die Platzhalter-Zahlen in content/balance.yaml gemessen statt geraten sind.
Alle Systeme rechnet `endRound` schon selbst weiter; die Bots müssen nur die Aktionen aufrufen.

## Ablauf je Runde (Kapitel 2/3)
`playChapter`: botTurn (Briefe) → botChapterSystems (Raffinerie/Marke) → botFeldzug → stocksTurn → bondsTurn →
exchangeTurn → endRound. Neue Züge kommen als `xxxTurn(state, balance, policy)` vor endRound; Einstellungen je
Strategie in `bots.campaign.<strategie>` (balance.yaml, `parseCampaignPolicy`).

## Regeln je System (Entwurf)

| System | Aktion | Bewertung | vorsichtig | gierig | ausgewogen | betrügerisch |
| --- | --- | --- | --- | --- | --- | --- |
| Raffinerie-Betrieb | `setRefineryMix`, `setRefineryIntake`, `expandRefinery` | `planRun` (Gitter 2 %), `crudeVsRefined` | Mix optimieren, kein Ausbau | Ausbau, wenn `planRun` Stufe+1 > Kosten/Restrunden | Mix + Ausbau mit Abstand | wie ausgewogen |
| Fernleitung zum Hafen | `planRoute` → `surveyRoute` → `askRight` → `startConstruction`, Wachen | Ersparnis = Menge × (Tarif − 0,03) − Kosten; Amortisation | ab 8 Runden | ab 12 Runden, Rechte „niedrig“ | ab 10, „fair“ | Enteignung über Gefallen |
| Personal | `hireStaff`, `setWageLevel`, `recognizeStaff`, `orderFixer` | `extraAppointments`, `fixerDefense`, Hitze | Sekretärin | Sekretärin + Fixer zur Abwehr | Sekretärin | Fixer mit Spionage/Sabotage |
| Diplomatie | `proposePact`, `answerOffer`, `joinGuild`, `buyFirm` | Prämie × Barrel × 6; `wouldAccept` | Gilde, Liefer-/Gebietspakt | Firmenkauf, wenn Amortisation < Restrunden | Pakte nach Wert | Preisabsprache trotz Spur |
| Forschung | `buildWorkshop`, `startResearch`, `buyLicense` | Kosten bis Patent vs. Lizenz (`techViews`) | Lizenz | forschen auf Stufe 1 | forschen, wenn Patent möglich | wie ausgewogen |
| Ermittlung (Abwehr) | `setLawyer`, `destroyTrace`, `buyWitness`, `applyPressure` | `convictionChance`, `fineFor`, Haft ab Hitze 16 | Anwalt ab Vorermittlung | nichts | Anwalt ab Anklage | alles, Zeugen kaufen, Druck |
| Hallstead | `buyHolding`, `hireLobbyist`, `bribe` | Rendite vs. Kasse; Gefallen | Land/Bank | Auto/Bahn | gemischt, klein | Lobbyist, Bestechung |
| Konsortium/Projekte/Stand/Seismik | `answerInvitation`, `answerFavor`, `joinProject`, `donate`, `orderSurvey` | Amortisation der Projekte, Mitgliedschaft | annehmen, erfüllen | Projekte 50 % | annehmen, Projekte 25 % | ausspielen, vortäuschen |

Kennzahlen je System in docs/botlaeufe.md (Abschnitt Kapitel 2 und 3): Nutzung (Anteil Kampagnen), Kosten,
Ertrag bis Kapitelende, Amortisation; dazu Gegenproben „nie“/„immer“ je System (Muster `runInvestVariant`).

## Auffällig schon ohne Lauf (Platzhalter, bitte messen – für den Builder notiert)
- Sekretärin: 120 $/Runde für +1–2 Termine – immer richtig, keine Entscheidung.
- Konsortium: Mitgliedschaft ≈ +6.000 $/Runde netto, praktisch geschenkt.
- Konsortialprojekte zählen im Imperiumswert mit 100 % des Gezahlten und werden nie abgeschrieben (`projectsValue`).
- Raffinerie: Bots nutzen den absichtlich schlechten Start-Mix → Amortisation ~30 Runden statt ~10.
- Hallstead-Beteiligungen: Amortisation nur aus Rendite Land ~83, Auto ~250 Runden, Zeitung nie.
- Ermittlung: Gegenmittel (Anwalt 150 $/Stufe, Spur vernichten 1.500 $) sind auf Kapitel 1 bemessen – in Kapitel 3 spottbillig.
- Forschung: Drehbohren hat `worldAt` 10, die Welt steht zu Kapitel 2 schon auf ~12 – nur Lizenz, nie Patent.
- Firmenkauf: ~18 Runden Amortisation – länger als ein Kapitel.

## Reihenfolge
1. Betrügerischer Bot (läuft) zusammenführen, volle Kampagne, Kapitelziel 2 nachjustieren.
2. Beobachter-Haken in `playCampaign` (je Runde/Kapitel), Messungen: Zeitsprung II, Crash-Abschlag Marke (offene Frage 12).
3. Systeme einzeln: Raffinerie-Betrieb → Personal → Forschung → Konsortium/Projekte → Fernleitung → Diplomatie →
   Hallstead → Ermittlungs-Abwehr. Je System: Regel + Test, Lauf auf dem PC, Kennzahl + Gegenprobe, Zahlen justieren.
