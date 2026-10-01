"""Baut docs/tabellenmodell.xlsx – Roadmap-Schritt 0.6.

Tabellenmodell für Bohren, Pacht und Kredit über die 16 Runden von Kapitel 1.
Startwerte aus GDD §15; fehlende Werte sind als ANNAHME markiert.
Pachtbonus und Förderzins werden je Parzelle verhandelt (Lage, Landbesitzer),
Kredite kommen von Bank und Geldverleiher mit eigenen Bedingungen.

Aufruf:  .venv/bin/python tools/tabellenmodell/build_tabellenmodell.py [zieldatei]
"""

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

ROOT = Path(__file__).resolve().parents[2]
ZIEL = ROOT / "docs" / "tabellenmodell.xlsx"

RUNDEN = 16
FONT = "Arial"

# --- Stil ---------------------------------------------------------------
F_NORMAL = Font(name=FONT, size=10)
F_INPUT = Font(name=FONT, size=10, color="0000FF")
F_LINK = Font(name=FONT, size=10, color="008000")
F_BOLD = Font(name=FONT, size=10, bold=True)
F_TITEL = Font(name=FONT, size=14, bold=True)
F_HINWEIS = Font(name=FONT, size=9, italic=True, color="555555")
F_ANNAHME = Font(name=FONT, size=10, bold=True, color="C00000")
GELB = PatternFill("solid", fgColor="FFFF00")
GRAU = PatternFill("solid", fgColor="E7E6E6")
ROT = PatternFill("solid", fgColor="F4B6B6")
GRUEN = PatternFill("solid", fgColor="C6EFCE")
ERGEBNIS = PatternFill("solid", fgColor="FFF2CC")
DUENN = Side(style="thin", color="BFBFBF")
RAHMEN = Border(top=DUENN, bottom=DUENN, left=DUENN, right=DUENN)

FMT_DOLLAR = '#,##0" $";-#,##0" $";"-"'
FMT_DOLLAR_CENT = '#,##0.00" $";-#,##0.00" $";"-"'
FMT_BBL = '#,##0;-#,##0;"-"'
FMT_PROZENT = '0.0%;-0.0%;"-"'
FMT_PP = '+0.0%;-0.0%;"-"'
FMT_ZAHL = '0;-0;"-"'
FMT_FAKTOR = '0.00"×"'

# --- Startwerte (Name, Text, Wert, Einheit, Format, Quelle, Annahme?) -----
STARTWERTE = [
    ("start_cash", "Bargeld zu Beginn", 2000, "$", FMT_DOLLAR, "GDD §15", False),
    ("drill_cost", "Bohrkosten je Bohrung bis 300 m (Seilschlag)", 2000, "$", FMT_DOLLAR,
     "GDD §15: 1.500–3.000 $ – hier die Mitte", False),
    ("free_leases", "Pachtoptionen ohne Bonus zu Beginn", 2, "Parzellen", FMT_ZAHL,
     "GDD §13, Kapitel 1: Pachtoption auf 2 Parzellen", False),
    ("silas_share", "Anteil von Silas an den ersten Quellen", 0.30, "vom Gewinn", FMT_PROZENT,
     "GDD §15: 30 % (für den Bohrturm)", False),
    ("silas_wells", "Für wie viele Quellen Silas mitverdient", 2, "Quellen", FMT_ZAHL,
     "ANNAHME: GDD sagt nur „die ersten Quellen“", True),
    ("q0", "Anfangsrate eines Funds", 150, "bbl/Tag", FMT_BBL,
     "GDD §15: 50–500 bbl/Tag (Gusher deutlich mehr)", False),
    ("decline", "Rückgang der Förderung pro Quartal", 0.12, "pro Quartal", FMT_PROZENT,
     "GDD §15: 8–15 %", False),
    ("days", "Tage pro Runde (Quartal)", 91, "Tage", FMT_ZAHL, "GDD §2: Runde = Quartal", False),
    ("price", "Ölpreis ab Quelle", 1.00, "$/bbl", FMT_DOLLAR_CENT,
     "ANNAHME: etwa Spindletop-Zeit um 1901; GDD nennt keinen Wert", True),
    ("transport", "Transport mit dem Fuhrwerk", 0.25, "$/bbl", FMT_DOLLAR_CENT,
     "ANNAHME: GDD §6 sagt nur „sehr hoch“", True),
    ("auto_repay", "Überschuss tilgt Kredite automatisch? (1 = ja, 0 = nein)", 0, "",
     FMT_ZAHL, "ANNAHME: Spielerentscheidung, hier als Schalter", True),
    ("hit_rate", "Trefferquote einer Wildcat-Bohrung", 0.15, "", FMT_PROZENT,
     "GDD §15: etwa 1 von 5 bis 1 von 10", False),
]
ERSTE_STARTZEILE = 5
REF = {}  # Name -> absolute Referenz, z. B. Startwerte!$B$5
for i, (name, *_rest) in enumerate(STARTWERTE):
    REF[name] = f"Startwerte!$B${ERSTE_STARTZEILE + i}"

