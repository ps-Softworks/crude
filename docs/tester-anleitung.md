# CRUDE – Tester-Build verteilen (Schritt 1.16)

Kurzanleitung für Philipp: vom ZIP zur privaten itch.io-Seite, Fragebogen anlegen, Tester einladen.
Die Bezeichnungen auf itch.io können sich leicht ändern – sinngemäß ist es immer dasselbe.

> **Neue Oberfläche (ab 0.2.15+10):** Statt einer langen Seite gibt es einen Schreibtisch, auf dem man
> Gegenstände anklickt (Briefe, Zeitung, Kassenbuch, Wandkarte, Glocke …) – jeder mit Namensschild und Taste.
> Besucher klopfen an die Tür und reden mit Jacob, große Momente (Geburt, Brand) kommen als Vollbild-Szene.
> Die Karte öffnet sich über die Wandkarte (Taste K), rechts daneben das Ranch-Fenster. Beim ersten Start
> zeigt ein kurzer Rundgang jeden Gegenstand einmal (im Menü wiederholbar). Die Seite scrollt nicht.
> Aktuelle Bilder: `npm run screenshots` legt sie in `docs/screenshots/` ab und prüft dabei, dass bei
> 1280×800, 1440×900 und 1920×1080 nichts scrollt.

## 1. Fragebogen anlegen (zuerst, damit der Link ins Spiel kann)

1. Auf <https://forms.google.com> ein neues Formular anlegen, Titel z. B. „CRUDE – Feedback zum Tester-Build“.
2. Den Hinweistext und die 6 Fragen aus `docs/tester-fragebogen.md` übernehmen
   (Frage 1: Multiple Choice, Frage 2: „Linearer Maßstab“ 1–5 plus Absatz, Fragen 3–5: Absatz,
   Frage 6: Multiple Choice plus Absatz).
3. Einen zweiten **Abschnitt** anlegen für die Einwilligung (Ja/Nein) und das Kontaktfeld – getrennt von den 6 Fragen.
4. In den Formular-Einstellungen **„E-Mail-Adressen erfassen“ ausschalten**, sonst ist die Umfrage nicht mehr anonym.
5. Oben auf „Senden“ → Link-Symbol → Link kopieren (z. B. `https://forms.gle/…`).
6. Den Link in `content/tester.yaml` eintragen:

   ```yaml
   feedbackUrl: "https://forms.gle/DEIN-LINK"
   ```

   Ist das Feld leer, zeigt das Spiel keinen „Feedback geben“-Knopf.

## 2. ZIP bauen

```bash
npm run release
```

Ergebnis: `release/crude-<version>.zip` (z. B. `release/crude-0.1.14+2.zip`). Das Skript prüft selbst, dass `index.html` ganz oben im ZIP liegt und alle Pfade relativ sind.
Nach jeder Änderung (auch nach dem Eintragen des Fragebogen-Links) neu bauen.

## 3. Private Seite auf itch.io anlegen

1. Auf itch.io einloggen → **Dashboard** → **Create new project**.
2. **Title:** CRUDE · **Kind of project:** **HTML** (wichtig, sonst lässt es sich nicht im Browser spielen).
3. **Uploads:** den ZIP hochladen und beim Upload den Haken **„This file will be played in the browser“** setzen.
4. **Embed options:**
   - **Viewport dimensions:** 1280 × 800 (das Spiel ist für breite Bildschirme gebaut; der Schreibtisch passt genau hinein)
   - **Fullscreen button** anschalten
   - **Enable scrollbars** aus lassen (ab 0.2.15+9 scrollt die Seite nicht mehr)
   - „Mobile friendly“ aus lassen
5. **Visibility & access:** **Restricted** wählen und ein **Passwort** setzen – oder das Projekt als **Draft** lassen und den **Secret URL**-Link nehmen, den itch.io nach dem Speichern anzeigt. Beides ist nicht öffentlich auffindbar.
6. **Save** → **View page** und selbst einmal durchklicken: Startet das Spiel? Steht oben die richtige Version? Ist „Feedback geben“ da und öffnet das Formular?
7. Tipp: Spielstände speichert der Browser des Testers (Autosave). Wer den Browser wechselt oder im privaten Fenster spielt, fängt neu an – das Spiel läuft trotzdem.

Neue Version: auf der Projektseite **Edit game** → alten Upload löschen, neuen ZIP hochladen, Haken „played in the browser“ wieder setzen.

Ohne itch.io geht es auch: den ZIP direkt verschicken. Der Tester entpackt ihn und öffnet `index.html` – das klappt aber nicht in jedem Browser direkt von der Festplatte; itch.io ist der sichere Weg.

## 4. Tester einladen

Link (und ggf. Passwort) an 3–5 Leute schicken. Vorlage:

> Hallo [Name],
>
> ich baue gerade ein Spiel: **CRUDE**, ein Wirtschaftsspiel über einen Öl-Wildcatter in den 1880ern – Land pachten, bohren, hoffen, die Bank im Nacken und einen Rivalen, der dir die besten Parzellen wegschnappt.
>
> Es ist ein früher Test (schlichte Platzhaltergrafik). Hättest du Lust, das erste Kapitel zu spielen? Das sind 16 Runden, geschätzt 30–60 Minuten, am besten am Stück und am Computer.
>
> Link: [itch.io-Link]  
> Passwort: [Passwort]
>
> Danach würde ich mich sehr über 5 Minuten Feedback freuen – über den Knopf „Feedback geben“ im Spiel oder direkt hier: [Formular-Link]. Ehrliche Kritik hilft mir am meisten.
>
> Im Formular frage ich am Ende auch, ob ich dich später noch mal anschreiben darf (für Nachfragen oder die nächste Version). Das ist freiwillig.
>
> Danke dir!  
> Philipp

## 5. Auswerten (Gate 1)

Gate 1 ist geschafft, wenn 3–5 Tester die 16 Runden am Stück spielen und weitermachen wollen (Frage 2 überwiegend 4–5).
Kontaktadressen nur von denen aufheben, die zugestimmt haben, und löschen, wenn jemand darum bittet.
