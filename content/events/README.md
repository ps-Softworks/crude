# Ereignisse

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen und kommt automatisch ins Spiel –
ohne Codeänderung. Prüfen: `npm run check:content` (meldet Fehler mit Datei und Zeile).

- Anleitung zum Schreiben: `docs/ereignis-vorlage.md`
- Kommentiertes Beispiel zum Kopieren: `docs/ereignis-beispiel.yaml`

Kurzreferenz der Felder:
- Ereignis: `id`, `title`, `text`, `conditions`, `marked`, `notMarked`, `delay`, `chance`, `once`,
  `routine`, `appointments`, `mail`, `deadline`, `document`, `certain`, `rival`, `cooldown`, `group`,
  `draft`, `ranch`, `visitor`, `tableau`, `choices`
- Wahl: `id`, `label`, `result`, `requires`, `effects`, `marks`, `default`, `appointments`,
  `requiresFound`, `marksIfForged`, `sharp`, `unlocks`
- Karte (0.2.15+5): `ranch: moss` sagt, um wessen Ranch es geht (Figuren unter `figures` in
  `content/map.yaml` – jede Figur bekommt dort eine echte Ranch). `unlocks: [hollins]` an einer Wahl
  schaltet ein gesperrtes Gebiet aus `content/map.yaml` frei; seine Ranches entstehen dann aus dem Seed.
- Bedingungen: `minRound`, `maxRound`, `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100)
- Kapitel (Phase 4): `minChapter`, `maxChapter` – ein Spielstand ohne Kapitelangabe ist in Kapitel 1.
  Ereignisse ohne Kapitel-Bedingung kommen in jedem Kapitel; Ereignisse für Kapitel 2 tragen
  `conditions: { minChapter: 2, maxChapter: 2 }` und erscheinen so nie in Kapitel 1.
- Kapitel 2 – Alltag (Phase 4, Entwurf): `k2-alltag-1` (Raffinerie, Geschäft), `-2` (Pipeline, Wegerechte,
  Fracht), `-3` (Aktionäre, Anleihen, Personal), `-4` (Rivalen: Crane-Nachfolge, Thorne, Bullard, Delgado),
  `-5` (Presse, Politik, Familie, Unglücke). Fehlende Bedingungen (`hasRefinery`, `hasPipeline`, `ipo`) und
  Wirkungen (Aktien, Rat, Ruf, Rivalen …) stehen als `# TODO-Bedingung` / `# TODO-Effekt` neben den Ereignissen.
  Regeln für die Texte: Okara gibt es erst mit der Zeitsprung-Weiche `zs1_okara` (sonst Salt Hill/Cordova),
  Häfen liegen am Golf (Port Ellis); Bullards Söhne sind in Kapitel 2 noch Kinder (Wade 14–17, Cole 10–13);
  Ada Pell, Aufsichtsrat, Pettibone als Rat und Silas in der Firma nur mit passender Bedingung; politische
  Ausgänge (Gesetze, Wahlen) entscheidet das Weltmodell – die Texte sagen nur, wohin es sich neigt.
  Geht Greaves zu Pruett (`k2_greaves_weg`), sperren alle Greaves-Ereignisse (`notMarked`).
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft), `ruth`, `thomas` (Beziehung 0–100, 2.7),
  `teams` (eigene Gespanne +/−), `teamsIdle` (eigene Fuhrwerke stehen bis Runde jetzt+n still; 0.2.15+2),
  befristet für `events.timedRounds` Runden (0.2.15+3): `price` ($ je Barrel beim Trust), `production`
  (Anteil der Förderung), `leaseCost` (Anteil am Pachtbonus); dasselbe Ereignis stapelt sich nicht
- Termine (2.3): `appointments` = Termine, die eine Antwort kostet (Standard 1; an einer Wahl
  überschreibt es den Wert des Ereignisses, z. B. `appointments: 0` für „abwinken“).
  Bleibt ein Ereignis liegen, gilt die Standard-Wahl und kostet keine Termine.
- Feste Termine: `routine: true` – nicht gewürfelt (`chance` darf fehlen), stehen jede Runde im
  Terminkalender, solange die Bedingungen stimmen; einmal je Runde; liegen lassen hat keine Folgen.
  Beispiele: `k1-termine.yaml`.