# --- Pachtverhandlung ----------------------------------------------------
# (Lage, Pachtbonus, Förderzins, Quelle)
LAGEN = [
    ("Randlage", 150, 0.125, "GDD §15: Bonus 50–300 $, Förderzins 1/8 (historischer Standard)"),
    ("Nachbar eines Funds", 2000, 1 / 6, "GDD §15: 1.000–20.000 $ nahe einem Fund; "
     "Förderzins 1/6 – in Boomgebieten verlangten Landbesitzer mehr als 1/8"),
    ("Am Fund", 8000, 0.20, "GDD §15: 1.000–20.000 $; Förderzins 1/5 – Lage ist bewiesen"),
]
# (Eigenschaft, Faktor auf Bonus, Zuschlag Förderzins, Begründung)
BESITZER = [
    ("neutral", 1.00, 0.0, "nimmt, was in der Gegend üblich ist"),
    ("gierig", 1.25, 0.03, "will mehr von allem"),
    ("verschuldet", 1.25, -0.03, "braucht Geld sofort: tauscht künftigen Anteil gegen "
     "höheren Bonus"),
    ("misstrauisch", 1.50, 0.0, "traut keinen Versprechen: will mehr Geld auf die Hand"),
    ("fromm", 0.90, 0.0, "hält auf faires Geschäft: kein Feilschen nach oben"),
]
PV_LAGE0 = 5     # erste Zeile der Lagentabelle
PV_BES0 = 11     # erste Zeile der Besitzertabelle
PV_GRENZEN = PV_BES0 + len(BESITZER) + 1  # Untergrenze, darunter Obergrenze
PV = dict(
    lage=f"Pachtverhandlung!$A${PV_LAGE0}:$A${PV_LAGE0 + len(LAGEN) - 1}",
    bonus=f"Pachtverhandlung!$B${PV_LAGE0}:$B${PV_LAGE0 + len(LAGEN) - 1}",
    roy=f"Pachtverhandlung!$C${PV_LAGE0}:$C${PV_LAGE0 + len(LAGEN) - 1}",
    bes=f"Pachtverhandlung!$A${PV_BES0}:$A${PV_BES0 + len(BESITZER) - 1}",
    faktor=f"Pachtverhandlung!$B${PV_BES0}:$B${PV_BES0 + len(BESITZER) - 1}",
    zuschlag=f"Pachtverhandlung!$C${PV_BES0}:$C${PV_BES0 + len(BESITZER) - 1}",
    roy_min=f"Pachtverhandlung!$B${PV_GRENZEN}",
    roy_max=f"Pachtverhandlung!$B${PV_GRENZEN + 1}",
    rand_bonus=f"Pachtverhandlung!$B${PV_LAGE0}",
    neutral_faktor=f"Pachtverhandlung!$B${PV_BES0}",
)

# --- Kreditgeber ---------------------------------------------------------
# (Name, Text, Wert, Format, Quelle, Annahme?) – Zeilen ab KG0
KREDIT = [
    ("rating", "Rating der Bank für Jacob (A–D)", "C", None,
     "GDD §8: aus Verschuldung, Cashflow, Zahlungshistorie, Ruf", False),
    ("sicher_rabatt", "Abschlag, wenn eine fördernde Quelle als Pfand dient", 0.02, FMT_PROZENT,
     "ANNAHME: Sicherheiten senken den Zins (GDD §8)", True),
    ("ohne_aufschlag", "Aufschlag ohne Sicherheit", 0.03, FMT_PROZENT,
     "ANNAHME: Wildcatter ohne Quelle sind für Banken riskant", True),
    ("klima", "Kreditklima (+ = angespannt, − = locker)", 0.0, FMT_PP,
     "GDD §7.1: Weltgröße Kreditklima; hier von Hand", True),
    ("bank_grund", "Bankrahmen ohne Sicherheit", 3000, FMT_DOLLAR,
     "ANNAHME: GDD nennt keinen Rahmen für Kapitel 1", True),
    ("bank_je_quelle", "Zusätzlicher Bankrahmen je fördernde Quelle", 2000, FMT_DOLLAR,
     "ANNAHME: Quellen als Sicherheit erweitern den Rahmen", True),
    ("bank_verhandelt", "Bankzins verhandelt (leer = Formel)", None, FMT_PROZENT,
     "Ergebnis einer Verhandlung am Schreibtisch – überschreibt die Formel", False),
    ("leiher_an", "Geldverleiher verfügbar? (1 = ja, 0 = nein)", 1, FMT_ZAHL,
     "GDD §8: ab Kapitel 1", False),
    ("leiher_rahmen", "Rahmen des Geldverleihers", 2000, FMT_DOLLAR,
     "ANNAHME", True),
    ("leiher_zins", "Zins des Geldverleihers pro Jahr", 0.40, FMT_PROZENT,
     "ANNAHME: GDD §8 „Wucherzins, Schläger bei Verzug“", True),
]
KG0 = 5
RATINGS = [("A", 0.05), ("B", 0.07), ("C", 0.10), ("D", 0.15)]
KG_RATING0 = KG0 + len(KREDIT) + 3
KG_OHNE = KG_RATING0 + len(RATINGS) + 1  # Zeile „Bankzins ohne Sicherheit“
KG = {name: f"Kreditgeber!$B${KG0 + i}" for i, (name, *_r) in enumerate(KREDIT)}
KG["rating_buchst"] = f"Kreditgeber!$A${KG_RATING0}:$A${KG_RATING0 + len(RATINGS) - 1}"
KG["rating_zins"] = f"Kreditgeber!$B${KG_RATING0}:$B${KG_RATING0 + len(RATINGS) - 1}"
KG["ohne_sicherheit"] = f"Kreditgeber!$B${KG_OHNE}"


def zelle(ws, ref, wert, font=F_NORMAL, fmt=None, fill=None, bold=False):
    c = ws[ref]
    c.value = wert
    c.font = Font(name=FONT, size=font.size, bold=bold or font.bold,
                  italic=font.italic, color=font.color)
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    return c


