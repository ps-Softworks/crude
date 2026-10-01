"""Baut docs/papierprototyp.html – Roadmap-Schritt 0.7.

Druckbogen für den Papierprototyp von Kapitel 1: Regeln, Karte, Geologiekarten,
Preis- und Schuldenleiste, Förder-/Erlöstabelle und Rundenbogen.
Alle Zahlen kommen aus den Startwerten des Tabellenmodells (0.6). Werte, die es
nur auf Papier gibt (Kartenmix, Würfeltabellen, Preisleiste), stehen unten als
ANNAHME und werden in 0.9 nachgeschärft.

Aufruf:  python3 tools/papierprototyp/build_papierprototyp.py [zieldatei]
Danach die HTML-Datei im Browser öffnen und drucken (A4, Hintergrundgrafiken an).
"""

import html
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ZIEL = ROOT / "docs" / "papierprototyp.html"

sys.path.insert(0, str(ROOT / "tools" / "tabellenmodell"))
from build_tabellenmodell import BESITZER, KREDIT, LAGEN, RATINGS, RUNDEN, STARTWERTE  # noqa: E402

P = {name: wert for name, _text, wert, *_rest in STARTWERTE}
P.update({name: wert for name, _text, wert, *_rest in KREDIT})
LAGE = {name: (bonus, roy) for name, bonus, roy, _q in LAGEN}
BES = {name: (faktor, zuschlag) for name, faktor, zuschlag, _b in BESITZER}
RATING = dict(RATINGS)
ROY_MIN, ROY_MAX = 0.10, 0.25  # GDD §5: Förderzins bleibt zwischen 10 und 25 %

# --- Papier-Werte (ANNAHME, nicht im Tabellenmodell) ---------------------
# Oberflächenzeichen: Inhalt des verdeckten Stapels und Mindest-Lage.
# Ölsicker sieht jeder – der Landbesitzer verlangt dort mindestens den Preis
# eines Nachbarn eines Funds.
ZEICHEN = {
    "S": dict(name="Ölsicker", lage="Nachbar eines Funds",
              karten={"Trocken": 3, "Klein": 1, "Fund": 1, "Gusher": 1}),
    "K": dict(name="Kuppe", lage="Randlage", karten={"Trocken": 8, "Klein": 1, "Fund": 1}),
    "F": dict(name="Flach", lage="Randlage", karten={"Trocken": 19, "Klein": 1}),
}
# Landbesitzer beim Pachten auswürfeln (W6).
BESITZER_WURF = {1: "gierig", 2: "verschuldet", 3: "misstrauisch", 4: "fromm",
                 5: "neutral", 6: "neutral"}
# Förderzins auf Papier gerundet auf diese Stufen (eine Spalte je Stufe in der Erlöstabelle).
ROY_STUFEN = [(0.10, "1/10"), (0.125, "1/8"), (1 / 6, "1/6"), (0.20, "1/5"), (0.25, "1/4")]
# Karte 6x6 – Ölsicker in einer Ecke gehäuft (Richtung Salt Hill).
KARTE = [
    "SSSKFF",
    "SSKKFF",
    "SKKFFF",
    "KKFFKF",
    "FKFFFF",
    "FFFFKF",
]
# Startrate je Fundart nach Würfelwurf (1–2, 3–4, 5–6), bbl/Tag; GDD §15: 50–500, Gusher mehr.
STARTRATE = {
    "Klein": (50, 75, 100),
    "Fund": (125, 150, 200),
    "Gusher": (400, 500, 700),
}
PANNE_KOSTEN = 500          # Wurf 1 beim Bohren: Gestänge verklemmt
PREIS_START = 1.00          # = Ölpreis im Tabellenmodell
PREIS_MIN, PREIS_MAX = 0.30, 1.50
PREIS_WURF = {1: -0.20, 2: -0.10, 3: 0.0, 4: 0.0, 5: 0.10, 6: 0.20}
PREIS_JE_NEUER_QUELLE = -0.10  # Ölschwemme: jede Quelle, die diese Runde zu fördern beginnt
KREDIT_SCHRITT = 500
BANK_LEISTE_MAX = 11000      # 3.000 $ + 4 Quellen × 2.000 $


# --- Rechenregeln (werden getestet) --------------------------------------
def preisstufen():
    n = round((PREIS_MAX - PREIS_MIN) / 0.10)
    return [round(PREIS_MIN + i * 0.10, 2) for i in range(n + 1)]