- Posteingang (2.4): `mail: offer | demand | info | personal` macht ein Ereignis zum Brief
  (Angebot, Forderung, Information, Persönliches). Briefe kommen zusätzlich mit der Post
  (`events.mail.maxPerRound`), bleiben `deadline` Runden liegen (Standard `events.mail.deadlineRounds`),
  in der letzten Runde mit rotem Siegel, danach gilt die Standard-Wahl. Kam von einer Art
  `events.mail.guaranteeRounds` Runden keiner, bringt die Post sicher einen – darum braucht jede
  Art einen Alltagsbrief ohne Bedingungen mit `once: false`. Beispiele: `k1-post.yaml`.
- Dokumentenprüfung (2.5): `document` mit `title`, `reference`, `forgeryChance` (optional) und
  `fields` (`id`, `label`, `value`, `reference`, `forged`). Beim Eintreffen wird gewürfelt, ob ein
  Feld mit `forged` gefälscht ist (`events.documents.forgeryChance`); die Lupe prüft bis zu
  `events.documents.maxChecks` Felder. Wahl mit `requiresFound: true` geht nur nach gefundener
  Fälschung; `marksIfForged` setzt Merkzeichen nur bei einer Fälschung (die teure Folge).
  Beispiele: `k1-dokumente.yaml`.
- Familie und Kraft (2.7): Eine Wahl mit `ruth` oder `thomas` > 0 ist Familienzeit – sie gibt am
  Rundenende Kraft (+3 bis +8 je nach Beziehung, `family` in balance.yaml); eine Runde ohne
  Familienzeit kostet Beziehung. Die Simulation setzt zur Geburt das Merkzeichen `thomas_geboren`
  (mit `delay: 0` reagiert ein Ereignis noch in derselben Runde). `sharp: true` markiert eine beste
  Antwort: Sie fehlt, solange Jacob erschöpft ist (`agenda.errorsBelow`). Zustandswörter und Sätze
  des Familienbildschirms stehen in `content/family.yaml`. Beispiele: `k1-0-thomas-geburt.yaml`,
  `k1-7-arzt.yaml`, `k1-termine.yaml`.
- Rivalen (2.8): `certain: true` – kommt sicher, sobald Bedingungen und Merkzeichen stimmen (kein
  Würfel, `chance` darf fehlen, zählt nicht gegen `maxPerRound`). `rival: crane | thorne | bullard`
  sagt, wer dahintersteckt. Einige Merkzeichen liest die Simulation selbst (Crane-Abschlag,
  Thorne-Frachtvertrag, Bullards Handschlag/Fehde, Verkauf an Crane) – Liste oben in
  `k1-rivalen.yaml`, Namen nicht ändern. `bullard_verraten` setzt die Simulation.
- Story-Bögen (2.9): Silas (`k1-2-silas.yaml`) und Moss (`k1-3-moss.yaml`) kommen in jeder Partie
  (`certain: true`). Wie ein Bogen ausgeht, steht in `content/arcs.yaml`: Ausgänge mit den
  Merkzeichen, an denen man sie erkennt (`any`), erster passender gilt. Der Kapitelabschluss zeigt
  „Was aus ihnen wurde“. Alles Entwurf – Philipp überarbeitet.
- Wiederholungsschutz (2.10a): `once: false` darf wiederkommen, frühestens nach `cooldown` Runden
  (fehlt er: `events.repeatCooldown` in balance.yaml; `cooldown: 0` = kein Schutz). `group: name`
  macht Varianten eines wiederkehrenden Ereignisses (z. B. drei Bohrpannen): Nach einer Variante kommt
  keine aus derselben Gruppe, bis der Abstand um ist. `draft: true` markiert eine Schlüsselszene als
  Entwurf – ändert nichts am Spiel, `npm run check:content` listet sie auf.
- Alltag (2.10a): `k1-8-alltag-1.yaml` (Bohrstelle), `-2` (Geschäft), `-3` (Menschen) – je 10 Ereignisse.
- Alltag (2.10b): `-4` (Rivalen und Bank, 13), `-5` (Arbeiter und Unglücke, 13), `-6` (Familie, Presse,
  Politik in Cordova, 11) – zusammen 67 Alltagsereignisse. Viele greifen Merkzeichen aus Teil 1 auf
  (Kerrigan, Eli, Sheriff, Nora, Ruths Bücher); die Liste steht oben in jeder Datei.