def eingabe(ws, ref, wert, fmt=None):
    c = zelle(ws, ref, wert, F_INPUT, fmt, GELB)
    c.border = RAHMEN
    return c


def kopfzeile(ws, zeile, texte, start_spalte=1):
    for i, t in enumerate(texte):
        c = ws.cell(row=zeile, column=start_spalte + i, value=t)
        c.font = F_BOLD
        c.fill = GRAU
        c.border = RAHMEN
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")


def quelle(ws, ref, text, annahme):
    zelle(ws, ref, text, F_ANNAHME if annahme else F_NORMAL)


# --- Blatt: Startwerte ----------------------------------------------------
def blatt_startwerte(wb):
    ws = wb.active
    ws.title = "Startwerte"
    zelle(ws, "A1", "CRUDE – Tabellenmodell Kapitel 1 (Roadmap 0.6)", F_TITEL)
    zelle(ws, "A2", "Gelbe Zellen mit blauer Schrift sind Stellschrauben: ändern, "
          "dann rechnen alle Blätter neu. Schwarze Zellen sind Formeln – nicht überschreiben.",
          F_HINWEIS)
    zelle(ws, "A3", "Pachtbonus und Förderzins stehen im Blatt „Pachtverhandlung“, Kredite im "
          "Blatt „Kreditgeber“. Rot markierte Quellen sind Annahmen, die im GDD noch fehlen.",
          F_HINWEIS)
    kopfzeile(ws, 4, ["Parameter", "Wert", "Einheit", "Quelle"])
    for i, (name, text, wert, einheit, fmt, q, annahme) in enumerate(STARTWERTE):
        z = ERSTE_STARTZEILE + i
        zelle(ws, f"A{z}", text)
        eingabe(ws, f"B{z}", wert, fmt)
        zelle(ws, f"C{z}", einheit)
        quelle(ws, f"D{z}", q, annahme)
    ws.column_dimensions["A"].width = 52
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 60
    ws.freeze_panes = "A5"


# --- Blatt: Pachtverhandlung ---------------------------------------------
def blatt_pachtverhandlung(wb):
    ws = wb.create_sheet("Pachtverhandlung")
    zelle(ws, "A1", "Pachtverhandlung: Bonus und Förderzins je Parzelle", F_TITEL)
    zelle(ws, "A2", "Jede Pacht wird einzeln verhandelt (GDD §5). Lage und Landbesitzer ergeben "
          "einen Vorschlag; im Blatt „Runden“ kann das Verhandlungsergebnis ihn überschreiben.",
          F_HINWEIS)
    zelle(ws, "A3", "Vorschlag: Bonus = Bonus der Lage × Faktor des Besitzers · "
          "Förderzins = Förderzins der Lage + Zuschlag des Besitzers (in Grenzen).", F_HINWEIS)
    kopfzeile(ws, PV_LAGE0 - 1, ["Lage", "Pachtbonus je Parzelle", "Förderzins", "Quelle"])
    for i, (lage, bonus, roy, q) in enumerate(LAGEN):
        z = PV_LAGE0 + i
        zelle(ws, f"A{z}", lage, bold=True)
        eingabe(ws, f"B{z}", bonus, FMT_DOLLAR)
        eingabe(ws, f"C{z}", roy, FMT_PROZENT)
        quelle(ws, f"D{z}", q, False)
    kopfzeile(ws, PV_BES0 - 1, ["Landbesitzer", "Faktor auf Bonus", "Zuschlag Förderzins",
                                "Warum (GDD §5: Eigenschaften der Landbesitzer)"])
    for i, (bes, faktor, zuschlag, warum) in enumerate(BESITZER):
        z = PV_BES0 + i
        zelle(ws, f"A{z}", bes, bold=True)
        eingabe(ws, f"B{z}", faktor, FMT_FAKTOR)
        eingabe(ws, f"C{z}", zuschlag, FMT_PP)
        quelle(ws, f"D{z}", "ANNAHME: " + warum, True)
    zelle(ws, f"A{PV_GRENZEN}", "Förderzins mindestens", bold=True)
    eingabe(ws, f"B{PV_GRENZEN}", 0.10, FMT_PROZENT)
    quelle(ws, f"D{PV_GRENZEN}", "ANNAHME: unter 1/10 lässt sich kaum ein Farmer ein", True)
    zelle(ws, f"A{PV_GRENZEN + 1}", "Förderzins höchstens", bold=True)
    eingabe(ws, f"B{PV_GRENZEN + 1}", 0.25, FMT_PROZENT)
    quelle(ws, f"D{PV_GRENZEN + 1}", "ANNAHME: über 1/4 lohnt kaum ein Bohrer", True)
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 80


