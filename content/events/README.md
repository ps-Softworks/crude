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
- Bedingungen: `minRound`, `maxRound` (Runde im laufenden Kapitel, ab Kapitelbeginn wieder 1 – 4.5), `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100),
  `minRefineryLevel` (fertige Raffinerie-Stufen), `minPipelines` (laufende eigene Leitungen: kleine Pipeline +
  fertige Fernleitungen), `minPublicShare` (Prozent der Aktien in fremder Hand, nur als Aktiengesellschaft),
  `minThomasAge`, `maxThomasAge` (Thomas' Alter in Jahren, vor der Geburt −1; 4.5),
  `minChapter`, `maxChapter` (Kapitel; ohne Angabe im Spielstand gilt Kapitel 1 – Phase 4). Für das
  ganze Ereignis gilt: Fehlt `minChapter`, ist es ein Kapitel-1-Ereignis – es kommt nur in Kapitel 1
  (bzw. bis `maxChapter`, falls angegeben). Mit `minChapter` und ohne `maxChapter` kommt es ab diesem
  Kapitel in jedem späteren. Das gilt für gewürfelte und sichere Ereignisse, Briefe und feste Termine.
  An einer Wahl prüfen `minChapter`/`maxChapter` nur, was dasteht.
  Die Ereignisse der Kapitel-2-Systeme (`k2-fernleitung`, `k2-personal`, `k2-diplomatie`, `k2-delaney`) tragen
  `minChapter: 1`: Sie hängen an Merkzeichen der Simulation und kommen so in jedem Kapitel, sobald diese gesetzt sind.
  Ereignisse für Kapitel 2 tragen `conditions: { minChapter: 2, maxChapter: 2 }` und erscheinen so nie in Kapitel 1.
  Kapitel-1-Ereignisse brauchen keine Angabe; ein paar tragen zur Klarheit trotzdem `maxChapter: 1` (Ruths Bücher,
  Pension, Fieber). Auch die festen Termine aus `k1-termine.yaml` gelten nur in Kapitel 1 – bis auf den
  Familienabend mit den Kindern (`termin_familie_k2`, `minChapter: 2, maxChapter: 2`).
  Merkzeichen gehen beim Kapitelwechsel mit (Zeitsprung, `marksIntoNextChapter`): Sie gelten als vor
  Kapitelbeginn gesetzt, `delay` zählt also ab der ersten Runde des neuen Kapitels.
- Kapitel 2 – Alltag (Phase 4, Entwurf): `k2-alltag-1` (Raffinerie, Geschäft), `-2` (Pipeline, Wegerechte,
  Fracht), `-3` (Aktionäre, Anleihen, Personal), `-4` (Rivalen: Crane-Nachfolge, Thorne, Bullard, Delgado),
  `-5` (Presse, Politik, Familie, Unglücke). Raffinerie-, Pipeline- und Aktien-Ereignisse prüfen seit der
  Integration `minRefineryLevel`, `minPipelines` und `minPublicShare` (siehe Bedingungen). Wirkungen auf
  Aktien, Rat, Ruf, Rivalen usw. sind seit 4.12 echte Systemwirkungen (siehe unten).
  Regeln für die Texte: Okara gibt es erst mit der Zeitsprung-Weiche (`okara_pachten` = Jacob
  pachtet, `okara_bullard` = Bullard bohrt dort; sonst Salt Hill/Cordova),
  Häfen liegen am Golf (Port Ellis); Bullards Söhne sind in Kapitel 2 noch Kinder (Wade 14–17, Cole 10–13);
  Ada Pell, Aufsichtsrat, Pettibone als Rat und Silas in der Firma nur mit passender Bedingung; politische
  Ausgänge (Gesetze, Wahlen) entscheidet das Weltmodell – die Texte sagen nur, wohin es sich neigt.
  Geht Greaves zu Pruett (`k2_greaves_weg`), sperren alle Greaves-Ereignisse (`notMarked`).
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft), `ruth`, `thomas`, `clara` (Beziehung 0–100, 2.7/4.5),
  `teams` (eigene Gespanne +/−), `teamsIdle` (eigene Fuhrwerke stehen bis Runde jetzt+n still; 0.2.15+2),
  befristet für `events.timedRounds` Runden (0.2.15+3): `price` ($ je Barrel beim Trust), `production`
  (Anteil der Förderung), `leaseCost` (Anteil am Pachtbonus); dasselbe Ereignis stapelt sich nicht
- Systemwirkungen (4.12, ab Kapitel 2; Regeln `src/sim/eventSystems.ts`, Zahlen `balance.yaml → eventSystems`).
  Sie stehen mit unter `effects:`, z. B. `effects: { cash: -2500, boardLoyalty: { bankier: -10 }, reputation: { workers: 5 } }`.
  Fehlt das System (Kapitel 1, Familienfirma ohne Rat, keine Raffinerie …), verpufft diese eine Wirkung.
  - `reputation: { public, politics, workers, industryRespect, industryFear, standing }` – Ruf ±n (−100…100, GDD §4).
    Öffentlichkeit hilft vor Gericht (und bei der Marke), Politik beim Druck auf Delaney, Arbeiter heben oder senken die
    Förderung, Respekt ist der Branchen-Respekt der Diplomatie, Furcht hält Rivalen von der Rache ab. Kassenbuch und
    Kapitelabschluss zeigen ihn als Wort.
  - `rival: { margaret | pruett | bullard | thorne | delgado | crane: { trust, grudge, strength } }` – Vertrauen und Groll (4.10);
    `crane` trifft vor der Nachfolge beide Erben, danach den Sieger. `strength`: Bullards Kasse (× `bullardStrength`),
    bei Margaret/Pruett ihr Anteil im Crane-Aufsichtsrat.
  - `heat: n` – neue Spur im Schattenbuch mit dem Titel des Ereignisses (Schwere n); `trace: { severity, label }` – Spur mit
    eigener Beschriftung. Negativ: die offenen Spuren verblassen um so viele Stufen. `evidence: ±n` – Delaneys Beweise (× `evidenceStep`).
  - Aktien (4.8): `boardLoyalty: { rat: ±n }` (Räte aus `content/stocks.yaml`: `bankier` = Pettibone, `witwe` = Martha Hale …,
    Gäste `silas`, `vandermeer`), `boardMember: silas | vandermeer | thorne` (zieht in den Rat; Vandermeer sitzt in der AG ab
    Kapitelbeginn), `control: ±n` (Prozentpunkte Aktien zwischen Jacob und Kleinaktionären), `rivalStake: { thorne: ±n }`
    (Strohmänner), `sharePrice: ±x` (Stimmung der Börse, zieht von selbst zurück), `dividendPressure: n`.
  - Personal (4.9): `staffLoyalty: { secretary | fixer | all: ±n }`, `hire: secretary | fixer` (erster Bewerber, ohne Termin),
    `fire: secretary | fixer`.
  - Raffinerie (4.6): `refineryDown: n` (Runden Stillstand); befristet `refineryOutput: ±x`, `productYield: { gasoline: x, … }`,
    `productPrice: { kerosene: x, … }` (Anteile; Produkte `kerosene`, `lubricant`, `fuelOil`, `gasoline`).
  - Leitungen (4.7): `pipelineDown: n` (erst eine Fernleitung, sonst die kleine Pipeline); befristet `pipelineThroughput: ±x`;
    `transportFee: ±n` – Durchleitungsgebühr in $ je Runde, solange eine eigene Leitung läuft (bis Kapitelende).
  - Welt (4.1–4.3): `mood: ±n`, `tension: ±n`, `lawPressure: { income_tax | antitrust: ±n }` (Gesetze aus `content/laws/`).
    Parteien bewegt man mit `public: [support_handel]` (siehe Öffentliches Handeln).
  - Forschung (4.11): `research: { thermal_cracking: ±n }` (Punkte; erreicht die Technik ihre Punkte, ist sie fertig).
  - Bank: `rating: ±n` (Stufen, + = besser, gilt ab der nächsten Abrechnung), `loan: n` (die Bank leiht n $ zum üblichen Zins).
  - `appointmentsNext: ±n` – Termine in der nächsten Runde; `heirValues: { thomas | clara: { business, moral, loyalty, ambition } }`
    – Werte der Erben (±, höchstens `heirMax`; lesen spätere Kapitel).
  `npm run check:content` prüft Räte, Gesetze und Techniken; `npm run check:events` bewertet die Systemwirkungen in $
  (`eventSystems.relevance`).
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
- Kapitel 3, Story-Bögen (Phase 4): `k3-story-1-daniel.yaml` (Daniel Moss als Bezirksstaatsanwalt),
  `k3-story-2-thomas.yaml` (Thomas im Unternehmen oder nicht), `k3-story-3-ehe.yaml` (Wendepunkt der Ehe),
  `k3-story-4-vale.yaml` (Mr. Vales Karte – Auftakt Bogen D, auf sie wartet Ruths zweite Probe).
  Alle mit `minChapter: 3, maxChapter: 3`; Runden zählen innerhalb des Kapitels. Gewünschte neue Wirkungen
  stehen als `# TODO-Effekt:` neben einer vorläufigen. `k3-story-3-ehe-k2.yaml` erzählt die Folgen von Ruths
  Kapitel-2-Bogen (Merkzeichen aus `k2-story-3-ruth.yaml`; Test: `src/sim/k3Story.test.ts`). ENTWURF – Philipp überarbeitet.
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
  berichtet in der nächsten Runde. Taten: `price_war` (Jacob unterbietet wirklich, erst ab Kapitel 2), `independents_stand` (gemeinsam mit
  anderen Unabhängigen gegen den Trust), `field_fire` (Feldbrand), `strike`,
  `strike_break` (Streikbrecher), `charity` (Spende für die Stadt), `support_handel`, `support_volksbund`,
  `support_provinz` (Spende/Stimmen für eine Partei), `press_praise`, `press_scandal`. Ein Tankbrand im Lager
  zählt von selbst als `field_fire`. Parteinamen und Programme: `content/politics.yaml`.
