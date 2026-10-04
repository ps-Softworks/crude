# Story-Bibel Kapitel 2 und 3 – CRUDE

> **Entwurf – Philipp überarbeitet.** Zusammengestellt von Claude (04.10.2026) aus GDD §9.2, §10–§14,
> der Weltbibel und den Kapitel-1-Ereignissen in `content/events/`. Alles, was über GDD und Weltbibel
> hinausgeht (Alter, neue Namen, Szenen, Merkzeichen-Namen), ist ein **Vorschlag** und mit *(V)* markiert.
> Die Bibel ist Arbeitsgrundlage für die Schreiber der Ereignisse `k2-*.yaml` und `k3-*.yaml`
> und Wunschzettel für die Integration der neuen Systeme.

**Ton.** Ernst, wie *Sir Brante*: kurze Sätze, trockene Beobachtung, keine Moralanzeige. Folgen kommen
oft spät und von Menschen, nicht von Zahlen. Zehn Jahre sind vergangen – das soll man spüren: an
grauem Haar, an Häusern, die größer geworden sind, an Menschen, die nicht mehr da sind, und an
Sätzen, die jemand seit Kapitel 1 mit sich herumträgt. Jacob ist weder Held noch Schurke; jede Antwort
muss für irgendwen vernünftig sein. Ungerechtigkeit (Stand, Ausbeutung, Gewalt) wird gezeigt, nie belohnt.

---

## Inhalt

1. Zeitrechnung und Altersübersicht
2. Was zwischen den Kapiteln geschieht (Zeitsprung I und II)
3. Figuren-Ensemble (bestehende Figuren, gealtert)
4. Neue Figuren (sparsam)
5. Der Aufsichtsrat (Ensemble für das Aktien-System)
6. Story-Bögen Kapitel 2 – Der Herausforderer
7. Story-Bögen Kapitel 3 – Der Konzernherr
8. Anknüpfungen: Kapitel-1-Merkzeichen und wo sie zurückkommen
9. Themen für Alltagsereignisse je Kapitel
10. Wunschliste: neue Effekt-Arten, Bedingungen und Darstellung
11. Konventionen für die Schreiber
12. Offene Fragen an Philipp

---

## 1. Zeitrechnung und Altersübersicht

Jahr 1 = Frühjahr 88 der Föderation. Ein Kapitel hat 16 Runden (Quartale).