# --- Blatt: Kreditgeber --------------------------------------------------
def blatt_kreditgeber(wb):
    ws = wb.create_sheet("Kreditgeber")
    zelle(ws, "A1", "Kreditgeber: Bank und Geldverleiher", F_TITEL)
    zelle(ws, "A2", "Bankzins = Zins nach Rating + Kreditklima, mit Pfand (fördernde Quelle) "
          "billiger, ohne teurer – oder der verhandelte Zins. Er gilt jede Runde für die "
          "ganze Bankschuld. Braucht Jacob Geld, nimmt er zuerst das billigere; Überschuss "
          "tilgt zuerst das teurere.", F_HINWEIS)
    zelle(ws, "A3", "Der Geldverleiher gibt sofort und ohne Sicherheit Geld – zum Wucherzins. "
          "Schläger bei Verzug (GDD §8) sind hier nicht abgebildet.", F_HINWEIS)
    kopfzeile(ws, KG0 - 1, ["Parameter", "Wert", "Quelle"])
    dv = DataValidation(type="list", formula1='"A,B,C,D"', allow_blank=False)
    ws.add_data_validation(dv)
    for i, (name, text, wert, fmt, q, annahme) in enumerate(KREDIT):
        z = KG0 + i
        zelle(ws, f"A{z}", text)
        eingabe(ws, f"B{z}", wert, fmt)
        quelle(ws, f"C{z}", q, annahme)
        if name == "rating":
            dv.add(f"B{z}")
    kopfzeile(ws, KG_RATING0 - 1, ["Rating", "Bankzins pro Jahr", "Quelle"])
    for i, (buchst, zins) in enumerate(RATINGS):
        z = KG_RATING0 + i
        zelle(ws, f"A{z}", buchst, bold=True)
        eingabe(ws, f"B{z}", zins, FMT_PROZENT)
        quelle(ws, f"C{z}", "GDD §8/§15", False)
    zelle(ws, f"A{KG_OHNE}", "Bankzins ohne Sicherheit (für den Pleiterechner)", bold=True)
    c = zelle(ws, f"B{KG_OHNE}", f"={bankzins_formel('0')}", fmt=FMT_PROZENT, bold=True)
    c.fill = ERGEBNIS
    c.border = RAHMEN
    ws.column_dimensions["A"].width = 50
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 62


def bankzins_formel(quellen):
    """Bankzins pro Jahr, `quellen` = Formel für die Zahl fördernder Quellen."""
    return (f"IF({KG['bank_verhandelt']}<>\"\",{KG['bank_verhandelt']},"
            f"MAX(0,INDEX({KG['rating_zins']},MATCH({KG['rating']},{KG['rating_buchst']},0))"
            f"+IF({quellen}>0,-{KG['sicher_rabatt']},{KG['ohne_aufschlag']})+{KG['klima']}))")


# --- Blatt: Runden --------------------------------------------------------
SPALTEN = [
    # (Schlüssel, Überschrift, Eingabe?)
    ("runde", "Runde", False),
    ("quartal", "Quartal", False),
    ("pacht", "Neue Parzellen pachten", True),
    ("bohren", "Bohren? (1/0)", True),
    ("ergebnis", "Ergebnis", True),
    ("groesse", "Lagerstätte bei Fund (bbl)", True),
    ("lage", "Lage der Parzelle", True),
    ("besitzer", "Landbesitzer", True),
    ("bonus_v", "Bonus verhandelt (leer = Vorschlag)", True),
    ("roy_v", "Förderzins verhandelt (leer = Vorschlag)", True),
    ("bonus", "Pachtbonus je Parzelle", False),
    ("roy", "Förderzins dieser Parzelle", False),
    ("bar_an", "Bargeld Anfang", False),
    ("bank_an", "Bankschuld Anfang", False),
    ("leiher_an", "Schuld beim Geldverleiher Anfang", False),
    ("quellen", "Fördernde Quellen", False),
    ("bankzins", "Bankzins pro Jahr", False),
    ("bankrahmen", "Bankrahmen", False),
    ("k_pacht", "Pachtkosten", False),
    ("k_bohr", "Bohrkosten", False),
    ("zinsen", "Zinsen", False),
    ("foerd", "Förderung (bbl)", False),
    ("erloes", "Erlös nach Transport", False),
    ("foerderzins", "Förderzins an Landbesitzer", False),
    ("silas", "Anteil Silas", False),
    ("cashflow", "Cashflow der Runde", False),
    ("bar_vor", "Bargeld vor Kredit", False),
    ("bank_neu", "Neuer Bankkredit", False),
    ("leiher_neu", "Neuer Kredit Geldverleiher", False),
    ("bank_tilg", "Tilgung Bank", False),
    ("leiher_tilg", "Tilgung Geldverleiher", False),
    ("bank_end", "Bankschuld Ende", False),
    ("leiher_end", "Schuld beim Geldverleiher Ende", False),
    ("bar_end", "Bargeld Ende", False),
    ("trocken", "Trockenbohrungen bisher", False),
    ("status", "Status", False),
]
SP = {key: get_column_letter(i + 1) for i, (key, _t, _e) in enumerate(SPALTEN)}
R0 = 5  # erste Datenzeile (Runde 1)


def rz(r):
    """Zeile einer Runde im Rundenblatt."""
    return R0 + r - 1


def ergebnis_zeile():
    """Erste Zeile der Ergebniswerte im Rundenblatt (Spalte G)."""
    return rz(RUNDEN) + 3