- Kapitel 2 (Phase 4): Jedes Ereignis eines späteren Kapitels trägt `minChapter`/`maxChapter`
  (z. B. `{ minChapter: 2, maxChapter: 2 }`) – in Kapitel 1 kommt es nie (Test in `src/sim/events.test.ts`).
  Story-Bögen Ruth, Silas, Nora: `k2-story-1-nora.yaml`, `k2-story-2-silas.yaml`, `k2-story-3-ruth.yaml`
  (30 Ereignisse). Ihre Wirkungen auf Rat, Ruf, Rivalen und Schattenbuch sind seit 4.12 Systemwirkungen;
  wie die Bögen ausgehen, steht in `content/arcs.yaml` (`nora_k2`, `silas_k2`, `ruth_k2`, dazu `crane_k2` aus den
  Merkzeichen der Diplomatie) – der Kapitelabschluss von Kapitel 2 zeigt nur sie. Runden zählen im Kapitel ab 1. Der Kapitelwechsel setzt alle Merkzeichen mit
  `marksIntoNextChapter` (src/sim/events.ts) auf Runde 0, damit `delay` ab Kapitelbeginn zählt.
  ENTWURF – Philipp überarbeitet.
- Kapitel 3 – Alltag (Phase 4, ENTWURF – Philipp überarbeitet): `k3-alltag-1-marke` (Marke, Tankstellen,
  Margaret Crane), `-2-boerse` (Börse, Kauf auf Kredit, Thornes Kurspflege), `-3-lobby` (Dunmore, Grady,
  Steuerabzug, Courier), `-4-seismik` (Dr. Hale, Konsortium, Ashcombe), `-5-stand` (Club, Kirche, Ball,
  Stiftung), `-6-rivalen` (Bullard verschuldet, Thorne, Pruett), `-7-krise` (volle Tanks, Zinsen,
  Flugblätter, Bankrun), `-8-familie` (Haskell, Silberhochzeit, Thomas, Clara, Silas) – 59 Ereignisse.
  Alle mit `conditions: { minChapter: 3, maxChapter: 3 }`; kommen also nie in Kapitel 1 und ändern dort
  auch keinen Wurf (gemischt werden nur Ereignisse des laufenden Kapitels). Umgekehrt kommen die
  Kapitel-1-Ereignisse (ohne `minChapter`) nach dem Zeitsprung nicht mehr – auch nicht als Brief oder
  fester Termin; Kapitel 3 braucht also eigene feste Termine (Abend mit Ruth usw.), falls gewünscht. Wirkungen, die es noch nicht
  gibt (Marke, Aktien, Ruf, Stand, Clara …), stehen als `# TODO-Effekt: …` neben einer Ersatzwirkung.
  Offen für den Zeitsprung (Block A): Er muss `chapter` im Spielstand setzen und beim Kapitelwechsel
  `marksIntoNextChapter` aufrufen, damit `delay` bei Merkzeichen früherer Kapitel ab Kapitelbeginn zählt.