| | Kapitel 1 | Kapitel 2 | Kapitel 3 |
|---|---|---|---|
| Spieljahre | 1–4 (88–91 d. F.) | 11–14 (98–101 d. F.) | 21–24 (108–111 d. F.) |
| Jacob Harlan | 25–28 | 35–38 | 45–48 |
| Ruth Harlan *(V: bei Spielbeginn 23)* | 23–26 | 33–36 | 43–46 |
| Thomas Harlan (geboren Jahr 1, Runde 3) | 0–3 | 10–13 | 20–23 |
| Clara Harlan *(V: geboren Jahr 6)* | – | 5–8 | 15–18 |
| Silas Brandt *(V: bei Spielbeginn 44)* | 44–47 | 54–57 | 64–67 |
| Ezekiel Moss *(V: 46)* | 46–49 | 56–59 | 66–69 |
| Daniel Moss *(V: 15; geht mit 18/19 nach Hallstead)* | 15–18 | 25–28 | 35–38 |
| Nora Whitlock *(V: 22)* | 22–25 | 32–35 | 42–45 |
| „Big“ Jim Bullard *(V: 36)* | 36–39 | 46–49 | 56–59 |
| Cornelius Crane *(V: 66)* | 66–69 | 76–79 (stirbt oder tritt ab) | † oder Greis |
| Margaret Crane *(V: Cornelius' Tochter, 31)* | 31–34 | 41–44 | 51–54 |
| Harold Pruett *(V: 42)* | 42–45 | 52–55 | 62–65 |
| Augustus Thorne *(V: 52)* | 52–55 | 62–65 | 72–75 |
| Rosa Delgado *(V: 29)* | 29–32 | 39–42 | 49–52 |
| Frank Delaney *(V: 32)* | – | 42–45 | 52–55 |
| Mr. Vale | „irgendwo zwischen vierzig und sechzig“ – in jedem Kapitel gleich alt. Niemand bemerkt das laut. |||

Kraft-Maximum (GDD §4): Kapitel 2 = 90, Kapitel 3 = 80. Jacob ist spürbar langsamer; Ruth und der
Arzt merken es vor ihm.

---

## 2. Was zwischen den Kapiteln geschieht

Die Zeitsprünge baut Block A (Weltmodell, Zeitsprung). Für die Schreiber zählt: **Was im Zeitsprung
passiert ist, kennt Jacob – der Spieler erfährt es aus einer kurzen Chronik und aus den ersten
Ereignissen des Kapitels.** Ein Kapitel beginnt nie mit „Zehn Jahre später“ als Wand, sondern mit einer
Person, die etwas erzählt, was sich verändert hat.

### Zeitsprung I (Jahr 5–10) → Kapitel 2

Fest: Geburt von Clara *(V: Jahr 6)*. Harlan Oil wird – falls am Kapitelende 1 gewählt – Aktiengesellschaft.

Mögliche Weichen (GDD §13), je als Merkzeichen für Kapitel 2 *(V: Namen)*:

| Weiche | Merkzeichen | Was die Schreiber daraus machen |
|---|---|---|
| Bankenpanik (wenn Kreditklima überhitzt) | `zs1_bankpanik` | Pettibones Filiale hat geschlossen und wieder geöffnet; Leute erinnern sich, wer sein Geld abhob. |
| Erste Automobile, früh auf Benzin gesetzt | `zs1_benzin_frueh` | Thomas will in ein Automobil steigen; Margaret Crane hat es auch gemerkt. |
| Neues Ölgebiet in Okara | `okara_bullard` (Bullard pachtet) bzw. `okara_pachten` (Jacob) | Bullard bohrt dort; Delgados Verband wächst über Cordova hinaus. |
| Jacob hat im Zeitsprung keinen Kredit bedient / Firma knapp | `zs1_knapp` | Kapitel 2 beginnt mit einer Mahnung statt mit einem Empfang. |

Dazu kommt das Ergebnis des Börsengangs (Anteil verkauft) aus dem Kapitelende 1 – das liest die
Simulation (Kontrolle), die Ereignisse brauchen dafür eine Bedingung (siehe §10).

### Zeitsprung II (Jahr 15–20) → Kapitel 3

Mögliche Weichen (GDD §13):

| Weiche | Merkzeichen *(V)* | Was die Schreiber daraus machen |
|---|---|---|
| Kriegsgefahr in Übersee, Export trotz Risiko | `zs2_export_krieg` | Ein Tanker kam nicht zurück; eine Witwe in Port Ellis weiß, wessen Öl er trug. |
| Heizölvertrag mit der Marine | `zs2_marine_vertrag` | Ein Admiral schreibt Weihnachtskarten; der Vertrag läuft in Kapitel 3 aus. |
| Grady bietet Beteiligung an Pachten auf staatlichem Reserveland | `zs2_grady_reserveland` / `zs2_grady_abgelehnt` | **Skandal-Saat:** Daniel Moss oder Nora finden es in Kapitel 3 – oder erst in Kapitel 4. |
| Thomas geht aufs College | `zs2_thomas_college` (fast immer) / `zs2_thomas_kein_college` | Thomas kommt in Kapitel 3 mit Ideen zurück, die nicht Jacobs sind. |

---

## 3. Figuren-Ensemble (bestehende Figuren, gealtert)

Je Figur: Lage, **Ziel**, **Konflikt**, **Stimme** (mit Beispielsatz) für Kapitel 2 und 3, dazu die
Varianten nach Kapitel-1-Merkzeichen. Besucher-Schlüssel (`visitor:`) wie in `content/figures.yaml`;
fehlende Schlüssel stehen in §10.

### Jacob Harlan (Spielfigur)

- **Kapitel 2 (35–38):** Er hat etwas, das ihm niemand mehr so leicht nehmen kann – und merkt, dass
  man es ihm trotzdem nehmen kann: über Aktien, Gerichte und Zeitungen. Er ist kein Bohrarbeiter mehr,
  aber in Hallstead hält man ihn noch für einen. Sein Groll gegen die alten Familien ist ein Werkzeug
  geworden.
- **Kapitel 3 (45–48):** Er ist der Mann, vor dem er selbst einmal gewarnt hätte. Die Frage ist nicht
  mehr „schaffe ich es?“, sondern „was kostet es, es zu behalten?“ – und wer am Tisch noch mit ihm redet.
- **Für die Schreiber:** Jacob spricht in Antworten wenig. Er wird in Kapitel 2 höflicher, in
  Kapitel 3 knapper. Seine Herkunft blitzt auf, wenn er müde ist (Kraft niedrig): ein Grubenwort, eine
  Geste mit den Händen.

### Ruth Harlan – Ehefrau (`visitor: ruth`)

- **Kapitel 2 (33–36): „Ruths Wunsch mitzuarbeiten“.** Clara ist klein, Thomas geht zur Schule, das
  Haus ist groß geworden. Ruth hat zehn Jahre lang gerechnet – in Kapitel 1 am Küchentisch, im
  Zeitsprung je nach Weg in den Büchern der Firma oder gar nicht mehr.
  - **Ziel:** einen Platz mit eigener Stimme: Sitz im Aufsichtsrat oder die Finanzen, offiziell, mit Titel.
  - **Konflikt:** Hallstead lacht über Frauen in Aufsichtsräten; Pettibone und der Vandermeer-Neffe
    wollen sie nicht. Jacob braucht ihre Stimme für die Kontrolle – oder fürchtet sie.
  - **Stimme:** genau, ruhig, Zahlen statt Gefühle. Wenn sie verletzt ist, wird sie noch genauer.
    *„Ich habe das Datum aufgeschrieben, Jacob. Du hast gesagt: wenn die zweite Quelle fließt. Es sind
    jetzt einundvierzig.“*
- **Kapitel 3 (43–46): „Wendepunkt der Ehe“.** Je nach Kapitel 2 ist sie die stärkste Partnerin im
  Konzern, eine Frau mit eigenem Geschäft – oder eine Fremde im eigenen Haus.
  - **Ziel:** nicht in einem großen Haus zu verschwinden; am Ende entscheiden, ob sie bleibt.
  - **Konflikt:** Die Gesellschaft von Hallstead (Vandermeer) nimmt sie entweder auf oder führt sie
    vor. Mr. Vales Einladung legt die Ehe auf den Tisch: Unterschreibt Jacob für das Kartell, ohne sie
    zu fragen?
  - **Stimme:** älter, sparsamer. *„Ich frage nicht, ob du es tust. Ich frage, ob du mich gefragt hättest.“*
- **Varianten aus Kapitel 1:**
  - `ruth_teilhaberin` – sie hat Anteile, kennt jeden Vertrag; Kapitel 2 fragt nur noch nach dem Sitz.
  - `ruth_buchhalterin` – sie führt die Bücher; will Titel und Unterschriftsrecht.
  - `ruth_vertroestet` – sie bringt das Datum mit. Die Szene beginnt mit der Kiste unter dem Bett.
  - `ruth_zurueckgewiesen` / `ruth_beiseite` – sie fragt nicht mehr. Sie hat *(V)* mit ihrer Schwester
    Hannah und dem Geld aus dem Haushalt angefangen, Land in der Boomtown zu kaufen. Jacob erfährt es
    aus dem Grundbuch, nicht von ihr.
  - `geburt_dabei` / `geburt_verpasst` – Ruth erwähnt es nie direkt. Sie erwähnt es, wenn Jacob
    Claras Geburtstag verpasst.

### Thomas Harlan – Sohn (`visitor: thomas`, in Kapitel 2 Kind, in Kapitel 3 Erwachsener)

- **Kapitel 2 (10–13):** Er will mit an die Felder, er will ins Büro, er will gesehen werden.
  Die Schulwahl fällt hier: Internat an der Ostküste oder Schule in Port Ellis und Sommer am Turm.
  - **Ziel:** dass sein Vater zusieht – beim Reiten, beim Rechnen, beim Prügeln mit Bullards Sohn.
  - **Konflikt:** Er ist der Erbe, bevor er ein Junge sein darf. Die Kinder in Hallstead nennen ihn
    „Ölkind“, die Kinder am Hügel „Bonze“.
  - **Stimme:** direkt, fragt zu viel, lügt schlecht. *„Silas sagt, du hast früher selbst gebohrt.
    Warum machst du das nicht mehr?“*
- **Kapitel 3 (20–23): „Thomas kommt ins Unternehmen – oder nicht“.** Zurück vom College
  (`zs2_thomas_college`) oder aus den Feldern. Er hat Ideen über Marke, Automobile und Werbung, die
  Jacob für Spielerei hält – und Margaret Crane nicht.
  - **Ziel:** etwas Eigenes beweisen, in oder außerhalb der Firma.
  - **Konflikt:** Jacob will einen Nachfolger, Thomas will einen Vater. Der Aufsichtsrat misstraut ihm,
    wenn er vernachlässigt wurde (GDD §12).
  - **Stimme:** gebildet, schneller als Jacob, mit einem Rest Cordova, wenn er wütend ist.
    *„Du hast mir beigebracht, dass man nichts geschenkt bekommt. Also schenk mir keine Abteilung.“*
- **Varianten:** Beziehungswert `thomas`, `geburt_dabei`/`geburt_verpasst`, `thomas_wort_dabei`/
  `thomas_wort_verpasst` und die Erziehungs-Merkzeichen aus Kapitel 2 (`thomas_internat`,
  `thomas_felder`, `thomas_buero`, `thomas_ferngehalten`, `thomas_wahrheit`, `thomas_geschont`).
  Daraus entstehen die Werte des Erben (Geschäftssinn, Moral, Loyalität, Ehrgeiz) – siehe §10.

### Clara Harlan – Tochter (`visitor: clara`)

- **Kapitel 2 (5–8):** Ein kleines Mädchen, das fragt, woher das Geld kommt – mit sechs, ernsthaft.
  Sie hat eine Freundin unter den Arbeiterkindern *(V: die Tochter von Eli Ward)*.
  - **Ziel:** verstehen. **Konflikt:** Sie bekommt Ausreden. **Stimme:** *„Warum riecht Papa nach
    Petroleum, wenn er doch nur im Büro ist?“*
- **Kapitel 3 (15–18):** eigensinnig, idealistisch, liest Nora Whitlocks Artikel heimlich – oder offen
  am Frühstückstisch. Lernt Rosa Delgado kennen. Erste Weichen Richtung „unkonventionelle Nachfolgerin“
  oder „Verbündete von Nora und Delgado“ (GDD §12; die Wahl selbst fällt in Zeitsprung III).
  - **Ziel:** die Welt besser verlassen, als die Familie sie vorgefunden hat.
  - **Konflikt:** Sie fürchtet, so zu werden wie ihr Vater – und ist ihm ähnlicher als Thomas.
  - **Stimme:** scharf, belesen, mit Jacobs Sturheit. *„Du nennst es Preisführerschaft. Im Volksbund
    nennen sie es Diebstahl mit Briefkopf.“*

### Silas Brandt – erster Partner (`visitor: silas`)

- **Kapitel 2 (54–57): „Silas gegen den Aufsichtsrat“.** Silas ist ein Mann aus der Zeit der
  Seilschlag-Türme in einer Firma mit Aktien. Er versteht nicht, warum man über Dividenden abstimmt,
  während ein Trupp ohne Sicherheitsleinen arbeitet. Und er sieht als Erster, dass Fremde Aktien kaufen.
  - **Ziel:** seinen Teil behalten und gehört werden – „ich war zuerst da“.
  - **Konflikt:** Pettibone und der Vandermeer-Neffe wollen ihn loswerden (Trinker, alte Methoden,
    ein Unfall im Zeitsprung). Jacob braucht seine Stimme – oder seine Anteile.
  - **Stimme:** laut, warm, Bibel- und Bohrsprüche durcheinander, trinkt „nur sonntags“, was in
    Kapitel 2 nicht mehr stimmt. *„Die Herren wollen wissen, wie viel ein Barrel kostet. Fragt mal,
    was ein Finger kostet. Ich hab noch acht.“*
- **Kapitel 3 (64–67):** Das Ende seiner Arbeitsjahre. Je nach Bogen bringt er Thomas das Bohren bei,
  diktiert Nora seine Erinnerungen, oder er sitzt im Saloon und wartet darauf, dass Daniel Moss fragt.
  - **Ziel:** in Ehren aufhören – oder abrechnen.
  - **Stimme:** leiser, der Husten von Kerrigan. *„Ich hab dir den Turm geliehen, Junge. Nicht mein Leben.“*
- **Varianten aus Kapitel 1** (`content/arcs.yaml`):
  - `silas_fair`, `silas_freund` – Silas hält seine 30 % als Aktien und hat einen Sitz. Er ist Jacobs
    Stimme im Rat und seine größte Peinlichkeit.
  - `silas_gedeckt` – Jacob hat ihn einmal gedeckt; der Rat weiß davon (Pettibone hat die Unfallakte).
  - `silas_gedemuetigt` – Silas erwähnt den Tag vor Zeugen. Er stimmt im Rat gegen Jacob, wenn es weh tut.
  - `silas_ausgekauft`, `silas_abschied_gut` – Silas ist ein kleiner unabhängiger Produzent. Er kommt
    nicht als Rat, sondern als Kunde: Harlans Pipeline soll sein Öl fahren. „Silas gegen den
    Aufsichtsrat“ wird zu „Silas gegen den Tarif“.
  - `silas_versoehnt` – Silas hat sein Geld. Er kauft *(V)* auf eigene Faust zehn Aktien, um auf der
    Hauptversammlung reden zu dürfen.
  - `silas_betrogen` – Silas schweigt noch. Delaney findet ihn in Kapitel 2.
  - `silas_kronzeuge` – Nora hat seine Geschichte. Silas ist Delaneys erster Zeuge.

### Ezekiel Moss – Farmer (`visitor: moss`)

- **Kapitel 2 (56–59):** Ein alter Mann auf der Veranda, wenn die Farm noch steht. Seine Bibel ist
  dicker geworden, seine Hand zittert. Er spricht über Daniel, als sei der schon Richter.
  - **Ziel:** dass sein Sohn es besser hat und sein Land ihm gehört, wenn er stirbt.
  - **Konflikt:** Harlans Pipeline läuft über seine Weide – mit seinem Segen (`wegerecht_moss`) oder
    gegen seinen Zaun. Die Förderzinsen machen ihn wohlhabender, als ein Baumwollfarmer sein darf;
    die Nachbarn reden.
  - **Stimme:** biblisch, kurz, stur. *„Der Herr gibt Öl und Dürre, Harlan. Den Zaun hab ich gebaut.“*
- **Kapitel 3 (66–69):** Er stirbt *(V: in Runde 6–10, `certain`)* – der Anlass, der Daniel nach
  Cordova und an Jacobs Tisch zurückbringt. Die Beerdigung ist eine Schlüsselszene.
- **Varianten:** `moss_fair` (Honig zu Weihnachten, Moss sitzt in der ersten Reihe beim Gottesdienst
  neben Ruth) · `moss_feind` / `moss_betrogen` / `moss_vertrieben` (die Farm gehört Jacob oder einem
  Herrn aus Hallstead; Ezekiel lebt bei Verwandten und kommt nie) · `moss_verloren` (die Familie ist
  fort, niemand weiß wohin – Ezekiel taucht in Kapitel 3 nur noch als Name auf einem Grabstein auf).

### Daniel Moss – später Bezirksstaatsanwalt (`visitor: daniel`)

- **Kapitel 2 (25–28):** fertig mit der Rechtsschule, junger Anwalt.
  - mit `moss_feind`: *(V)* Hilfsanwalt in Frank Delaneys Büro im Justizministerium. Er lernt von dem
    Unbestechlichen, wie man einen Mächtigen geduldig einkreist. Er taucht in Kapitel 2 nur am Rand
    auf – als Name unter einem Schriftsatz, als junger Mann hinter Delaney.
  - mit `moss_fair` / `daniel_gefoerdert`: Er arbeitet für eine Kanzlei in Hallstead und schreibt
    Briefe. Er bewirbt sich *(V)* bei Harlan Oil als Anwalt – eine Einladung, die in Kapitel 3 teuer
    wird (er kündigt, um Staatsanwalt zu werden, und weiß, wo die Akten liegen).
  - mit `moss_verloren`: niemand in Cordova weiß, was aus ihm geworden ist.
- **Kapitel 3 (35–38): „Daniel Moss wird Bezirksstaatsanwalt“** von Cordova (Bezirk Port Ellis).
  - **Ziel:** dass das Gesetz in Cordova auch für reiche Männer gilt – und, je nach Bogen, dass sein
    Vater nicht umsonst gelitten hat.
  - **Konflikt:** Dankbarkeit gegen Pflicht (fair) oder Rache gegen Rechtsgefühl (feind). Er ist nicht
    käuflich – ein Bestechungsversuch macht es schlimmer, nicht besser.
  - **Stimme:** leise, präzise, juristisch, mit der Stille seines Vaters. Er schreibt mit, während
    andere reden. *„Ich habe mir damals etwas aufgeschrieben, Mr. Harlan. Ich lese es Ihnen vor.“*
- **Varianten:** `daniel_entschuldigung` – er hat die Entschuldigung aufgeschrieben, „ob als Trost oder
  als Beweis“. In Kapitel 3 entscheidet sich, was es war. `daniel_gefoerdert` – er zahlt zurück, aber
  mit Fairness, nicht mit Gefälligkeit.

### Nora Whitlock – Journalistin (`visitor: nora`)

- **Kapitel 2 (32–35): „Noras erster Artikel“** – ihr erster großer Artikel in Hallstead
  *(V: im* Hallstead Ledger*; der* Port Ellis Courier *war ihr Lehrjahr)*. Eine Serie über den Crane
  Trust: Bahnrabatte, Posted Price, gekaufte Richter. Jacob kommt darin vor – als Quelle, als Beispiel
  oder als Komplize.
  - **Ziel:** die Wahrheit über das Öl aufschreiben – mit Belegen, die vor Gericht halten.
  - **Konflikt:** Sie braucht Insider, und Insider haben eigene Ziele. Ihr Redakteur will
    Schlagzeilen, sie will Fußnoten.
  - **Stimme:** knapp, freundlich, unbeeindruckt. Sie stellt die zweite Frage, nicht die erste.
    *„Das war die Antwort für die Zeitung, Mr. Harlan. Jetzt die für mich.“*
- **Kapitel 3 (42–45):** Sie ist bekannt; Politiker fürchten ihre Serien. Sie beginnt das Buch, das zum
  Finale erscheint, und will ein langes Gespräch – „für später“. Sie trifft Clara.
  - **Stimme:** älter, müder, genauer. *„Ich schreibe nicht über Sie, Jacob. Ich schreibe über das,
    was Sie aus Cordova gemacht haben. Sie kommen nur zufällig darin vor.“*
- **Varianten:** `nora_ehrlich`, `nora_respekt`, `nora_interview` (sie kommt zuerst zu Jacob) ·
  `nora_bestechung`, `courier_gekauft` (sie hat das Notizbuch mit dem ausgeschnittenen Bericht dabei –
  „ein Mann der Zukunft“, Seite zwei, 120 $) · `nora_beschwert`, `nora_abgewiesen`,
  `nora_kein_gespraech` (sie schreibt ohne ihn, und es ist nicht freundlicher) · `silas_kronzeuge`
  (sie hat Silas' Geschichte und wartet nur auf den richtigen Moment).

### „Big“ Jim Bullard – Bullard Oil (`visitor: bullard`, `rival: bullard`)

- **Kapitel 2 (46–49): auf dem Höhepunkt.** Okara-Funde (`okara_bullard`), eigene Trupps, ein Haus mit
  Säulen. Er will Kartellpartner oder Todfeind sein – dazwischen kennt er nichts.
  - **Ziel:** größer werden als der Trust, ohne Hallstead zu fragen. **Konflikt:** Schulden, Jähzorn,
    Ehrenkodex. **Stimme:** laut, Saloon, Handschlag. *„Zehn Jahre, Harlan. Du hast Aktien, ich hab
    Söhne. Mal sehen, was länger hält.“*
- **Kapitel 3 (56–59): verschuldet.** Er bittet nicht – er „bietet an“. Seine Söhne *(V: Wade, 24, und
  Cole, 20)* stehen hinter ihm und merken sich alles.
- **Varianten:** `bullard_handschlag` (Kartell-Angebot in Kapitel 2, Rettungsbitte in Kapitel 3) ·
  `bullard_fehde`, `bullard_verraten`, `bullard_rache` (er bietet in Kapitel 2 gegen Jacob bei
  Pachten und Aktien, seine Söhne erben den Groll) · `bullard_schuld` (er schuldet Jacob – und hasst
  es, daran erinnert zu werden).

### Augustus Thorne – Thorne Rail & Trust Bank (`rival: thorne`)

- **Kapitel 2 (62–65):** erst Frachtdruck, jetzt Kreditdruck, dann Strohmänner im Aktienbuch – die
  „typische Falle“ des Kapitels. Er kommt selten selbst; er schickt Pettibone.
  - **Ziel:** Harlan Oil besitzen, ohne Öl anzufassen. **Konflikt:** kein Ölmann; verwundbar in Bahn-
    und Bankkrisen (`zs1_bankpanik`). **Stimme:** leise, Zahlen, nie ein Adjektiv. *„Ich kaufe keine
    Firmen, Mr. Harlan. Ich kaufe Zeit. Die Firmen kommen dann von allein.“*
- **Kapitel 3 (72–75):** bläht Aktien auf; seine Bank steht im Spekulationsboom ganz vorn.
- **Varianten:** `thorne_vertrag`, `thorne_exklusiv` (er erinnert an die Treue) · `thorne_abgelehnt`
  (er kauft über Strohmänner früher und härter) · `bank_kredit`, `wechsel_gehalten` (Pettibone hat die
  Akte und das Vertrauen des Rats).

### Die Crane-Familie (`rival: crane`)

**Cornelius Crane (76–79 in Kapitel 2).** Er stirbt oder erleidet einen Schlaganfall *(V: Runde 4–7,
`certain`)*. Vorher eine letzte Begegnung: Er erinnert sich genau, ob Jacob in Kapitel 1 abgelehnt hat
(`crane_abgelehnt`), treu war (`crane_treue`) oder den Abschlag schlucken musste (`crane_abschlag`).
*„Sie haben damals Nein gesagt, Harlan. Ich habe nie verstanden, warum. Heute verstehe ich es noch weniger.“*

**Margaret Crane – Crane Eastern** (`visitor: margaret`, Kap. 2: 41–44, Kap. 3: 51–54).
- **Kapitel 2:** kämpft gegen Pruett um die Nachfolge – im Trust oder, nach einer Zerschlagung, als
  Crane Eastern (Ostküste, Marke, Vertrieb). Sie braucht Lieferanten mit Rohöl, also Jacob.
- **Kapitel 3:** „führt den Kampf um die Marke“ (GDD §13): Tankstellen, Plakate, Straßenkarten. Ihre
  Tochter *(V: Evelyn Crane, Jahr 2 geboren, in Kap. 3 19–22)* ist im Alter von Thomas – Saat für die
  Heiratsallianz (GDD §9.2 „Schwiegermutter des Erben“).
- **Ziel:** beweisen, dass sie die Erbin ist, nicht die Tochter. **Konflikt:** kaum eigene Förderung;
  die Herren im Trust trauen ihr nicht. **Stimme:** modern, kühl, Ironie als Waffe. *„Vater kaufte
  Raffinerien. Ich kaufe Gewohnheiten. Die rosten nicht.“*
- Profil (GDD §9.2): Risiko 4, Aggressivität 3, Vertragstreue 2, Nachtragen 3, Geduld 4.

**Harold Pruett – Crane Midland** (`visitor: pruett`, Kap. 2: 52–55, Kap. 3: 62–65).
- **Kapitel 2:** Cranes langjähriger Generalbevollmächtigter *(V)*; Kostenkürzer, Pipelines im
  Mittleren Westen. Er bietet Jacob Ruhe an: feste Abnahme, fester Preis, keine Überraschungen.
- **Kapitel 3:** wartet. Er kauft in Krisen – auch die Firma des Spielers (GDD §9.2), wenn Jacob sich
  auf Kredit verhebt.
- **Ziel:** dass nichts Unvorhergesehenes passiert. **Konflikt:** langsam, risikoscheu, unterschätzt
  Margaret. **Stimme:** trocken, buchhalterisch, Uhrkette. *„Ich habe nichts gegen Sie, Mr. Harlan.
  Ich habe etwas gegen Schwankungen.“*
- Profil: Risiko 1, Aggressivität 2, Vertragstreue 4, Nachtragen 3, Geduld 5.
- **Achtung Namensnähe:** In Kapitel 1 gibt es *Anwalt Pruitt* und *Witwe Agnes Pruitt* (Karte,
  `content/map.yaml`). „Pruett“ und „Pruitt“ sind leicht zu verwechseln – siehe §12.

**Lusk vom Trust** (`visitor: lusk`, bestehend). Cranes Mann am Verladeplatz in Port Ellis. In
Kapitel 2 muss er sich entscheiden: Margaret, Pruett – oder *(V)* er wechselt zu Harlan Oil und bringt
die Preislisten des Trusts mit (Insiderwissen ohne Mr. Vale, aber mit Hitze).

### Rosa Delgado – Verband unabhängiger Produzenten (`visitor: delgado`)

- **Kapitel 2 (39–42):** gründet den Produzentenverband offiziell (GDD §13) – aus der
  Unterschriftenliste von Kapitel 1 wird eine Organisation mit Anwälten und einer Stimme im
  Provinzparlament. Sie will Jacob als zahlendes, lautes Mitglied gegen den Trust.
  - **Ziel:** dass kleine Produzenten zu fairen Preisen transportieren und verkaufen dürfen
    (Transportpflicht für Pipelines). **Konflikt:** wenig Geld; sobald Jacob eine Pipeline besitzt,
    gilt das Gesetz auch für ihn. **Stimme:** geduldig, juristisch, gelegentlich bitter.
    *„Gegen den Trust waren wir uns einig. Fragen Sie mich in zehn Jahren noch einmal.“*
- **Kapitel 3 (49–52):** Wenn Jacob selbst der Trust ist, steht sie auf der anderen Seite – mit Clara.
- **Varianten:** `delgado_verband` (Gründungsmitglied, ihr Vertrauen ist ein Startkapital) · ohne
  (Jacob muss sich einkaufen; sie misstraut ihm).

### Frank Delaney – Bundesanwalt (`visitor: delaney`, ab Kapitel 2)

- **Kapitel 2 (42–45):** „Delaneys Ermittlungen“ gegen den Crane Trust. Jacob ist erst Zeuge, vielleicht
  Kronzeuge, vielleicht Mitbeschuldigter (wer mit dem Trust Absprachen traf, hängt mit drin).
  - **Ziel:** die Trusts vor Gericht bringen. **Konflikt:** Er braucht Insider, und Insider sind nie
    sauber. Versetzbar nur mit viel politischem Einfluss (GDD §10).
  - **Stimme:** geduldig, höflich, unnachgiebig, ein Mann mit Aktenkoffer und kaltem Kaffee. *„Ich habe
    Zeit, Mr. Harlan. Das ist das Einzige, was der Staat mehr hat als Sie.“*
- **Kapitel 3 (52–55):** Bundesebene; Daniel Moss ist die Bezirksebene. Beide können zusammenarbeiten
  (Daniel war in der Feind-Variante sein Schüler) oder sich im Weg stehen (Zuständigkeit).

### Mr. Vale – Gesicht des Konsortiums (`visitor: vale`)

- **Kapitel 2:** **Insiderwissen über den Trust** (GDD §12): ein Brief, eine Liste mit den Preisen, die
  Margaret und Pruett einander geheim bieten, oder das Datum, an dem Delaney zugreift. Wer es nutzt,
  wird reich und schuldet etwas.
- **Kapitel 3:** **Die Einladung auf ein Schloss in Aldmark** – Beitritt zum Weltkartell „Wie es ist“.
  Annehmen (Macht gegen Gewissen), ablehnen oder ausspielen (nehmen, ohne zu geben).
- **Ziel:** Ordnung, stabile Preise, Märkte unter wenigen. **Konflikt:** fürchtet Licht und Männer, die
  nehmen, ohne zu geben. **Stimme:** höflich, vorausschauend, nie drohend – das Drohen übernehmen die
  Folgen. *„Sie haben vor zwanzig Jahren fünfhundert Dollar zurückgegeben. Ich habe Sie seitdem nicht
  aus den Augen gelassen. Aus Bewunderung, Mr. Harlan.“*
- **Varianten:** `vale_geld` – er spricht über die Schuld, ohne das Wort zu benutzen. `vale_abgelehnt` –
  er spricht mit Respekt und erhöht das Angebot. Ohne beides – er stellt sich vor, als hätten sie sich
  schon einmal gesehen.

### Weitere bestehende Figuren (kurz)

- **Cornelia Vandermeer** (Matriarchin, Hallstead; `visitor: vandermeer`): In Kapitel 3 die Tür zur
  „Aufnahme in die Gesellschaft (Stand)“: ein Ball, ein Club, ein Sitz im Kirchenvorstand. Sie bietet in
  Kapitel 3 *(V)* zum ersten Mal an, Thomas oder Clara einzuladen – erste Heiratssaat.
  *„Geld riecht, Mr. Harlan. Wir lehren es nur, leiser zu riechen.“*
- **Senator Hollis Grady** (`visitor: grady`): Kapitel 2 Gefälligkeiten gegen Spenden; Zeitsprung II
  Reserveland-Angebot; Kapitel 3 der natürliche Partner des Lobbyisten. Will Präsident werden.
- **Mr. Pettibone** (`bankier`): Filialleiter der Thorne-Bank – ab Kapitel 2 Thornes Mann im
  Aufsichtsrat (siehe §5).
- **Martha Hale** (Witwe, Hale-Ranch): *(V)* nimmt beim Börsengang Aktien statt Pacht – die Witwe im
  Aufsichtsrat, die Sicherheit will (§5).
- **Sheriff Boyd Tatum** (`sheriff`): in Kapitel 2 abgewählt *(V)*; mit `sheriff_bezahlt` bietet er sich
  als Fixer an (§4).
- **Eli Ward**: mit `eli_versorgt`/`eli_waechter` treuer Nachtwächter, in Kapitel 2 Kandidat für den
  ehrlichen Sicherheitschef (§4). Mit `eli_im_stich` ein Mann mit Stock, der vor dem Werkstor steht,
  wenn die Gewerkschaft kommt.
- **Dan Kerrigan**: mit `kerrigan_lager` lebt er noch und zählt in Kapitel 2 Fässer; sonst ist er ein
  Grab, an dem Silas betrunken redet (`kerrigan_verheizt`, `kerrigan_zusammenbruch`).
- **Redakteur Bixby** (Courier): in Kapitel 3 *(V)* Pressesprecher von Harlan Oil, wenn Jacob einen
  braucht – ein Mann, der weiß, wie man Berichte verkauft, weil er es selbst getan hat (`courier_gekauft`).
- **Doktor Haskell** (`arzt`): älter, spricht in Kapitel 3 als Erster über Jacobs Herz.
- **Bruder Abel** (`prediger`): in Kapitel 2 Prediger der Arbeiterkirche in der Boomtown; Stimme der
  Arbeiter, bevor es eine Gewerkschaft gibt.
- **Hannah** (Ruths Schwester): Ruths Zuflucht in der Ehekrise von Kapitel 3.
- **Ike Rourke** (Geldverleiher): mit `wucher_kredit` kennt er Jacobs schwache Zeiten – und verkauft
  dieses Wissen an Nora oder Thorne.

---

## 4. Neue Figuren (sparsam)

Die neuen Systeme brauchen Gesichter. Wo es geht, übernimmt eine bestehende Figur die Rolle (Tatum,
Eli, Pettibone, Martha Hale, Bixby, Lusk). Neu sind nur diese vier – alle *(V)*:

### Ada Pell – Sekretärin, später Prokuristin (Kapitel 2–4; `visitor: sekretaerin`)
Tochter des Krämers Pell aus Kapitel 1, 24 in Kapitel 2. Hat bei Ruth rechnen gelernt *(wenn
`ruth_buchhalterin`)* oder in der Handelsschule in Port Ellis.
- **Ziel:** unentbehrlich werden – eine Frau mit Prokura in einer Männerfirma.
- **Konflikt:** Sie sieht alle Briefe, auch die aus der Schublade mit dem Schattenbuch. Gewissenhaft
  oder verschwiegen – je nach Merkmal (GDD §11).
- **Stimme:** schnell, korrekt, eine Spur Humor. *„Sie haben heute sieben Termine, Mr. Harlan. Fünf
  davon kann ich für Sie absagen. Bei zweien rate ich ab.“*
- **Systeme:** Personal (+1–2 Termine, Routinepost nach Richtlinie).

### Der Fixer: Boyd Tatum oder Eli Ward (Kapitel 2; `visitor: fixer`)
Keine neue Figur, sondern eine Weiche aus Kapitel 1:
- **Boyd Tatum** (mit `sheriff_bezahlt`, nach der Abwahl): gierig, effektiv, macht schmutzige Aufträge
  ohne Fragen – und schreibt Quittungen für sich selbst. *„Ich frage nicht, was in dem Paket ist, Mr.
  Harlan. Ich frage, wohin.“*
- **Eli Ward** (mit `eli_waechter` oder `eli_versorgt`): treu bis zum Tod, verweigert Sabotage gegen
  Menschen. *„Ich pass auf Ihre Tanks auf. Auf anderer Leute Tanks pass ich nicht auf.“*
- Ohne beide Merkzeichen: ein Fremder aus Thornes Detektei *(V: Mr. Quill)* – und das ist schlechter.

### Walter Greaves – Raffineriedirektor (Kapitel 2–4; `visitor: greaves`)
Chemiker aus Hallstead, 38, kam mit der ersten eigenen Raffinerie (oder wird von Pruett abgeworben).
- **Ziel:** die Ausbeute an Benzin verdoppeln – thermisches Cracken (Technikstufe II) ist sein Lebenstraum.
- **Konflikt:** Genie, launisch (GDD §11). Er hält die Arbeiter für Hände und den Kessel für sein Kind.
  Raffinerien brennen.
- **Stimme:** schnell, verächtlich, plötzlich begeistert. *„Kerosin ist eine Lampe, Mr. Harlan. Benzin
  ist eine Straße. Wollen Sie Lampen verkaufen, bis Sie sterben?“*
- **Systeme:** Raffinerie, Forschung (Technikstufe II), Unfälle.

### Lionel Dunmore – Lobbyist in Hallstead (Kapitel 3; `visitor: dunmore`)
Das schwarze Schaf einer alten Familie, 50, Cornelia Vandermeers Neffe zweiten Grades. Spielschulden.
- **Ziel:** in die Gesellschaft zurück, die ihn ausgestoßen hat – mit Jacobs Geld.
- **Konflikt:** Er öffnet Türen, die Jacob nie aufbekäme, und erzählt jedem, wie dankbar Jacob sein muss.
  Charmant (Affären- und Skandalrisiko, GDD §11).
- **Stimme:** glatt, witzig, Zitate. *„In Hallstead kauft man niemanden, Mr. Harlan. Man lädt ihn zum
  Essen ein, bis er vergisst, dass er nie bezahlt hat.“*
- **Systeme:** Lobbyist (Einfluss, Gefallen), Stand, Gesetze.

*(Weitere Namen, die nur einmal auftauchen – ein Admiral, ein Aktienhändler, ein Tankstellenpächter –
dürfen die Schreiber frei erfinden; bitte im Dateikopf als „erfunden“ vermerken, wie in Kapitel 1.)*

---

## 5. Der Aufsichtsrat (Ensemble für das Aktien-System)

GDD §8: 5–9 Sitze, jedes Mitglied mit Agenda; große Entscheidungen brauchen die Mehrheit; Kontrolle
= eigene Anteile + Stimmen loyaler Räte. Vorschlag für die Besetzung, gespeist aus Kapitel 1 *(V)*:

| Sitz | Wer | Agenda | Kommt, wenn … |
|---|---|---|---|
| Vorsitz | Jacob Harlan | Kontrolle | immer |
| Familie | Ruth Harlan | Sicherheit der Familie, eigene Stimme | `ruth_teilhaberin` oder Ruth-Bogen K2 (`ruth_aufsichtsrat`) |
| Gründer | Silas Brandt | Trupps, alte Treue, Misstrauen gegen „die Herren“ | `silas_fair` / `silas_freund` |
| Bank | Mr. Pettibone (Thorne-Bank) | Dividende – und spioniert für Thorne | `bank_kredit` / `wechsel_gehalten`, sonst Thornes Strohmann *(V: Mr. Sayles)* |
| Hallstead | Ambrose Vandermeer *(V, Cornelias Neffe, Bankhaus Vandermeer & Co.)* | Dividende, Ansehen, kein Skandal | immer, wenn Aktien nach Hallstead verkauft wurden |
| Witwe | Martha Hale | Sicherheit, keine Wagnisse | beim Börsengang (immer, *V*) |
| Unabhängig | Rosa Delgado *(nur Kapitel 2, V)* | Transportpflicht, faire Tarife | `delgado_verband` und Jacob bietet ihr den Sitz an |
| Kapitel 3 | Thomas Harlan | Modernisierung, Marke | `thomas_firma` |
| Kapitel 3 | Lionel Dunmore | Einfluss, eigener Rang | wenn Jacob ihn als Lobbyisten holt und ihm einen Sitz verspricht |

**Faustregel für die Schreiber:** Ein Rat ist eine Person mit Gedächtnis. Wer im Rat gedemütigt wird,
stimmt später dagegen. Ein Rats-Ereignis braucht immer den Preis in Kontrolle oder Loyalität, nicht nur
in Dollar.

---

## 6. Story-Bögen Kapitel 2 – Der Herausforderer (Jahr 11–14)

**Ausgangslage:** Harlan Oil ist eine ernstzunehmende Firma, der Crane Trust beherrscht Raffinerien und
Pipelines, der Volksbund macht Stimmung gegen den Trust. **Kapitelprüfung:** eigene Raffinerie oder
Pipeline zum Hafen, Kontrolle ≥ 50 %, Imperiumswert ≥ 1 Mio. $.

**Dramaturgie *(V)*:** Runde 1–4 Eröffnung (was ist aus allen geworden?), Runde 5–10 die Kämpfe
(Crane-Nachfolge, Rat, Delaney), Runde 11–16 die Rechnung (Zerschlagung oder nicht, Ruths Entscheidung,
Silas' Schicksal). Jeder große Bogen hat 3–5 Ereignisse, eine Schlüsselszene (`draft: true`) und setzt
Ausgangs-Merkzeichen für Kapitel 3. Vorschlag: Bögen wie in Kapitel 1 über `content/arcs.yaml`
abbilden (neue Einträge `ruth_k2`, `silas_k2`, `nora_k2`, `crane_k2`).

### Bogen A – Noras erster Artikel (Presse, Ermittler)

| Runde | Ereignis *(V: id)* | Inhalt | Wahlen → Merkzeichen |
|---|---|---|---|
| 2+ | `k2_nora_besuch` (visitor: nora) | Nora steht in Jacobs neuem Büro, Hallstead-Hut, Notizbuch. Sie schreibt eine Serie über den Trust und will wissen, was er weiß. | Material über Crane geben → `nora_quelle` · ein Interview über sich selbst → `nora_interview_k2` · abweisen → `nora_ohne_jacob` |
| +2 | `k2_nora_artikel` (**Schlüsselszene**, Zeitungsereignis) | *„Wie der Trust Cordova melkt“* – Teil eins erscheint im Ledger. Jacob steht als Zeuge darin (Quelle), als Beispiel (Interview) oder als einer, „der dem Trust die Treue geschworen hat“ (`crane_treue`). | danken → `nora_verbuendet` · der Zeitung mit Anzeigenentzug drohen → `nora_feindin` (Hitze) · den Ledger anteilig kaufen → `ledger_gekauft` (Nora wechselt zur nächsten Zeitung, GDD §10) |
| +1–3 | `k2_nora_delaney` | Der Artikel landet auf Delaneys Tisch. Delaney bittet Jacob um ein Gespräch. | Übergang in Bogen E |
| 9+ | `k2_nora_rivale` | Nora hat etwas über einen Rivalen (Bullard, Thorne oder Margaret) und fragt, ob es stimmt. | bestätigen (Zweckbündnis, Rivale geschwächt) · dementieren (Nora merkt sich die Lüge, wenn es stimmt) |
| 12+ | `k2_nora_silas` (nur mit `silas_kronzeuge` oder `silas_k2_geopfert`) | Nora hat Silas' Geschichte. Sie gibt Jacob eine Woche für eine Stellungnahme. | Stellung nehmen · Silas zum Schweigen bezahlen (Hitze, Spur Schwere 3) · nichts tun |

**Anknüpfungen:** `nora_respekt`/`nora_ehrlich` → Nora kommt in Runde 2 und duzt ihn fast; `courier_gekauft`
→ ihr erster Satz ist „ein Mann der Zukunft, Seite zwei“; `nora_bestechung` → sie bietet ihm an, die
120 $ zurückzugeben – „mit Zinsen, damit es in die Bücher passt“; `nora_beschwert` → sie kommt nicht,
der Artikel kommt trotzdem.
**Ausgänge für Kapitel 3:** `nora_verbuendet` · `nora_quelle` · `nora_feindin` · `ledger_gekauft` ·
`nora_ohne_jacob`.

### Bogen B – Silas gegen den Aufsichtsrat (Aktien, Personal)

Drei Fassungen, je nach Kapitel-1-Ausgang:

**B1 – Silas im Rat** (`silas_fair` oder `silas_freund`):
| Runde | Ereignis | Inhalt | Wahlen |
|---|---|---|---|
| 3+ | `k2_silas_rat` (visitor: silas) | Silas kommt aus der Ratssitzung, rot im Gesicht. Pettibone will einen „Betriebsdirektor mit Ausbildung“ an seiner Stelle. | zuhören (Familienzeit-artig, Kraft) · ihm raten nachzugeben |
| 5+ | `k2_silas_unfall` | Ein Trupp unter Silas' Aufsicht – Gestänge gebrochen, ein Toter. Silas war nüchtern. Der Rat glaubt es nicht. (`silas_gedeckt`: Pettibone legt die alte Akte auf den Tisch.) | Silas decken (Kontrolle/Rat −) → `silas_geschuetzt` · ihn abberufen lassen → `silas_k2_geopfert` · ihm seine Aktien abkaufen (teuer, Kontrolle +) → `silas_k2_ausgezahlt` |
| 8+ | `k2_silas_strohmann` (**Schlüsselszene**) | Silas hat gesehen, wer Aktien kauft: drei Namen aus Port Ellis, alle mit Thornes Anwalt. „Die Herren kaufen dich, Junge, Stück für Stück.“ | Silas glauben und zurückkaufen (Kontrolle schützt vor der Falle) · ihn auslachen (`silas_ausgelacht`; Thorne kauft weiter) |

**B2 – Silas als Kunde** (`silas_ausgekauft`, `silas_abschied_gut`): Silas fördert auf eigene Rechnung
und braucht Harlans Pipeline (Transportpflicht!). Der Rat will den vollen Tarif. Wahlen: Freundschaftstarif
gegen den Rat (Kontrolle −, `silas_tarif_fair`) · voller Tarif (`silas_tarif_voll`; Silas tritt Delgados
Verband bei) · ihm die Quellen abkaufen (`silas_quellen_gekauft`).

**B3 – Silas als Zeuge** (`silas_betrogen`, `silas_kronzeuge`, `silas_versoehnt`): Silas steht auf der
Hauptversammlung (mit zehn gekauften Aktien) und fragt laut, wie Harlan Oil seine Partner bezahlt.
Wahlen: ihn ausreden lassen und vor allen nachzahlen (`silas_k2_nachgezahlt`) · ihn hinausbegleiten
lassen (`silas_k2_hinausgeworfen` → Delaney) · Pettibone ihm ein Angebot machen lassen (Schweigegeld,
Spur Schwere 2, `silas_schweigegeld`).

**Ausgänge für Kapitel 3:** `silas_geschuetzt` · `silas_k2_geopfert` · `silas_k2_ausgezahlt` ·
`silas_tarif_fair` · `silas_tarif_voll` · `silas_k2_nachgezahlt` · `silas_k2_hinausgeworfen` · `silas_schweigegeld`.

### Bogen C – Ruths Wunsch mitzuarbeiten (Familie, Aktien)

| Runde | Ereignis | Inhalt | Wahlen → Merkzeichen |
|---|---|---|---|
| 1–2 | `k2_ruth_abend` (visitor: ruth) | Ruth hat die Bilanz des Zeitsprungs gelesen – oder nicht lesen dürfen. Sie stellt eine Frage, die zeigt, dass sie mehr weiß als Pettibone. | ernst nehmen (`ruth`+) · lächeln (`ruth`−) |
| 4+ | `k2_ruth_wunsch` (**Schlüsselszene**) | Ruth will mitarbeiten. Je nach K1: Sitz im Rat (`ruth_teilhaberin`), Finanzen mit Titel (`ruth_buchhalterin`), das Datum aus der Kiste (`ruth_vertroestet`). Clara ist fünf, Thomas fragt, wer dann zu Hause ist. | Sitz im Rat (Termin + Anteile an Ruth, Kontrolle +, Rat murrt) → `ruth_aufsichtsrat` · Finanzchefin (Termin, Kredite billiger) → `ruth_finanzen` · „Nach dem Kapitel“ → `ruth_vertroestet_k2` · Nein → `ruth_zuhause` |
| +2–4 | `k2_ruth_rat` (nur `ruth_aufsichtsrat`) | Vandermeer verlässt den Raum, als Ruth das Wort ergreift. Ruth fragt, ob Jacob ihn zurückholt. | Vandermeer zurechtweisen (Stand −, Ruth ++) · schweigen (Ruth −) |
| 6+ | `k2_ruth_eigenes` (nur `ruth_zuhause`, `ruth_zurueckgewiesen`, `ruth_beiseite`) | Das Grundbuch: Ruth besitzt drei Häuser in der Boomtown und Anteile an *(V)* Hannahs Mann seiner Fuhrfirma. | respektieren (`ruth_eigenes_geschaeft`; sie bleibt, aber auf Augenhöhe) · verbieten (`ruth_verboten`; Wendepunkt in K3 fast sicher Trennung) · einbeziehen (späte Wende → `ruth_finanzen`) |
| 12+ | `k2_ruth_clara` | Clara ist krank, Jacob in Hallstead, Ruth im Rat oder im Büro. Wer fährt? | Termine, Kraft, Clara-Beziehung |

**Ausgänge für Kapitel 3:** `ruth_aufsichtsrat` · `ruth_finanzen` · `ruth_eigenes_geschaeft` ·
`ruth_vertroestet_k2` · `ruth_zuhause` · `ruth_verboten`.

### Bogen D – Die Crane-Nachfolge (Diplomatie, Kartellgesetz)

| Runde | Ereignis | Inhalt |
|---|---|---|
| 2–3 | `k2_crane_alt` (visitor: crane) | Cornelius Crane, alt, im Rollstuhl oder am Stock. Letztes Angebot: Kauf oder Kartell. Erinnert sich an K1. |
| 4–7 | `k2_crane_tod` (tableau: true, `certain`) | Tod oder Schlaganfall. Trauerfeier in Port Ellis: Margaret und Pruett stehen an verschiedenen Enden des Grabes. |
| +1 | `k2_margaret_angebot` (visitor: margaret) | Rohöl-Liefervertrag gegen Unterstützung im Trust-Rat; Hinweis auf Evelyn („meine Tochter fragt nach Ihrem Sohn“ – nur als Satz, Saat für K3). |
| +1 | `k2_pruett_angebot` (visitor: pruett) | Feste Abnahme, fester Preis, keine Pipeline – „Sie brauchen keine, Sie haben ja uns“. |
| 9+ | `k2_zerschlagung` (**Schlüsselszene**, nur wenn das Weltmodell ein Kartellgesetz bringt) | Jacob kann die Zerschlagung beschleunigen (Delaney, Delgado, Volksbund), verhindern (Grady, Handelspartei) oder sich heraushalten. |

**Wahlen → Merkzeichen:** `margaret_partner` · `pruett_partner` · `beide_gespielt` (wer beide spielt,
verliert Vertragstreue bei beiden) · `trust_zerschlagen_mit_jacob` · `trust_gerettet_mit_jacob`.
**Anknüpfungen:** `crane_abgelehnt` (Margaret respektiert ihn, Pruett nicht), `crane_treue` (Pruett
erwartet Fortsetzung; Delaney hat die Treueerklärung als Beweisstück), `crane_abschlag` +
`delgado_verband` (Jacob und Delgado haben schon einmal gemeinsam gewonnen).

### Bogen E – Delaneys Ermittlungen (Ermittler, Hitze)

| Runde | Ereignis | Inhalt | Wahlen |
|---|---|---|---|
| 5+ | `k2_delaney_besuch` (visitor: delaney) | Delaney ermittelt gegen den Trust: Bahnrabatte, Posted Price. Er fragt nach Thornes Frachtverträgen und Cranes Abschlag. | aussagen (`delaney_zeuge`; Thorne erfährt es) · Kronzeuge mit Unterlagen (`delaney_kronzeuge`; Branche-Furcht +, Crane-Erben Feinde) · Anwalt schicken (`delaney_anwalt`) · lügen (`delaney_belogen`, Spur Schwere 3) |
| 10+ | `k2_delaney_wende` (nur mit Hitze ≥ Schwelle oder `silas_kronzeuge`/`silas_k2_hinausgeworfen`) | Delaney blättert in einer zweiten Akte. Auf dem Deckel steht „Harlan“. | Spuren vernichten · Sündenbock · Grady um Versetzung bitten (Gefallen, `delaney_versetzt_versuch`) |

**Ausgänge:** `delaney_kronzeuge` · `delaney_zeuge` · `delaney_anwalt` · `delaney_belogen` ·
`delaney_akte_harlan`. Daniel Moss steht in der Feind-Variante hinter Delaney – ein Satz genügt:
*„Der junge Mann hinter ihm schreibt mit. Jacob kennt das Gesicht vom Bahnhof.“*

### Bogen F – Mr. Vale: Insiderwissen über den Trust (Konsortium)

Ein Ereignis, Schlüsselszene, *(V)* Runde 6–9, `mail: offer` mit rotem Siegel:
„Am Dienstag verkauft Pruett seine Pipeline-Anteile in Okara unter Wert. Ein Freund.“
Wahlen: nutzen (viel Geld, `vale_k2_genutzt` – Konsortium-Schuld +1) · verbrennen (`vale_k2_verbrannt`) ·
an Delaney weitergeben (`vale_k2_verraten` – gefährlich: Vale merkt es; Weg „bekämpfen“).

### Bogen G – Kinder: Thomas' Schule, Claras Fragen (Familie, Erziehung)

- `k2_thomas_schule` (**Schlüsselszene**, Runde 3–6): Internat an der Ostküste (`thomas_internat`) oder
  Schule in Port Ellis und Sommer am Turm bei Silas oder Eli (`thomas_felder`).
- `k2_thomas_buero`: Thomas will mit ins Büro – mitnehmen (`thomas_buero`) oder fernhalten
  (`thomas_ferngehalten`).
- `k2_thomas_pruegel`: Thomas hat sich mit einem Bullard-Sohn geprügelt (nur mit `bullard_fehde`).
- `k2_clara_frage`: Clara fragt, woher das Geld kommt. Die Wahrheit (`clara_wahrheit`) oder eine
  Geschichte (`clara_geschichte`).
- `k2_thomas_wahrheit` (Runde 12+): Thomas hat gehört, was die Leute über Moss/Silas sagen. Wahrheit
  (`thomas_wahrheit`) oder schonen (`thomas_geschont`).

### Bogen H – Moss und Daniel (Kapitel-2-Brücke)

- `k2_moss_pipeline` (wenn eine Pipeline geplant ist): Ezekiel Moss und das Rohr über seiner Weide –
  `wegerecht_moss` (er hält Wort, „es darf durch“) · `wegerecht_moss_versoehnt` · `moss_feind` (Zaun,
  Flinte, Bibel; Enteignung nur mit politischem Einfluss – Spur, Daniel erfährt es).
- `k2_daniel_brief` (nur `moss_fair`/`daniel_gefoerdert`): Daniel bewirbt sich bei Harlan Oil.
  Einstellen (`daniel_angestellt`) · empfehlen und absagen (`daniel_empfohlen`).
- `k2_daniel_delaney` (nur `moss_feind`): siehe Bogen E, ein Satz.

### Rivalen am Rand

- **Bullard auf dem Höhepunkt:** Kartellangebot (Okara-Preise absprechen, Hitze bei Kartellgesetz)
  oder Bieterkampf um eine Raffinerie. `bullard_k2_kartell` · `bullard_k2_krieg`.
- **Thorne:** die typische Falle – Strohmänner im Aktienbuch (Bogen B1 deckt sie auf; sonst kommt
  `k2_thorne_strohmann` als Schock-Ereignis in Runde 10+, wenn Kontrolle knapp).
- **Delgado:** `k2_delgado_verband` – Gründungsversammlung; Mitglied (`delgado_k2_mitglied`) oder
  Gegner (`delgado_k2_gegner`), sobald Jacobs Pipeline steht und die Transportpflicht droht.

---

## 7. Story-Bögen Kapitel 3 – Der Konzernherr (Jahr 21–24)

**Ausgangslage:** Harlan Oil ist ein Konzern; die Börse lockt, Hallsteads alte Familien öffnen Türen
oder schlagen sie zu. **Kapitelprüfung:** eigene Marke in ≥ 3 Regionen oder ≥ 10 % Marktanteil,
Rating mindestens C.

**Dramaturgie *(V)*:** Runde 1–4 Rückkehr (Thomas kommt heim, Daniel wird gewählt), Runde 5–10
Vorladungen (Daniels Ermittlung, Vales Einladung, die Vandermeer-Saison), Runde 11–16 der Bruch oder
die Versöhnung (Ehe, Thomas, Konsortium). Im Hintergrund kann das Weltmodell einen Spekulationsboom
und Kreditcrash bringen – die Bögen sollen dann härter treffen (Bedingung „Crash läuft“, §10).

### Bogen A – Daniel Moss wird Bezirksstaatsanwalt (Justiz, Hitze)

| Runde | Ereignis | Inhalt | Wahlen → Merkzeichen |
|---|---|---|---|
| 1–3 | `k3_daniel_wahl` | Wahl zum Bezirksstaatsanwalt in Cordova. Daniel kandidiert für den Volksbund *(V)*. Ein Mann der Handelspartei bittet Jacob um eine Spende gegen ihn. | Daniel unterstützen (`daniel_unterstuetzt`) · den Gegner finanzieren (`daniel_bekaempft`; verliert der Gegner, weiß Daniel es) · sich heraushalten |
| 6–10 | `k3_moss_beerdigung` (**Schlüsselszene**, tableau) | Ezekiel Moss ist tot. Daniel steht am Grab. Jacob geht hin oder nicht. In der Fair-Variante bittet Daniel ihn, den Sarg mitzutragen. In der Feind-Variante stellt er sich zwischen Jacob und das Grab. | hingehen · Kranz schicken · wegbleiben |
| 4+ | `k3_daniel_akte` (visitor: daniel, **Schlüsselszene**) | Daniel öffnet eine Ermittlung. Was er findet, hängt an K1/K2: das Moss-Papier (`moss_betrogen`), die Versteigerung (`moss_vertrieben`), Sheriff-Geld (`sheriff_bezahlt`), Pikes gefälschte Urkunde (`pike_urkunde_falsch`), ein toter Arbeiter (`silas_k2_geopfert`, `kerrigan_verheizt`), Gradys Reserveland (`zs2_grady_reserveland`), die Enteignung über seine Weide. Ohne Belastendes: Er ermittelt gegen Thorne oder Bullard und braucht Jacob als Zeugen. | kooperieren (`daniel_kooperation`) · Anwälte (`daniel_anwaelte`) · bestechen (`daniel_bestechung_versuch` – scheitert immer, wird selbst zur Akte) · über den Lobbyisten „wegloben“ ins Richteramt in Hallstead (`daniel_weggelobt`, viel Einfluss) |
| +3 | `k3_daniel_angebot` | Daniel bietet einen Vergleich: ein Geständnis in einer Sache, dafür ruht die andere. In der Fair-Variante sagt er dazu: „Mein Vater hätte gewollt, dass ich Ihnen das anbiete. Mehr kann ich nicht.“ | annehmen (Geldstrafe, Ruf −, `daniel_vergleich`) · kämpfen (Prozess → Systeme Ermittler/Justiz) |

**Varianten:** `daniel_gefoerdert` (er zahlt mit Fairness zurück: Vorwarnung, nie Gefälligkeit) ·
`daniel_entschuldigung` (er liest die Entschuldigung vor – als Trost, wenn Jacob kooperiert; als Beweis,
wenn er lügt) · `daniel_angestellt` (er kündigt bei Harlan Oil, um zu kandidieren; er kennt die
Aktenschränke) · `moss_verloren` (er stellt sich vor, und erst beim Namen versteht Jacob).
**Ausgänge für später:** `daniel_verbuendet` · `daniel_anklage` · `daniel_vergleich` · `daniel_weggelobt` ·
`daniel_bestechung_versuch` (Kapitel 4: keine Anklage ist Kapitelprüfung!).

### Bogen B – Thomas im Unternehmen oder nicht (Familie, Personal, Marke)

| Runde | Ereignis | Inhalt | Wahlen → Merkzeichen |
|---|---|---|---|
| 1–2 | `k3_thomas_heimkehr` (visitor: thomas, tableau) | Thomas am Bahnhof, erwachsen. Wer holt ihn ab – Jacob, Ruth, Silas? (Termin, Beziehung) | |
| 3–6 | `k3_thomas_weg` (**Schlüsselszene**) | Thomas will … je nach Erziehung: Vertriebschef für die neue Marke (`thomas_internat`/`thomas_buero`: Geschäftssinn); auf die Felder (`thomas_felder`); weg (vernachlässigt: Ehrgeiz hoch, Loyalität niedrig – zu Margaret Crane, in die Armee bei `zs2_export_krieg`, zu Nora oder Delgado mit `thomas_wahrheit`). | in die Firma, mit Titel (`thomas_firma`, Rat misstraut) · erst auf die Felder (`thomas_feld`, bei Silas wenn `silas_freund`) · seinen Weg gehen lassen (`thomas_eigener_weg`) · ihn zwingen (`thomas_gezwungen`, Loyalität −) |
| 8+ | `k3_thomas_idee` (nur `thomas_firma`) | Thomas will Gratis-Straßenkarten und Plakate – „wie die Crane-Frau“. | vertrauen (Marke +, Kosten) · ablehnen (Thomas −) |
| 8+ | `k3_thomas_evelyn` | Thomas trifft Evelyn Crane auf dem Vandermeer-Ball. Margaret schreibt Jacob einen Brief. | fördern (`heirat_crane_saat`) · verbieten (`heirat_crane_verboten`) · nichts sagen |
| 12+ | `k3_thomas_bruch` (nur `thomas_gezwungen` oder Beziehung niedrig) | Thomas kündigt vor dem Rat. | halten (Preis: Anteile) · gehen lassen (`thomas_bruch` – Saat für „Rivale“) |

**Ausgänge:** `thomas_firma` · `thomas_feld` · `thomas_eigener_weg` · `thomas_bruch` · `heirat_crane_saat`.

### Bogen C – Wendepunkt der Ehe (Familie, Stand, Konsortium)

Der Wendepunkt ist kein einzelnes Ereignis, sondern eine Folge von drei Proben. Am Ende entscheidet
sich der Ausgang aus den K2-Merkzeichen, dem Beziehungswert `ruth` und den drei Proben.

| Runde | Ereignis | Probe |
|---|---|---|
| 3–6 | `k3_ruth_ball` (**Schlüsselszene**) | Der Vandermeer-Ball (Aufnahme in die Gesellschaft). Eine Dame fragt Ruth, ob sie „früher in einem Laden“ gearbeitet habe. Jacob kann Ruth verteidigen (Stand −), das Thema wechseln oder lachen. |
| 7–10 | `k3_ruth_vale` | Mr. Vales Einladung liegt auf dem Tisch (Bogen D). Ruth hat sie gelesen. Fragt Jacob sie? (mit `ruth_aufsichtsrat`/`ruth_finanzen`: sie hat ein Stimmrecht darüber; mit `ruth_zuhause`: sie hat sie zufällig gefunden) |
| 9–13 | `k3_ruth_abwesend` | Jacob war in diesem Jahr sechs Wochen zu Hause. Ruth zählt sie nicht mehr. (Kommt nur bei niedrigem Beziehungswert.) |
| 13–16 | `k3_ruth_wendepunkt` (**Schlüsselszene**, visitor: ruth) | Ruth sitzt im Arbeitszimmer, in dem sie früher die Bücher führte. Sie hat entschieden – und gibt Jacob eine letzte Wahl. |

**Ausgänge *(V)*:**
- `ehe_partner` – sie wird seine stärkste Partnerin: unterschreibt mit, Kontrolle sicher, Kraft +.
  (Wahrscheinlich bei `ruth_aufsichtsrat`/`ruth_finanzen` und gefragter Vale-Probe.)
- `ehe_waffenstillstand` – sie bleibt, eigenes Leben, eigenes Geld (`ruth_eigenes_geschaeft`).
- `ehe_trennung` – sie geht zu Hannah, mit ihren Anteilen (GDD §12: „Scheidung mit Anteilen“).
  Wem verkauft sie? Thorne, Margaret oder niemandem – je nachdem, wie Jacob sich trennt.
  *(Wahrscheinlich bei `ruth_verboten`, `ruth_zuhause` + niedriger Beziehung.)*
- Die letzte Wahl lässt auch beim Trennungspfad eine Umkehr zu – teuer (Anteile, Termine, ein
  öffentlicher Verzicht, z. B. die Vale-Einladung ablehnen).

### Bogen D – Mr. Vales Einladung (Konsortium)

- `k3_vale_karte` (`mail: personal`, Runde 6–9): Eine Karte mit Wappen, Schloss Hohenbrück *(V)* in
  Aldmark. „Man trifft sich, wie es ist.“
- `k3_vale_schloss` (**Schlüsselszene**, Reise: 3 Termine, Kraft −): Ein Saal, sieben Männer,
  Ashcombe von Royal Aldmark *(V: Vorschau auf Kapitel 5)*, eine Landkarte mit Linien. Pruett oder
  Margaret sitzt am Tisch.
  - annehmen → `konsortium_mitglied` (Quoten, stabile Preise; Nora und Delaney werden es irgendwann wissen)
  - ablehnen → `konsortium_abgelehnt` (Preisdruck in der nächsten Krise)
  - zum Schein annehmen und Unterlagen sammeln → `konsortium_ausgespielt` (Weg „bekämpfen“/„ausspielen“;
    mit `nora_verbuendet` oder `delaney_kronzeuge` öffnet sich der Weg zum Ende „Der Enthüller“)
- **Anknüpfungen:** `vale_geld` + `vale_k2_genutzt` („Sie sind schon lange Mitglied, Mr. Harlan. Heute
  unterschreiben Sie es nur.“) · `vale_abgelehnt` + `vale_k2_verbrannt` (Vale lädt ihn ein, *weil* er
  ablehnt) · `vale_k2_verraten` (die Einladung ist eine Falle; im Saal fehlt ein Stuhl für ihn).

### Bogen E – Clara mit 15–18 (Familie)

- `k3_clara_artikel`: Clara liest Noras Serie laut beim Frühstück.
- `k3_clara_delgado`: Clara war heimlich auf einer Versammlung des Verbands; Delgado bringt sie heim.
- `k3_clara_internat` oder `k3_clara_buero`: Schule im Osten oder Mitarbeit im Sommer.
- Merkzeichen für Zeitsprung III („Clara wählt ihren Weg“): `clara_wahrheit`, `clara_delgado`,
  `clara_nora`, `clara_buero`, `clara_internat`.

### Bogen F – Silas' letztes Kapitel

- `k3_silas_thomas` (`silas_freund`/`silas_geschuetzt` und `thomas_feld`): Silas lehrt Thomas das Bohren.
  Rührend, aber ein Unfall ist möglich.
- `k3_silas_erinnerungen` (`silas_k2_geopfert`, `silas_k2_hinausgeworfen`, `silas_kronzeuge`): Silas
  diktiert Nora seine Erinnerungen. Jacob kann ihn besuchen (Versöhnung, teuer) oder einen Anwalt schicken.
- `k3_silas_krank` (`certain` ab Runde 10): Silas ist krank. Haskell gibt ihm ein Jahr. (Die letzte
  Abrechnung folgt in Kapitel 5 – mit Silas oder seinem Testament, siehe §12.)

### Rivalen am Rand

- **Margaret Crane – Kampf um die Marke:** Preiskampf an der Zapfsäule, abgeworbene Tankstellenpächter,
  Heiratssaat (Bogen B).
- **Thorne bläht Aktien auf:** Er bietet Jacob an, Harlan-Aktien gemeinsam „zu pflegen“ (Kursmanipulation,
  Hitze); im Crash will er sie gegen Jacobs Kredite verrechnen.
- **Bullard verschuldet sich:** `k3_bullard_bitte` – er „bietet an“, ihm Okara-Quellen abzukaufen. Kaufen,
  retten, fallen lassen (Vorlauf für Kapitel 4: „Bullard am Abgrund“). Seine Söhne Wade und Cole stehen dabei.
- **Pruett wartet** – auf Jacobs Fehler beim Kauf auf Kredit.

---

## 8. Anknüpfungen: Kapitel-1-Merkzeichen und wo sie zurückkommen

Stand der Kapitel-1-Ereignisse auf `main` (04.10.2026). Der parallele Kapitel-1-Workflow (~70 Ereignisse)
kann neue Merkzeichen hinzufügen – **bitte nachtragen** und die Gründe in `content/relevance.yaml`
(`later:`) auf das Kapitel zeigen lassen, das sie abfragt.

| Merkzeichen (K1) | Kapitel 2 | Kapitel 3 |
|---|---|---|
| `geburt_dabei` / `geburt_verpasst` | Ruth erwähnt es bei Claras Geburtstag | Thomas' Heimkehr: wer holt ihn ab |
| `thomas_wort_dabei` / `thomas_wort_verpasst` | Thomas' Schule (Startwert Loyalität) | Thomas' Weg |
| `ruth_buchhalterin` | Ruths Wunsch: Finanzen | Ehe-Proben |
| `ruth_teilhaberin` | Ruths Wunsch: Rat | Ehe: Partnerin wahrscheinlich |
| `ruth_vertroestet` | „Das Datum aus der Kiste“ | – |
| `ruth_zurueckgewiesen` / `ruth_beiseite` | Ruths eigenes Geschäft | Trennung wahrscheinlicher |
| `silas_fair` / `silas_freund` | Silas im Rat (B1) | Silas lehrt Thomas |
| `silas_gedeckt` | Pettibones Unfallakte | – |
| `silas_gedemuetigt` | Silas stimmt gegen Jacob | – |
| `silas_ausgekauft` / `silas_abschied_gut` | Silas als Kunde (B2) | – |
| `silas_betrogen` / `silas_versoehnt` / `silas_kronzeuge` | Silas als Zeuge (B3), Delaney | Silas' Erinnerungen an Nora |
| `moss_fair` | Ezekiel und die Pipeline | Beerdigung (Sarg tragen) |
| `moss_feind` / `moss_betrogen` / `moss_vertrieben` | Daniel hinter Delaney | Daniels Akte |
| `moss_verloren` | – | Daniel kommt als Fremder |
| `moss_abgewiesen` | – | Daniel: „Sie haben damals Nein gesagt. Das ist kein Verbrechen.“ |
| `daniel_gefoerdert` | Daniels Bewerbung | Fairness statt Gefälligkeit |
| `daniel_entschuldigung` | – | „Trost oder Beweis“ |
| `wegerecht_moss` / `wegerecht_moss_versoehnt` | Pipeline über die Moss-Weide | Daniel: keine Enteignung zu finden |
| `nora_ehrlich` / `nora_respekt` / `nora_interview` | Nora kommt zuerst zu Jacob | Langes Gespräch fürs Buch |
| `nora_bestechung` / `courier_gekauft` | Das Notizbuch mit dem Ausschnitt | Bixby als Pressesprecher |
| `nora_abgewiesen` / `nora_beschwert` / `nora_kein_gespraech` | Artikel ohne Jacob | – |
| `vale_geld` / `vale_abgelehnt` | Vales Insiderwissen | Vales Einladung |
| `crane_abgelehnt` / `crane_treue` / `crane_abschlag` | Cornelius' letztes Angebot; Delaneys Beweisstück | Margaret/Pruett erinnern sich |
| `delgado_verband` | Gründungsmitglied | Delgado als Gegnerin mit Clara |
| `thorne_vertrag` / `thorne_exklusiv` / `thorne_abgelehnt` / `thorne_mengenrabatt` | Strohmänner früher/später; Delaney fragt nach Frachtverträgen | Thorne und die Aktienpflege |
| `bullard_handschlag` / `bullard_fehde` / `bullard_verraten` / `bullard_rache` / `bullard_schuld` | Kartell oder Krieg; Thomas' Prügelei | Bullards Bitte, seine Söhne |
| `sheriff_bezahlt` / `sheriff_umgangen` / `drohung_sheriff` / `drohung_aufgehoben` | Tatum als Fixer | Daniels Akte |
| `eli_versorgt` / `eli_waechter` / `eli_im_stich` | Eli als Sicherheitschef / vor dem Werkstor | Claras Freundin |
| `kerrigan_eingestellt` / `kerrigan_lager` / `kerrigan_verheizt` | Kerrigan zählt Fässer / Silas am Grab | Daniels Akte (Arbeiterschutz) |
| `trupp_gedeckt` / `trupp_unmut` / `trupp_sonntag` | Arbeiter-Ruf Startwert; Bruder Abel | Gewerkschaftssaat |
| `pike_urkunde_falsch` / `pike_pacht_gekauft` | – | Daniels Akte |
| `hale_beteiligt` / `hale_gutachten_falsch` | Dr. Hale (Geologe) bietet Seismik-Vorläufer an *(V)* | Seismik |
| `bank_kredit` / `wechsel_gehalten` / `wucher_kredit` | Pettibone im Rat; Rourkes Wissen | Rating-Startwert |
| `wegerecht_bahndamm` / `bohlenweg` / `brand_geholfen` | Alltag: alte Nachbarn | – |
| `ruth_anteil` (Ereignis) → s. o.; `volksbund_spende`, `handelspartei_spende`, `liga_petition` (falls gesetzt) | Partei-Gefallen in Hallstead | Lobbyist knüpft an |
| Zeitsprung: `zs1_*`, `zs2_*` | siehe §2 | siehe §2 |

---

## 9. Themen für Alltagsereignisse je Kapitel

Richtwert *(V)*: je Kapitel rund 60–70 Ereignisse wie in Kapitel 1 – etwa 20 Story, 45 Alltag. Alltag
in Paketen zu je 10–13, je Paket ein System. Jedes Paket greift mindestens drei Merkzeichen aus dem
Vorkapitel auf.

### Kapitel 2 – Der Herausforderer

| Paket | System (Branch) | Themen und Haken |
|---|---|---|
| 1 Raffinerie | Raffinerie & Produktmix (4.6) | Kessel undicht – abschalten oder durchfahren; Greaves will Cracken erforschen; Arbeiter mit Verbrennungen; saures Rohöl aus Okara; Kerosinpreis fällt, Benzin steigt (`zs1_benzin_frueh`); Nachbarn klagen über Gestank; Brand in der Destillation (tableau) |
| 2 Pipeline | Pipelines (4.7) | Wegerechte (Moss, Witwe Pruitt, Bahndamm-Witwe); Thornes Leute sägen nachts; Wachleute anheuern; Transportpflicht – Delgado will durch Jacobs Rohr; Leck auf der Weide; Silas als Kunde (B2) |
| 3 Aktien und Rat | Aktien & Aufsichtsrat, Anleihen (4.8) | Dividende oder Reinvestition; Kleinaktionär schreibt Briefe; ein Gerücht drückt den Kurs; Anleihe bei Vandermeer & Co.; Strohmänner (Thorne); Hauptversammlung; Martha Hale will Sicherheit |
| 4 Personal | Sekretärin, Fixer (4.9) | Ada Pell sortiert die Post; Fixer-Auftrag (Spion bei Bullard?); Buchhalter findet Unterschlagung; ein Gewissenhafter verweigert einen Befehl; Abwerbung durch Pruett |
| 5 Rivalen-Diplomatie | Diplomatie / Crane-Nachfolge (4.10) | Kartellangebot Bullard; Margaret oder Pruett; Delgados Verband; Übernahme eines kleinen Wildcatters (alte Bekannte aus K1); Preisabsprache und Hitze |
| 6 Ermittler und Forschung | Ermittler, Technikstufe II (4.11) | Delaneys Vorladung; Zeugen, die sich erinnern; ein Patent aus Aldmark; Forscher will Geld; Spionage gegen Greaves |
| 7 Familie, Presse, Politik | Weltmodell Block A | Thomas' Schule, Claras Fragen, Ruths Abende; Noras Serie; Einkommensteuer droht; Marine stellt auf Öl um (Heizölvertrag in Sicht); Volksbund-Kundgebung; Spannung Aldmark–Varenhold in der Zeitung |

### Kapitel 3 – Der Konzernherr

| Paket | System (Branch) | Themen und Haken |
|---|---|---|
| 1 Marke und Tankstellen | Marke, Tankstellen (4.14) | Plakate, Gratis-Straßenkarten, ein Name für die Marke; Pächter wechselt zu Crane Eastern; Preiskampf an der Zapfsäule; Tanklaster verunglückt; Skandal trifft die Marke |
| 2 Börse | Börse, Kauf auf Kredit (4.15) | Aktientipp vom Friseur (volle Tanks in der Zeitung!); Thornes Aktienpflege; Thomas will Autoaktien; Margin Call; Ruth rät ab |
| 3 Nebeninvestments und Lobby | Investments, Lobbyist (4.15/Investments) | Land in Boomtowns; eine Zeitung kaufen (Nora wechselt); Dunmore und die Gefallen; Grady und das Reserveland (`zs2_grady_reserveland`); Steuerabzug für Ölvorkommen |
| 4 Seismik und Konsortium | Seismik (Technikstufe III), Konsortium | Dr. Hale mit der Erschütterungsmessung; Messtrupp in fremdem Land; Konsortiums-Quoten im Alltag („drosseln Sie Okara um ein Zehntel“); Ashcombe-Briefe |
| 5 Stand | Aufnahme in die Gesellschaft | Club-Aufnahme, Kirchenvorstand, Wohltätigkeitsball, Porträtmaler, Stiftung eines Krankenhauses (Ruf vs. Stand); Cornelia Vandermeer |
| 6 Arbeiter und Boomtowns | Ruf Arbeiter, Weltmodell | Firmenladen oder Schule; Bruder Abel und die ersten Gewerkschaftsflugblätter; versiegtes Feld, sterbende Stadt; Unfall mit Witwe |
| 7 Familie, Presse, Justiz | Familie, Ermittler | Thomas und Evelyn; Claras Versammlung; Haskell und Jacobs Herz; Daniels Vorladungen; Noras Buch |

---

## 10. Wunschliste: neue Effekt-Arten, Bedingungen und Darstellung

Heute können Ereignisse: `cash`, `oilStock`, `railTariff`, `strength`, `ruth`, `thomas`, `teams`,
`teamsIdle`, befristet `price`, `production`, `leaseCost` (siehe `content/events/README.md`). Für
Kapitel 2 und 3 brauchen die Ereignisse mehr. Vorschlag für die Integration, sortiert nach Wichtigkeit
(**M** = Muss für die Story-Bögen, **S** = Soll, **K** = Kann). Namen *(V)*.

### Effekte

| Effekt | Bedeutung | Wert | System | Priorität | Beispiel |
|---|---|---|---|---|---|
| `clara` | Beziehung zu Clara | ±0–100 | Familie | M | Claras Frage |
| `family: { name: ±n }` | allgemeine Form für weitere Familienmitglieder (Erben, Schwiegerkinder) | ±n | Familie | S | Evelyn, Enkel |
| `heirValues: { thomas: { business, moral, loyalty, ambition } }` | Werte des Erben (GDD §12) | ±1–2 | Erziehung | M | Internat, Wahrheit |
| `reputation: { public, politics, workers, industryRespect, industryFear }` | Ruf, vier Achsen (Branche geteilt) | ±n (−100…100) | Ruf | M | Silas decken, Nora, Arbeiter |
| `heat` / `trace: { severity, label }` | Hitze bzw. Spur im Schattenbuch (Schwere 1–5) | +n | Ermittler | M | Schweigegeld, Bestechung |
| `favors` | Gefallen (politische Währung) | ±n | Politik/Lobbyist | M | Grady, Dunmore |
| `control` | Kontrolle in %-Punkten (Anteile übertragen) | ±n | Aktien | M | Ruth bekommt Anteile |
| `shares: { holder: ±% }` | Anteile zwischen Personen verschieben (Ruth, Silas, Thorne-Strohmann, Thomas) | ±% | Aktien | M | Silas auskaufen, Trennung |
| `boardLoyalty: { member: ±n }` | Loyalität eines Rats | ±n | Aktien | M | Vandermeer zurechtweisen |
| `sharePrice` | Kurs, befristet in % | ±0,0x | Aktien/Börse | M | Gerücht, Skandal |
| `dividendPressure` | Druck des Rats auf Dividende | ±n | Aktien | K | Bankier-Ereignisse |
| `rating` | Kreditwürdigkeit eine Stufe hoch/runter oder Punkte | ±n | Bank | S | Ruth als Finanzchefin |
| `refineryOutput` | Durchsatz, befristet | ±% | Raffinerie | M | Kessel undicht |
| `refineryDown` | Raffinerie steht n Runden still | n | Raffinerie | M | Brand |
| `productYield: { gasoline, kerosene, fuelOil }` | Ausbeute je Produkt, befristet oder dauerhaft | ±% | Raffinerie | S | Greaves' Trick |
| `productPrice: { gasoline, kerosene, fuelOil }` | Preis je Produkt, befristet | ±$ | Markt | S | Marineauftrag |
| `pipelineDown` / `pipelineThroughput` | Pipeline steht still / Kapazität | n / ±% | Pipeline | M | Sabotage, Leck |
| `transportFee` | Tarif für fremdes Öl in der eigenen Pipeline | ±$ | Pipeline | S | Silas' Tarif |
| `rightOfWay: parcel` | Wegerecht erteilen/entziehen | id | Pipeline | S | Moss-Weide |
| `staffLoyalty: { role: ±n }` / `hire: role` / `fire: role` | Personal | ±n | Personal | M | Fixer, Greaves |
| `rival: { name: { relation, aggression, trust } }` | Beziehung zu einem Rivalen | ±n | Diplomatie | M | Margaret/Pruett |
| `rivalStake: { name: ±% }` | Rivale kauft/verkauft Harlan-Aktien | ±% | Aktien | S | Thornes Strohmänner |
| `investigation: ±stage` / `evidence: ±n` | Ermittlungsstufe (Gerücht → Urteil) bzw. Beweise | ±1 | Ermittler | M | Delaney, Daniel |
| `research: { field: ±n }` | Forschungsfortschritt | ±n | Forschung | S | Cracken, Seismik |
| `brand: { region: ±n }` | Markenbekanntheit je Region | ±n | Marke | M | Plakate |
| `stations: { region: ±n }` | Tankstellen gewinnen/verlieren | ±n | Tankstellen | S | Pächter wechselt |
| `pumpPrice: { region: ±$ }` | Preis an der Zapfsäule, befristet | ±$ | Marke | K | Preiskampf |
| `margin` / `marginCall` | Hebel bei Kauf auf Kredit / Nachschussforderung auslösen | | Börse | S | Aktientipp |
| `investment: { kind: ±$ }` | Nebeninvestment kaufen/verkaufen | | Investments | S | Zeitung, Boomtown-Land |
| `influence` | Einfluss des Lobbyisten in Hallstead | ±n | Lobbyist | S | Dunmore |
| `standing` | Stand / Aufnahme in die Gesellschaft | ±n | Stand | M | Ball, Club |
| `consortiumDebt` / `consortiumPower` | Schuld beim Konsortium / Macht des Konsortiums | ±n | Konsortium | M | Vales Insiderwissen |
| `legacy` | Vermächtnis (verdeckt) | ±n | Enden | M | fast jede moralische Wahl |
| `mood` | öffentliche Stimmung (Weltmodell, Block A: `mood` 0–100) | ±n | Weltmodell | M | Noras Serie, Streik |
| `party: { handel, volksbund, provinz }` | Parteianteile verschieben (Spenden, Kampagnen) | ±0,0x | Weltmodell | S | Spenden |
| `lawPressure: { law: ±n }` | Wahrscheinlichkeit eines Gesetzes (fordern/verhindern) | ±n | Gesetze | S | Kartellgesetz, Transportpflicht |
| `credit` | Kreditklima (Block A) | ±n | Weltmodell | K | Thornes Spekulation |
| `tension` | Außenspannung (Block A) | ±n | Weltmodell | K | Export an Aldmark |
| `appointmentsNext` | Termine in der nächsten Runde | ±n | Termine | K | Reise nach Aldmark |

### Bedingungen

| Bedingung | Wozu | Priorität |
|---|---|---|
| `chapter` / `minChapter` | Ereignis nur in Kapitel n | M |
| `minRuth`/`maxRuth`, `minThomas`/`maxThomas`, `minClara`/`maxClara` | Ehe- und Kinderbögen je nach Beziehung | M |
| `minControl`/`maxControl` | Strohmann-Schock nur bei knapper Kontrolle | M |
| `minHeat`/`maxHeat`, `investigationStage` | Delaneys zweite Akte, Daniels Ermittlung | M |
| `hasRefinery`, `hasPipeline`, `minStations`, `minBrandRegions` | System-Alltag nur, wenn das System besteht | M |
| `boardMember: name` | Rats-Ereignisse nur, wenn die Person im Rat sitzt | M |
| `staff: role` | Fixer-/Sekretärin-Ereignisse | M |
| `government: party`, `law: name` (gilt), `minMood`/`maxMood`, `crash`, `war` | Weltlagen (Block A) | M |
| `rivalState: { crane: zerschlagen \| margaret \| pruett }` | Crane-Nachfolge | S |
| `minSharePrice`, `minStanding`, `minReputation: { axis: n }` | Börse, Stand, Ruf | S |
| `anyMarked: [a, b]` | „eins davon“ (heute heißt `marked` „alle“) – spart viele Doppel-Ereignisse | M |

### Merkzeichen über Kapitel hinweg

- Merkzeichen müssen im Spielstand von Kapitel zu Kapitel erhalten bleiben (heute: „für die ganze
  Partie“ – mit Zeitsprung bitte prüfen).
- `content/arcs.yaml` je Kapitel erweitern (Bögen `ruth_k2`, `silas_k2`, `nora_k2`, `crane_k2`,
  `daniel_k3`, `thomas_k3`, `ehe_k3`), damit der Kapitelabschluss „Was aus ihnen wurde“ zeigt.
- `npm run check:content` müsste kapitelübergreifend prüfen: Ein `k3`-Ereignis darf auf ein `k1`-Merkzeichen warten.

### Darstellung (Besucher)

Neue Figuren-Schlüssel für `content/figures.yaml` *(V)*:

| Schlüssel | Silhouette | Name |
|---|---|---|
| `clara` | `kind` (K2) / `frau` (K3) | Clara |
| `margaret` | `frau` | Margaret Crane |
| `pruett` | `zylinder` | Mr. Pruett |
| `delgado` | `frau` | Rosa Delgado |
| `delaney` | `hut` | Mr. Delaney |
| `vale` | `zylinder` | Mr. Vale |
| `vandermeer` | `frau` | Mrs. Vandermeer |
| `grady` | `zylinder` | Senator Grady |
| `sekretaerin` | `frau` | Miss Pell |
| `fixer` | `hut` | Tatum / Eli Ward (Name je nach Weiche – braucht dynamischen Namen) |
| `greaves` | `kopf` | Mr. Greaves |
| `dunmore` | `zylinder` | Mr. Dunmore |

Wünsche an die Darstellung: Silhouette altersabhängig (Thomas wächst: `kind` → `kopf`), dynamischer
Name je Merkzeichen (Fixer), eine Silhouette „Greis/Stock“ für Silas, Cornelius und Ezekiel.

---

## 11. Konventionen für die Schreiber

- **Dateien:** `content/events/k2-<n>-<thema>.yaml`, `k3-…` analog (Kapitel vorn, wie in Kapitel 1).
  Story-Bögen eigene Dateien (`k2-1-ruth.yaml`, `k2-2-silas.yaml`, `k2-3-nora.yaml`, `k2-4-crane.yaml`,
  `k2-5-delaney.yaml`, `k3-1-daniel.yaml`, `k3-2-thomas.yaml`, `k3-3-ehe.yaml`, `k3-4-vale.yaml`).
- **ids:** `k2_…` / `k3_…` als Präfix, damit sie mit Kapitel 1 nicht kollidieren.
- **Merkzeichen:** `figur_was` wie in Kapitel 1 (`ruth_aufsichtsrat`, `daniel_anklage`); bei
  Namensdopplung mit K1 ein `_k2`/`_k3` anhängen (`silas_k2_geopfert`). Jedes neue Merkzeichen, das
  erst in einem späteren Kapitel wirkt, kommt mit Grund in `content/relevance.yaml`.
- **Schlüsselszenen:** `draft: true` und Kommentar `# Entwurf – Philipp überarbeitet.` darüber.
- **Besucher:** `visitor:` nur, wenn die Person wirklich ins Büro kommt (README 0.2.15+11). Ab Kapitel 2
  hat Jacob ein richtiges Büro mit Vorzimmer – Ada Pell meldet an.
- **Bis die neuen Effekte da sind:** mit vorhandenen Effekten und Merkzeichen schreiben, die gewünschten
  Effekte als Kommentar daneben (`# WUNSCH: control: -3, boardLoyalty: { vandermeer: -10 }`), damit die
  Integration sie findet. `npm run check:content` und `check:events` müssen grün bleiben.
- **Zweisprachig** wie in Kapitel 1 (`de`/`en`).
- **Zehn Jahre spüren lassen:** In jedem Story-Ereignis ein Detail, das gealtert ist (die Brille, das
  Haus, die Uhrkette, der Husten).

---

## 12. Offene Fragen an Philipp

1. **Alter:** Sind die vorgeschlagenen Alter (Ruth 23, Silas 44, Ezekiel 46, Daniel 15, Nora 22 bei
   Spielbeginn; Clara geboren Jahr 6) in Ordnung? Silas wäre in Kapitel 5 (GDD: „letzte Abrechnung mit
   Silas“) 84 – Abrechnung mit ihm selbst oder mit seinem Testament/Erben?
2. **Namensnähe:** Harold **Pruett** (GDD) vs. **Anwalt Pruitt** und **Witwe Agnes Pruitt** (Kapitel 1)
   – einen der Namen ändern? Ebenso **Dr. L. Hale** (Geologe, K1-Dokumente) vs. **Martha Hale** (Witwe,
   Karte) – verwandt machen oder umbenennen?
3. **Margaret Crane:** Tochter von Cornelius (Vorschlag) oder Schwiegertochter? Evelyn Crane als
   Heiratssaat für Thomas?
4. **Noras „erster Artikel“:** In Kapitel 1 erscheint schon ein Courier-Artikel (`nora_artikel`).
   Vorschlag: Kapitel 2 = ihr erster großer Artikel in Hallstead (im *Hallstead Ledger*). Passt das?
5. **Daniel Moss in Kapitel 2** in Delaneys Büro (Feind-Variante) – zu viel Zufall, oder gerade richtig?
6. **Ehe-Trennung:** Wem verkauft Ruth ihre Anteile – soll das der Spieler beeinflussen können?
7. **Neue Figuren:** Ada Pell, Walter Greaves, Lionel Dunmore, Ambrose Vandermeer, Wade und Cole Bullard,
   Evelyn Crane, Mr. Quill (Notfall-Fixer), Mr. Sayles (Strohmann) – alle umbenennbar.
8. **Moss' Tod in Kapitel 3** als feste Szene (`certain`) – oder nur, wenn die Familie noch in Cordova lebt?