def blatt_runden(wb):
    ws = wb.create_sheet("Runden")
    S = SP
    zelle(ws, "A1", "16 Runden (Kapitel 1, Jahr 1–4, je Runde ein Quartal)", F_TITEL)
    zelle(ws, "A2", "Gelb = deine Eingaben je Runde. Lage und Landbesitzer gelten für die "
          "Parzelle, auf der in dieser Runde gepachtet bzw. gebohrt wird. "
          "Vorgabe: Pechsträhne – jede Runde eine Bohrung in Randlage, alle trocken.", F_HINWEIS)
    zelle(ws, "A3", "Ablauf je Runde: Pacht und Bohrung bezahlen, Zinsen zahlen, Öl aus "
          "früheren Funden verkaufen. Fehlt Geld, leihen Bank und Geldverleiher bis zu ihrem "
          "Rahmen (billigeres zuerst). Reicht auch das nicht: PLEITE. Ein Fund fördert ab der "
          "Folgerunde.", F_HINWEIS)
    kopfzeile(ws, 4, [t for _k, t, _e in SPALTEN])
    ws.row_dimensions[4].height = 54

    dv_erg = DataValidation(type="list", formula1='"Trocken,Fund"', allow_blank=True)
    dv_bin = DataValidation(type="whole", operator="between", formula1="0", formula2="1")
    dv_lage = DataValidation(type="list", formula1=PV["lage"], allow_blank=False)
    dv_bes = DataValidation(type="list", formula1=PV["bes"], allow_blank=False)
    for dv in (dv_erg, dv_bin, dv_lage, dv_bes):
        ws.add_data_validation(dv)

    for r in range(1, RUNDEN + 1):
        z = rz(r)
        prev = z - 1
        jahr, q = (r - 1) // 4 + 1, (r - 1) % 4 + 1
        zelle(ws, f"{S['runde']}{z}", r)
        zelle(ws, f"{S['quartal']}{z}", f"Jahr {jahr} · Q{q}")
        # Eingaben
        eingabe(ws, f"{S['pacht']}{z}", 1, FMT_ZAHL)
        eingabe(ws, f"{S['bohren']}{z}", 1, FMT_ZAHL)
        eingabe(ws, f"{S['ergebnis']}{z}", "Trocken")
        eingabe(ws, f"{S['groesse']}{z}", 200000, FMT_BBL)
        eingabe(ws, f"{S['lage']}{z}", LAGEN[0][0])
        eingabe(ws, f"{S['besitzer']}{z}", BESITZER[0][0])
        eingabe(ws, f"{S['bonus_v']}{z}", None, FMT_DOLLAR)
        eingabe(ws, f"{S['roy_v']}{z}", None, FMT_PROZENT)
        dv_erg.add(f"{S['ergebnis']}{z}")
        dv_bin.add(f"{S['bohren']}{z}")
        dv_lage.add(f"{S['lage']}{z}")
        dv_bes.add(f"{S['besitzer']}{z}")

        # Verhandlung
        lage, bes = f"{S['lage']}{z}", f"{S['besitzer']}{z}"
        zelle(ws, f"{S['bonus']}{z}",
              f"=IF({S['bonus_v']}{z}<>\"\",{S['bonus_v']}{z},"
              f"INDEX({PV['bonus']},MATCH({lage},{PV['lage']},0))"
              f"*INDEX({PV['faktor']},MATCH({bes},{PV['bes']},0)))", F_LINK, FMT_DOLLAR)
        zelle(ws, f"{S['roy']}{z}",
              f"=IF({S['roy_v']}{z}<>\"\",{S['roy_v']}{z},"
              f"MIN({PV['roy_max']},MAX({PV['roy_min']},"
              f"INDEX({PV['roy']},MATCH({lage},{PV['lage']},0))"
              f"+INDEX({PV['zuschlag']},MATCH({bes},{PV['bes']},0)))))", F_LINK, FMT_PROZENT)

        if r == 1:
            zelle(ws, f"{S['bar_an']}{z}", f"={REF['start_cash']}", F_LINK, FMT_DOLLAR)
            zelle(ws, f"{S['bank_an']}{z}", 0, F_NORMAL, FMT_DOLLAR)
            zelle(ws, f"{S['leiher_an']}{z}", 0, F_NORMAL, FMT_DOLLAR)
            pacht_vorher = "0"
            trocken_vorher = "0"
            status_vorher = '""'
        else:
            zelle(ws, f"{S['bar_an']}{z}", f"={S['bar_end']}{prev}", fmt=FMT_DOLLAR)
            zelle(ws, f"{S['bank_an']}{z}", f"={S['bank_end']}{prev}", fmt=FMT_DOLLAR)
            zelle(ws, f"{S['leiher_an']}{z}", f"={S['leiher_end']}{prev}", fmt=FMT_DOLLAR)
            pacht_vorher = f"SUM(${S['pacht']}${R0}:{S['pacht']}{prev})"
            trocken_vorher = f"{S['trocken']}{prev}"
            status_vorher = f"{S['status']}{prev}"

        qz = q_zeile(r)
        prod = f"Quellen!$B${qz}:$Q${qz}"
        zelle(ws, f"{S['quellen']}{z}", f"=SUMPRODUCT(({prod}>0)*1)", F_LINK, FMT_ZAHL)
        zelle(ws, f"{S['bankzins']}{z}", f"={bankzins_formel(S['quellen'] + str(z))}",
              F_LINK, FMT_PROZENT)
        zelle(ws, f"{S['bankrahmen']}{z}",
              f"={KG['bank_grund']}+{S['quellen']}{z}*{KG['bank_je_quelle']}", F_LINK,
              FMT_DOLLAR)

        pacht_bis = f"SUM(${S['pacht']}${R0}:{S['pacht']}{z})"
        frei = REF["free_leases"]
        zelle(ws, f"{S['k_pacht']}{z}",
              f"=(MAX(0,{pacht_bis}-{frei})-MAX(0,{pacht_vorher}-{frei}))*{S['bonus']}{z}",
              fmt=FMT_DOLLAR)
        zelle(ws, f"{S['k_bohr']}{z}", f"={S['bohren']}{z}*{REF['drill_cost']}", fmt=FMT_DOLLAR)
        leiher_zins = KG["leiher_zins"]
        zelle(ws, f"{S['zinsen']}{z}",
              f"={S['bank_an']}{z}*{S['bankzins']}{z}/4+{S['leiher_an']}{z}*{leiher_zins}/4",
              fmt=FMT_DOLLAR)
        zelle(ws, f"{S['foerd']}{z}", f"=SUM({prod})", F_LINK, FMT_BBL)
        zelle(ws, f"{S['erloes']}{z}",
              f"={S['foerd']}{z}*({REF['price']}-{REF['transport']})", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['foerderzins']}{z}",
              f"=SUMPRODUCT({prod},Quellen!$B$8:$Q$8)*{REF['price']}", F_LINK, FMT_DOLLAR)
        zelle(ws, f"{S['silas']}{z}",
              f"=SUMPRODUCT({prod},Quellen!$B$6:$Q$6,Quellen!$B$9:$Q$9)*{REF['silas_share']}",
              F_LINK, FMT_DOLLAR)
        zelle(ws, f"{S['cashflow']}{z}",
              f"={S['erloes']}{z}-{S['foerderzins']}{z}-{S['silas']}{z}"
              f"-{S['k_pacht']}{z}-{S['k_bohr']}{z}-{S['zinsen']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['bar_vor']}{z}", f"={S['bar_an']}{z}+{S['cashflow']}{z}", fmt=FMT_DOLLAR)

        # Kredit: billigeres Geld zuerst leihen, teureres zuerst tilgen
        bf = f"{S['bankzins']}{z}<={leiher_zins}"
        bedarf = f"MAX(0,-{S['bar_vor']}{z})"
        bank_frei = f"MAX(0,{S['bankrahmen']}{z}-{S['bank_an']}{z})"
        leiher_frei = (f"MAX(0,{KG['leiher_rahmen']}*{KG['leiher_an']}"
                       f"-{S['leiher_an']}{z})")
        zelle(ws, f"{S['bank_neu']}{z}",
              f"=IF({bf},MIN({bedarf},{bank_frei}),"
              f"MIN(MAX(0,{bedarf}-{leiher_frei}),{bank_frei}))", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['leiher_neu']}{z}",
              f"=IF({bf},MIN(MAX(0,{bedarf}-{bank_frei}),{leiher_frei}),"
              f"MIN({bedarf},{leiher_frei}))", fmt=FMT_DOLLAR)
        ueber = f"IF({REF['auto_repay']}=1,MAX(0,{S['bar_vor']}{z}),0)"
        zelle(ws, f"{S['bank_tilg']}{z}",
              f"=IF({bf},MIN(MAX(0,{ueber}-{S['leiher_an']}{z}),{S['bank_an']}{z}),"
              f"MIN({ueber},{S['bank_an']}{z}))", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['leiher_tilg']}{z}",
              f"=IF({bf},MIN({ueber},{S['leiher_an']}{z}),"
              f"MIN(MAX(0,{ueber}-{S['bank_an']}{z}),{S['leiher_an']}{z}))", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['bank_end']}{z}",
              f"={S['bank_an']}{z}+{S['bank_neu']}{z}-{S['bank_tilg']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['leiher_end']}{z}",
              f"={S['leiher_an']}{z}+{S['leiher_neu']}{z}-{S['leiher_tilg']}{z}",
              fmt=FMT_DOLLAR)
        zelle(ws, f"{S['bar_end']}{z}",
              f"={S['bar_vor']}{z}+{S['bank_neu']}{z}+{S['leiher_neu']}{z}"
              f"-{S['bank_tilg']}{z}-{S['leiher_tilg']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['trocken']}{z}",
              f"={trocken_vorher}+IF(AND({S['bohren']}{z}=1,{S['ergebnis']}{z}=\"Trocken\"),1,0)",
              fmt=FMT_ZAHL)
        zelle(ws, f"{S['status']}{z}",
              f"=IF(OR({status_vorher}=\"PLEITE\",{S['bar_end']}{z}<0),\"PLEITE\",\"ok\")",
              bold=True)
        for sp in range(1, len(SPALTEN) + 1):
            ws.cell(row=z, column=sp).border = RAHMEN

    # Ganze Zeile rot, sobald pleite
    letzte = rz(RUNDEN)
    st, ende = S["status"], S["status"]
    ws.conditional_formatting.add(
        f"A{R0}:{ende}{letzte}", FormulaRule(formula=[f'${st}{R0}="PLEITE"'], fill=ROT))
    ws.conditional_formatting.add(
        f"{st}{R0}:{st}{letzte}", FormulaRule(formula=[f'${st}{R0}="ok"'], fill=GRUEN))

    # Zusammenfassung – Texte in Spalte A laufen bis F, Werte stehen in Spalte G
    s = ergebnis_zeile() - 1
    stat = f"{st}{R0}:{st}{letzte}"
    zelle(ws, f"A{s}", "Ergebnis", F_TITEL)
    erg = [
        ("Erste Runde mit PLEITE (0 = nie pleite)",
         f'=IF(COUNTIF({stat},"PLEITE")=0,0,{RUNDEN}-COUNTIF({stat},"PLEITE")+1)', FMT_ZAHL),
        ("Trockenbohrungen, die Jacob noch bezahlen konnte",
         f"=IF(G{s+1}=0,{S['trocken']}{letzte},IF(G{s+1}=1,0,"
         f"INDEX({S['trocken']}{R0}:{S['trocken']}{letzte},G{s+1}-1)))", FMT_ZAHL),
        ("Bargeld am Ende von Runde 16", f"={S['bar_end']}{letzte}", FMT_DOLLAR),
        ("Schulden am Ende von Runde 16 (Bank + Geldverleiher)",
         f"={S['bank_end']}{letzte}+{S['leiher_end']}{letzte}", FMT_DOLLAR),
        ("Gezahlte Zinsen gesamt", f"=SUM({S['zinsen']}{R0}:{S['zinsen']}{letzte})",
         FMT_DOLLAR),
        ("Förderzins an Landbesitzer gesamt",
         f"=SUM({S['foerderzins']}{R0}:{S['foerderzins']}{letzte})", FMT_DOLLAR),
        ("Gefördertes Öl gesamt (bbl)", f"=SUM({S['foerd']}{R0}:{S['foerd']}{letzte})", FMT_BBL),
    ]
    for i, (text, formel, fmt) in enumerate(erg, start=1):
        zelle(ws, f"A{s+i}", text, bold=True)
        c = zelle(ws, f"G{s+i}", formel, Font(name=FONT, size=11, bold=True), fmt, ERGEBNIS)
        c.border = RAHMEN
    zelle(ws, f"A{s+len(erg)+2}", "Hinweis: PLEITE heißt hier „Rechnung nicht mehr "
          "bezahlbar“. Im Spiel folgt laut GDD §8 erst eine Frist von 2 Runden (Notverkauf, "
          "Konsortium, Umschuldung). Die erste PLEITE-Runde ist also der Moment, in dem diese "
          "Frist beginnt.", F_HINWEIS)

    breiten = {"A": 7, "B": 12, "C": 10, "D": 8, "E": 10, "F": 12, "G": 18, "H": 13,
               "I": 12, "J": 12}
    for sp in range(1, len(SPALTEN) + 1):
        b = get_column_letter(sp)
        ws.column_dimensions[b].width = breiten.get(b, 12)
    ws.freeze_panes = "C5"