- Gewürfelt wird in zufälliger Reihenfolge (seit 2.10b – vorher hatten Dateien vorn im Alphabet
  Vorrang), höchstens `events.maxPerRound` (balance.yaml) neue je Runde. Was sicher kommen muss,
  bekommt `certain: true` (z. B. die Geburt von Thomas).
- Transport (0.2.15+2): `k1-9-transport.yaml` – Streik/Bestechung eigener Fuhrleute, Wegerechte für die
  Pipeline. Merkzeichen der Simulation: `fuhrleute_eigen`, `pipeline_geplant`, `pipeline_gebaut`, `haendler_kunde`.
- Wirkung (0.2.15+3): `npm run check:events` (`-- --alle` für alle) bewertet jede Antwort und meldet
  schwache: Wirkung unter 2 % des Kapitel-Gelds (balance.yaml `events.relevance`, 200 $), keine dauerhafte
  Folge, kein Merkzeichen, das später etwas abfragt. Eine einzelne schwache Antwort neben einer starken
  ist das „Gegenstück“ und erlaubt. Merkzeichen für spätere Kapitel: `content/relevance.yaml` (mit Grund).
  Neue Folgen früher folgenloser Merkzeichen: `bullard_rache_folge`, `kerrigan_zusammenbruch`,
  `wegerecht_moss_versoehnt`; Schutz durch `notMarked` (Diebe, Seil, Streik, Lohn, Schlamm, Lager).
- Auftritt (0.2.15+10): `visitor: silas` – das Ereignis kommt als Besuch an Jacobs Schreibtisch (Person
  klopft, tritt ein, redet); die Figur braucht in `content/figures.yaml` einen Namen
  (`silas: { form: muetze, name: Silas }`). `tableau: true` – kommt als Vollbild-Szene (Geburt, Brand,
  Blitz, Sturm). Nicht für Briefe (`mail`) und feste Termine (`routine`); ohne Auftritt hängt ein
  Ereignis als Vorfall am Notizspieß. Reine Darstellung, ändert keine Regel. Besetzt sind die Bögen von
  Silas, Moss und Ruth, dazu Arzt, Nora, Bullard, Fuhrleute, Sheriff und Prediger.
  Nur wer wirklich ins Büro kommt, bekommt `visitor` (0.2.15+11): Spielt der Text woanders (Saloon,
  Bahnsteig, Veranda, Bohrturm, Bank), bleibt das Ereignis ein Vorfall – sonst widerspricht die Szene
  „Besuch · Silas“ dem eigenen Text. ENTWURF: Philipp segnet die Besetzung ab.
- Öffentliches Handeln (4.2): `public: [field_fire]` an einer Wahl – darüber redet das Land. Am Rundenende
  verschiebt die Tat die Stimmung und die Parteien (Zahlen in balance.yaml, `worldModel.acts`), die Zeitung
  berichtet in der nächsten Runde. Taten: `price_war` (Preiskampf), `field_fire` (Feldbrand), `strike`,
  `strike_break` (Streikbrecher), `charity` (Spende für die Stadt), `support_handel`, `support_volksbund`,
  `support_provinz` (Spende/Stimmen für eine Partei), `press_praise`, `press_scandal`. Ein Tankbrand im Lager
  zählt von selbst als `field_fire`. Parteinamen und Programme: `content/politics.yaml`.
- Kapitel 2 (Phase 4): Jedes Ereignis eines späteren Kapitels trägt `minChapter`/`maxChapter`
  (z. B. `{ minChapter: 2, maxChapter: 2 }`) – in Kapitel 1 kommt es nie (Test in `src/sim/events.test.ts`).
  Story-Bögen Ruth, Silas, Nora: `k2-story-1-nora.yaml`, `k2-story-2-silas.yaml`, `k2-story-3-ruth.yaml`
  (30 Ereignisse). Gewünschte neue Wirkungen stehen dort als Kommentar `# TODO-Effekt: …` neben einer
  vorläufigen. Runden zählen im Kapitel ab 1. Der Kapitelwechsel setzt alle Merkzeichen mit
  `marksIntoNextChapter` (src/sim/events.ts) auf Runde 0, damit `delay` ab Kapitelbeginn zählt.
  ENTWURF – Philipp überarbeitet.