def marge_je_1000_bbl(preis, roy):
    """Was Jacob je 1.000 bbl behält: Preis minus Förderzins minus Fuhrwerk."""
    return 1000 * (preis * (1 - roy) - P["transport"])


def foerderung_kbbl(rate, alter):
    """Fördermenge eines Quartals in 1.000 bbl; alter 0 = erste Förderrunde."""
    return rate * P["days"] * (1 - P["decline"]) ** alter / 1000


def pacht(lage, besitzer):
    """(Bonus, Förderzins genau, Förderzins-Stufe) wie im Tabellenmodell, Bonus auf 10 $."""
    bonus, roy = LAGE[lage]
    faktor, zuschlag = BES[besitzer]
    genau = min(ROY_MAX, max(ROY_MIN, roy + zuschlag))
    stufe = min(ROY_STUFEN, key=lambda st: abs(st[0] - genau))
    return round(bonus * faktor / 10) * 10, genau, stufe


def bankzins(mit_pfand):
    basis = RATING[P["rating"]] + P["klima"]
    return basis - P["sicher_rabatt"] if mit_pfand else basis + P["ohne_aufschlag"]


def zinsen(schuld, jahreszins):
    return schuld * jahreszins / 4


def aufrunden(betrag):
    return -(-betrag // KREDIT_SCHRITT) * KREDIT_SCHRITT


def stapel():
    """Liste (zeichen, art) aller Geologiekarten."""
    return [(z, art) for z, d in ZEICHEN.items() for art, n in d["karten"].items() for _ in range(n)]


def trefferquote():
    karten = stapel()
    return sum(art != "Trocken" for _z, art in karten) / len(karten)


def trockenbohrungen_bis_pleite():
    """Jede Runde eine Trockenbohrung auf neuer Randlage-Pacht (neutraler Besitzer),
    Kredit nach Papierregeln: erst Bank, dann Geldverleiher, in 500-$-Schritten."""
    bar, bank, leiher, gebohrt = P["start_cash"], 0, 0, 0
    zins_bank = bankzins(mit_pfand=False)
    while True:
        bonus = pacht("Randlage", "neutral")[0] if gebohrt >= P["free_leases"] else 0
        rechnung = (P["drill_cost"] + bonus + zinsen(bank, zins_bank)
                    + zinsen(leiher, P["leiher_zins"]))
        fehlt = max(0, rechnung - bar)
        von_bank = min(aufrunden(fehlt), P["bank_grund"] - bank)
        von_leiher = aufrunden(fehlt - von_bank) if fehlt > von_bank else 0
        if von_leiher > P["leiher_rahmen"] * P["leiher_an"] - leiher:
            return gebohrt
        bank, leiher = bank + von_bank, leiher + von_leiher
        bar = bar + von_bank + von_leiher - rechnung
        gebohrt += 1


# --- HTML ----------------------------------------------------------------
def d(x):
    return f"{x:,.0f} $".replace(",", ".")


def c(x):
    return f"{x:.2f} $".replace(".", ",")


def k(x):
    return f"{x:.1f}".replace(".", ",")


ART_TEXT = {
    "Trocken": ("Trocken", "Nur Salzwasser und Sand."),
    "Klein": ("Kleiner Fund", "Würfeln: {}"),
    "Fund": ("Fund", "Würfeln: {}"),
    "Gusher": ("GUSHER", "Würfeln: {}"),
}


def regeln():
    s = ZEICHEN
    return f"""
<section class="seite">
<h1>CRUDE – Papierprototyp Kapitel 1</h1>
<p class="klein">Roadmap 0.7 · Zahlen aus dem Tabellenmodell (0.6), Stand vorläufig.
Du spielst Jacob Harlan, Frühjahr 88, Cordova. 16 Runden = 4 Jahre.</p>

<h2>Aufbau</h2>
<ol>
<li>Geologiekarten nach dem Buchstaben unten rechts in drei Stapel sortieren
(S = Ölsicker, K = Kuppe, F = Flach), jeden Stapel verdeckt mischen.</li>
<li>Auf jedes Feld der Karte verdeckt eine Karte aus dem Stapel mit dem passenden Zeichen legen.</li>
<li>Preismarker auf {c(PREIS_START)}, beide Schuldenmarker (Bank, Geldverleiher) auf 0.
Kasse: {d(P['start_cash'])}.</li>
<li>Jacob hat <b>{P['free_leases']} Pachtoptionen</b>: 2 Felder in Randlage ohne Bonus
(Besitzer trotzdem würfeln – er bestimmt den Förderzins).</li>
</ol>

<h2>Ablauf einer Runde</h2>
<ol>
<li><b>Preis:</b> W6 würfeln: 1 → −0,20 · 2 → −0,10 · 3–4 → bleibt · 5 → +0,10 · 6 → +0,20.
Dann −0,10 für jede Quelle, die <i>diese</i> Runde zum ersten Mal fördert (Ölschwemme).
Grenzen {c(PREIS_MIN)} bis {c(PREIS_MAX)}.</li>
<li><b>Förderung verkaufen:</b> Jede Quelle fördert laut Fördertabelle (Zeile = Startrate,
Spalte = wie oft sie schon gefördert hat). Je Quelle: 1.000 bbl × Erlös aus der Erlöstabelle
(Zeile = Preis, Spalte = Förderzins <i>ihrer</i> Parzelle). Fuhrwerk ({c(P['transport'])}/bbl)
ist dort schon abgezogen.</li>
<li><b>Silas:</b> Von den ersten {P['silas_wells']} Quellen bekommt Silas {P['silas_share']:.0%} des Erlöses.</li>
<li><b>Zinsen</b> laut Schuldenleisten. Bank: {bankzins(False):.0%} pro Jahr, solange keine
Quelle fördert; {bankzins(True):.0%}, sobald eine fördernde Quelle als Pfand dient.
Geldverleiher: {P['leiher_zins']:.0%}.</li>
<li><b>Pachten</b> (beliebig viele): Lage bestimmen, Landbesitzer würfeln
(1 gierig · 2 verschuldet · 3 misstrauisch · 4 fromm · 5–6 neutral), Bonus und
Förderzins aus der Pachttabelle ablesen und den Förderzins aufs Feld schreiben.
<br><i>Lage:</i> grenzt an eine Quelle (auch schräg) = Am Fund · zwei Felder entfernt =
Nachbar eines Funds · sonst Randlage. Ölsicker gilt immer mindestens als Nachbar eines Funds.</li>
<li><b>Bohren</b> (höchstens 1 Bohrung, nur auf eigener Pacht, ein Bohrturm):
{d(P['drill_cost'])} zahlen, W6 würfeln: bei 1 Panne, noch einmal {d(PANNE_KOSTEN)}.
Dann Karte aufdecken. Bei Fund Startrate würfeln. Die Quelle fördert ab der nächsten Runde.</li>
<li><b>Kredit</b> jederzeit in Schritten von {d(KREDIT_SCHRITT)}. Bank: Rahmen
{d(P['bank_grund'])} + {d(P['bank_je_quelle'])} je fördernde Quelle.
Geldverleiher: bis {d(P['leiher_rahmen'])}. Immer zuerst das billigere Geld leihen,
zuerst das teurere tilgen.</li>
<li><b>Rundenbogen ausfüllen</b> – vor allem die Spalte „Spannend?“.</li>
</ol>

<h2>Pleite</h2>
<p>Kannst du eine Rechnung weder aus der Kasse noch mit Kredit bezahlen, ist Jacob pleite.
Mit den Startwerten passiert das nach <b>{trockenbohrungen_bis_pleite()} Trockenbohrungen</b>
in Folge – die dritte geht nur noch mit dem Geldverleiher.</p>

<h2>Ende</h2>
<p>Nach Runde 16: Ergebnis = Kasse − alle Schulden. Notiere auch, in welcher Runde du dachtest
„jetzt ist es entschieden“.</p>

<h2>Material</h2>
<p>Ausdruck, Schere, 1 W6, zwei Marker (Münzen) für Preis und Schuld, Stift.
Optional Spielgeld; sonst die Kasse auf dem Rundenbogen führen.</p>
</section>"""


def karte_html():
    zeilen = []
    for reihe in KARTE:
        zellen = "".join(
            f'<td class="feld z{z}"><span>{ZEICHEN[z]["name"]}</span>'
            f'<small>Förderzins: ____</small></td>' for z in reihe)
        zeilen.append(f"<tr>{zellen}</tr>")
    return f"""
<section class="seite">
<h2>Karte – Cordova, Pachtgebiet am Salt Hill</h2>
<table class="karte">{''.join(zeilen)}</table>
<p class="klein">Auf jedes Feld eine verdeckte Geologiekarte mit demselben Buchstaben legen.
Gepachtete Felder mit einem Kreuz markieren, Quellen mit einem Kreis.</p>
</section>"""


def karten_html():
    teile = []
    for z, art in stapel():
        titel, text = ART_TEXT[art]
        if art in STARTRATE:
            r = STARTRATE[art]
            text = text.format(f"1–2: {r[0]} · 3–4: {r[1]} · 5–6: {r[2]} bbl/Tag")
        teile.append(f'<div class="kartei a{art}"><b>{html.escape(titel)}</b>'
                     f'<span>{html.escape(text)}</span><i>{z}</i></div>')
    return f"""
<section class="seite">
<h2>Geologiekarten ({len(teile)} Stück, ausschneiden)</h2>
<div class="kartenraster">{''.join(teile)}</div>
</section>"""


def leisten_html():
    roy_kopf = "".join(f"<th>{name}</th>" for _r, name in ROY_STUFEN)
    erloes = "".join(
        f'<tr><th class="{"start" if abs(p - PREIS_START) < 1e-9 else ""}">{c(p)}</th>'
        + "".join(f"<td>{d(marge_je_1000_bbl(p, r))}</td>" for r, _n in ROY_STUFEN) + "</tr>"
        for p in reversed(preisstufen()))
    bes_namen = [name for name, *_r in BESITZER]
    pacht_kopf = "".join(f"<th>{b}</th>" for b in bes_namen)
    pacht_zeilen = ""
    for lage in LAGE:
        pacht_zeilen += f"<tr><th>{lage}</th>"
        for b in bes_namen:
            bonus, _g, (_r, stufe) = pacht(lage, b)
            pacht_zeilen += f"<td>{d(bonus)} · {stufe}</td>"
        pacht_zeilen += "</tr>"
    b_stufen = range(0, BANK_LEISTE_MAX + 1, KREDIT_SCHRITT)
    bank = "".join(
        f"<tr><td>{d(s)}</td><td>{d(zinsen(s, bankzins(False)))}</td>"
        f"<td>{d(zinsen(s, bankzins(True)))}</td></tr>" for s in b_stufen)
    l_stufen = range(0, int(P["leiher_rahmen"]) + 1, KREDIT_SCHRITT)
    leiher = "".join(f"<tr><td>{d(s)}</td><td>{d(zinsen(s, P['leiher_zins']))}</td></tr>"
                     for s in l_stufen)
    raten = sorted({r for t in STARTRATE.values() for r in t})
    kopf = "".join(f"<th>{a + 1}.</th>" for a in range(RUNDEN))
    foerd = "".join(
        f"<tr><th>{r}</th>" + "".join(f"<td>{k(foerderung_kbbl(r, a))}</td>" for a in range(RUNDEN))
        + "</tr>" for r in raten)
    return f"""
<section class="seite">
<h2>Pachttabelle: Bonus · Förderzins</h2>
<table class="leiste"><tr><th>Lage ↓ · Besitzer →</th>{pacht_kopf}</tr>{pacht_zeilen}</table>
<p class="klein">Förderzins auf Papier auf 1/10, 1/8, 1/6, 1/5 oder 1/4 gerundet
(GDD: zwischen 10 und 25 %).</p>

<h2>Preisleiste und Erlös je 1.000 bbl</h2>
<table class="leiste erloes"><tr><th>Preis ↓ · Förderzins →</th>{roy_kopf}</tr>{erloes}</table>
<p class="klein">Erlös = was Jacob je 1.000 bbl nach Förderzins und Fuhrwerk behält.
Preismarker auf die Zeile legen. Negativ = Fördern kostet Geld.</p>
</section>

<section class="seite">
<h2>Schuldenleisten</h2>
<div class="zwei">
<table class="leiste"><tr><th>Bank</th><th>Zins/Runde ohne Pfand</th>
<th>Zins/Runde mit Pfand</th></tr>{bank}</table>
<table class="leiste"><tr><th>Geldverleiher</th><th>Zins/Runde</th></tr>{leiher}</table>
</div>

<h2>Fördertabelle (1.000 bbl pro Runde)</h2>
<table class="foerder"><tr><th>bbl/Tag ↓ · Förderrunde →</th>{kopf}</tr>{foerd}</table>
<p class="klein">Rückgang {P['decline']:.0%} pro Quartal, {P['days']} Tage je Runde.
Beispiel: Quelle mit 150 bbl/Tag, zweite Förderrunde = {k(foerderung_kbbl(150, 1))} × Erlös.</p>
</section>"""


def rundenbogen_html():
    spalten = ["Runde", "Preis", "Förderung (1.000 bbl)", "Erlös", "an Silas", "Zinsen",
               "Pacht", "Bohren", "Kredit + / Tilgung −", "Kasse", "Schuld Bank",
               "Schuld Verleiher",
               "Spannend? (ja/nein + warum)"]
    kopf = "".join(f"<th>{s}</th>" for s in spalten)
    zeilen = ""
    for r in range(1, RUNDEN + 1):
        jahr, q = (r - 1) // 4 + 1, (r - 1) % 4 + 1
        zeilen += f"<tr><td>{r}<br><small>J{jahr} Q{q}</small></td>" + "<td></td>" * (len(spalten) - 1) + "</tr>"
    return f"""
<section class="seite quer">
<h2>Rundenbogen (je Partie einmal drucken)</h2>
<table class="bogen"><tr>{kopf}</tr>{zeilen}</table>
<p class="klein">Ergebnis Runde 16 (Kasse − Schulden): ________ · Pleite in Runde: ____ ·
„Entschieden“ ab Runde: ____ · Mitspieler wollte zweite Partie: ja / nein</p>
</section>"""


CSS = """
:root { --tinte:#1d1a16; --papier:#fff; --linie:#999; --sicker:#3a2e22; --kuppe:#b9a27a; --flach:#efe6d2; }
* { box-sizing:border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color:var(--tinte); background:var(--papier); margin:0; padding:16px; }
h1 { font-size:22pt; margin:0 0 4px; } h2 { font-size:14pt; margin:14px 0 6px; border-bottom:1px solid var(--tinte); }
p, li { font-size:10.5pt; line-height:1.35; } .klein { font-size:9pt; color:#555; }
.seite { max-width:190mm; margin:0 auto 24px; }
.seite.quer { max-width:277mm; }
table { border-collapse:collapse; width:100%; }
td, th { border:1px solid var(--linie); padding:3px 4px; font-size:9pt; text-align:center; }
.karte td { width:16.6%; height:28mm; vertical-align:middle; }
.karte span { display:block; font-weight:bold; } .karte small { font-size:8pt; }
.zS { background:var(--sicker); color:#fff; } .zK { background:var(--kuppe); } .zF { background:var(--flach); }
.kartenraster { display:grid; grid-template-columns:repeat(6, 1fr); gap:0; }
.kartei { border:1px dashed var(--linie); height:28mm; padding:4px; position:relative; display:flex; flex-direction:column; justify-content:center; text-align:center; font-size:8.5pt; }
.kartei b { font-size:10pt; } .kartei span { font-size:7.5pt; margin-top:2px; }
.kartei i { position:absolute; right:4px; bottom:2px; font-style:normal; font-weight:bold; font-size:8pt; }
.aGusher { background:#222; color:#fff; } .aFund { background:#d8c9a8; } .aKlein { background:#eee4cf; }
.leiste .start { background:#ffe28a; font-weight:bold; }
.zwei { display:grid; grid-template-columns:2fr 1fr; gap:12px; align-items:start; }
.foerder td { font-size:8pt; padding:2px; } .bogen td { height:9mm; } .bogen th { font-size:8pt; }
@media print {
  body { padding:0; } .seite { page-break-after:always; margin:0 auto; }
  @page { size:A4; margin:10mm; }
  .zS, .zK, .zF, .aGusher, .aFund, .aKlein, .start { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
@media screen and (max-width:700px) { .seite, .seite.quer { overflow-x:auto; } }
"""


def bauen(ziel=ZIEL):
    seiten = regeln() + karte_html() + karten_html() + leisten_html() + rundenbogen_html()
    text = (f'<!doctype html>\n<html lang="de"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>CRUDE Papierprototyp</title><style>{CSS}</style></head>"
            f"<body>{seiten}</body></html>\n")
    Path(ziel).write_text(text, encoding="utf-8")
    return ziel


if __name__ == "__main__":
    print("Geschrieben:", bauen(sys.argv[1] if len(sys.argv) > 1 else ZIEL))