# --- Blatt: Quellen -------------------------------------------------------
# Spalte B..Q = Quelle aus Runde 1..16; Förderung ab Q_FOERD0, Restreserve ab Q_RESERVE0
Q_FOERD0 = 12
Q_RESERVE0 = 32


def q_zeile(r):
    return Q_FOERD0 + r - 1


def blatt_quellen(wb):
    ws = wb.create_sheet("Quellen")
    zelle(ws, "A1", "Quellen: Förderung je Fund (Hilfsblatt, nur Formeln)", F_TITEL)
    zelle(ws, "A2", "GDD §15: q_t = q₀ · (1 − D)^t · R_t / R₀ – jede Quelle fördert ab der "
          "Runde nach dem Fund, höchstens bis die Lagerstätte leer ist.", F_HINWEIS)
    zeilen = {3: "Quelle aus Runde", 4: "Fund? (1/0)", 5: "Fund-Nummer",
              6: "Silas verdient mit?", 7: "Lagerstätte R₀ (bbl)",
              8: "Förderzins der Parzelle", 9: "Netto je bbl nach Transport und Förderzins",
              Q_FOERD0 - 1: "Förderung je Runde (bbl)",
              Q_RESERVE0 - 1: "Restreserve zu Rundenbeginn (bbl)"}
    for z, text in zeilen.items():
        zelle(ws, f"A{z}", text, F_BOLD)

    for j in range(1, RUNDEN + 1):
        c = get_column_letter(j + 1)
        rr = rz(j)
        zelle(ws, f"{c}3", j, F_BOLD).fill = GRAU
        zelle(ws, f"{c}4",
              f'=IF(AND(Runden!${SP["bohren"]}${rr}=1,Runden!${SP["ergebnis"]}${rr}="Fund"),1,0)',
              F_LINK, FMT_ZAHL)
        zelle(ws, f"{c}5", f"=IF({c}4=1,SUM($B$4:{c}4),0)", fmt=FMT_ZAHL)
        zelle(ws, f"{c}6", f"=IF(AND({c}4=1,{c}5<={REF['silas_wells']}),1,0)", fmt=FMT_ZAHL)
        zelle(ws, f"{c}7", f"=IF({c}4=1,Runden!${SP['groesse']}${rr},0)", F_LINK, FMT_BBL)
        zelle(ws, f"{c}8", f"=Runden!${SP['roy']}${rr}", F_LINK, FMT_PROZENT)
        zelle(ws, f"{c}9", f"={REF['price']}-{REF['transport']}-{REF['price']}*{c}8",
              fmt=FMT_DOLLAR_CENT)
        for r in range(1, RUNDEN + 1):
            fz, rz_ = Q_FOERD0 + r - 1, Q_RESERVE0 + r - 1
            if j == 1:
                zelle(ws, f"A{fz}", r, F_BOLD)
                zelle(ws, f"A{rz_}", r, F_BOLD)
            zelle(ws, f"{c}{fz}",
                  f"=IF(AND({c}$4=1,$A{fz}>{c}$3,{c}$7>0),MIN({c}{rz_},"
                  f"{REF['q0']}*{REF['days']}*(1-{REF['decline']})^($A{fz}-{c}$3-1)"
                  f"*{c}{rz_}/{c}$7),0)", fmt=FMT_BBL)
            if r == 1:
                zelle(ws, f"{c}{rz_}", f"={c}$7", fmt=FMT_BBL)
            else:
                zelle(ws, f"{c}{rz_}", f"={c}{rz_-1}-{c}{fz-1}", fmt=FMT_BBL)
    ws.column_dimensions["A"].width = 40
    for j in range(2, RUNDEN + 2):
        ws.column_dimensions[get_column_letter(j)].width = 10
    ws.freeze_panes = "B4"


# --- Blatt: Pleiterechner ------------------------------------------------
PR_KOSTEN = [1500, 2000, 2500, 3000]
PR_RAHMEN = [0, 3000, 5000, 10000]
PR_HILF0 = 24  # erste Rundenzeile im Hilfsblock


def blatt_pleiterechner(wb):
    ws = wb.create_sheet("Pleiterechner")
    zelle(ws, "A1", "Pleiterechner: Wie viele Trockenbohrungen hält Jacob aus?", F_TITEL)
    zelle(ws, "A2", "Annahme: Pechsträhne – jede Runde eine neue Parzelle in Randlage "
          "(neutraler Besitzer) pachten und bohren, alles trocken. Startgeld, freie "
          "Pachtoptionen und der Bankzins ohne Sicherheit kommen aus den anderen Blättern. "
          "Bohrkosten (Zeilen) und Kreditrahmen gesamt (Spalten) sind hier frei wählbar.",
          F_HINWEIS)

    zelle(ws, "A4", "Bezahlbare Trockenbohrungen, bevor Jacob pleite ist", F_BOLD)
    zelle(ws, "B5", "Bohrkosten ↓ / Kreditrahmen →", F_BOLD).fill = GRAU
    for k, rahmen in enumerate(PR_RAHMEN):
        c = get_column_letter(3 + k)
        eingabe(ws, f"{c}5", rahmen, FMT_DOLLAR)
        zelle(ws, f"{c}12", f"={c}5", fmt=FMT_DOLLAR, bold=True).fill = GRAU
    for i, kosten in enumerate(PR_KOSTEN):
        z = 6 + i
        eingabe(ws, f"B{z}", kosten, FMT_DOLLAR)
        zelle(ws, f"B{z+7}", f"=B{z}", fmt=FMT_DOLLAR, bold=True).fill = GRAU

    zelle(ws, "A11", "Wahrscheinlichkeit, mit all diesen Bohrungen kein Öl zu finden "
          "(Trefferquote aus „Startwerte“)", F_BOLD)
    zelle(ws, "B12", "Bohrkosten ↓ / Kreditrahmen →", F_BOLD).fill = GRAU
    zelle(ws, "A18", "Lesart: Zelle = wie viele Trockenbohrungen Jacob bezahlen kann; die "
          "nächste nicht mehr. Ein Fund rettet ihn nicht sicher – eine „Tasche“ (45 % aller "
          "Funde) hat nur 20.000 bbl. Der Rahmen ist hier vereinfacht zu einem Zins "
          "(Bank ohne Sicherheit) gerechnet.", F_HINWEIS)

    bonus = f"{PV['rand_bonus']}*{PV['neutral_faktor']}"
    zins_pa = KG["ohne_sicherheit"]
    zelle(ws, f"A{PR_HILF0-3}", "Hilfsrechnung: kumulierte Ausgaben (Bohrung + Pacht + Zinsen) "
          "je Szenario", F_BOLD)
    zelle(ws, f"A{PR_HILF0-2}", "Bohrkosten", F_BOLD)
    zelle(ws, f"A{PR_HILF0-1}", "Kreditrahmen", F_BOLD)
    for r in range(1, RUNDEN + 1):
        zelle(ws, f"A{PR_HILF0 + r - 1}", r, F_BOLD)
    letzte = PR_HILF0 + RUNDEN - 1
    s = 0
    for i in range(len(PR_KOSTEN)):
        for k in range(len(PR_RAHMEN)):
            c = get_column_letter(2 + s)
            zelle(ws, f"{c}{PR_HILF0-2}", f"=$B${6+i}", fmt=FMT_DOLLAR)
            zelle(ws, f"{c}{PR_HILF0-1}", f"=${get_column_letter(3+k)}$5", fmt=FMT_DOLLAR)
            for r in range(1, RUNDEN + 1):
                z = PR_HILF0 + r - 1
                kosten = f"{c}${PR_HILF0-2}+IF($A{z}>{REF['free_leases']},{bonus},0)"
                if r == 1:
                    zelle(ws, f"{c}{z}", f"={kosten}", fmt=FMT_DOLLAR)
                else:
                    zins = f"MAX(0,{c}{z-1}-{REF['start_cash']})*{zins_pa}/4"
                    zelle(ws, f"{c}{z}", f"={c}{z-1}+{kosten}+{zins}", fmt=FMT_DOLLAR)
            grenze = f"({REF['start_cash']}+{c}${PR_HILF0-1})"
            ziel = f"{get_column_letter(3+k)}{6+i}"
            zelle(ws, ziel, f"=SUMPRODUCT(({c}{PR_HILF0}:{c}{letzte}<={grenze})*1)",
                  fmt="0", bold=True).border = RAHMEN
            ws[ziel].alignment = Alignment(horizontal="center")
            ziel_p = f"{get_column_letter(3+k)}{13+i}"
            zelle(ws, ziel_p, f"=(1-{REF['hit_rate']})^{ziel}", fmt="0%",
                  bold=True).border = RAHMEN
            ws[ziel_p].alignment = Alignment(horizontal="center")
            s += 1
    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 26
    for j in range(3, 19):
        ws.column_dimensions[get_column_letter(j)].width = 11


def baue(ziel=ZIEL):
    wb = Workbook()
    blatt_startwerte(wb)
    blatt_pachtverhandlung(wb)
    blatt_kreditgeber(wb)
    blatt_runden(wb)
    blatt_quellen(wb)
    blatt_pleiterechner(wb)
    wb.move_sheet("Runden", offset=-2)  # Reihenfolge: Startwerte, Runden, …
    wb.calculation.fullCalcOnLoad = True  # Excel/Numbers rechnen beim Öffnen neu
    ziel = Path(ziel)
    ziel.parent.mkdir(parents=True, exist_ok=True)
    wb.save(ziel)
    return ziel


if __name__ == "__main__":
    pfad = baue(sys.argv[1] if len(sys.argv) > 1 else ZIEL)
    print(f"geschrieben: {pfad}")
