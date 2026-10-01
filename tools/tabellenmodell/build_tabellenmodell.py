"""Baut docs/tabellenmodell.xlsx – Roadmap-Schritt 0.6.

Tabellenmodell für Bohren, Pacht und Kredit über die 16 Runden von Kapitel 1.
Startwerte aus GDD §15; fehlende Werte sind als ANNAHME markiert.

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
GELB = PatternFill("solid", fgColor="FFFF00")
GRAU = PatternFill("solid", fgColor="E7E6E6")
ROT = PatternFill("solid", fgColor="F4B6B6")
GRUEN = PatternFill("solid", fgColor="C6EFCE")
DUENN = Side(style="thin", color="BFBFBF")
RAHMEN = Border(top=DUENN, bottom=DUENN, left=DUENN, right=DUENN)

FMT_DOLLAR = '#,##0" $";-#,##0" $";"-"'
FMT_DOLLAR_CENT = '#,##0.00" $";-#,##0.00" $";"-"'
FMT_BBL = '#,##0;-#,##0;"-"'
FMT_PROZENT = '0.0%;-0.0%;"-"'
FMT_ZAHL = '0;-0;"-"'

# --- Startwerte (Name, Wert, Einheit, Format, Quelle, Annahme?) -----------
STARTWERTE = [
    ("start_cash", "Bargeld zu Beginn", 2000, "$", FMT_DOLLAR, "GDD §15", False),
    ("drill_cost", "Bohrkosten je Bohrung bis 300 m (Seilschlag)", 2000, "$", FMT_DOLLAR,
     "GDD §15: 1.500–3.000 $ – hier die Mitte", False),
    ("lease_bonus", "Pachtbonus je Parzelle (Randlage)", 150, "$", FMT_DOLLAR,
     "GDD §15: 50–300 $ in Randlage – hier die Mitte", False),
    ("free_leases", "Pachtoptionen ohne Bonus zu Beginn", 2, "Parzellen", FMT_ZAHL,
     "GDD §13, Kapitel 1: Pachtoption auf 2 Parzellen", False),
    ("royalty", "Förderzins an Landbesitzer", 0.125, "der Förderung", FMT_PROZENT,
     "GDD §15: 1/8", False),
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
    ("credit_limit", "Kreditrahmen der Bank", 3000, "$", FMT_DOLLAR,
     "ANNAHME: GDD nennt keinen Rahmen für Kapitel 1", True),
    ("rate", "Kreditzins pro Jahr (Rating C)", 0.10, "pro Jahr", FMT_PROZENT,
     "GDD §15/§8: A 5 % · B 7 % · C 10 % · D 15 %", False),
    ("auto_repay", "Überschuss tilgt Kredit automatisch? (1 = ja, 0 = nein)", 0, "", FMT_ZAHL,
     "ANNAHME: Spielerentscheidung, hier als Schalter", True),
    ("hit_rate", "Trefferquote einer Wildcat-Bohrung", 0.15, "", FMT_PROZENT,
     "GDD §15: etwa 1 von 5 bis 1 von 10", False),
]
ERSTE_STARTZEILE = 5
REF = {}  # Name -> absolute Referenz, z. B. Startwerte!$B$5
for i, (name, *_rest) in enumerate(STARTWERTE):
    REF[name] = f"Startwerte!$B${ERSTE_STARTZEILE + i}"


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


def kopfzeile(ws, zeile, texte, start_spalte=1):
    for i, t in enumerate(texte):
        c = ws.cell(row=zeile, column=start_spalte + i, value=t)
        c.font = F_BOLD
        c.fill = GRAU
        c.border = RAHMEN
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")


# --- Blatt 1: Startwerte --------------------------------------------------
def blatt_startwerte(wb):
    ws = wb.active
    ws.title = "Startwerte"
    zelle(ws, "A1", "CRUDE – Tabellenmodell Kapitel 1 (Roadmap 0.6)", F_TITEL)
    zelle(ws, "A2", "Gelbe Zellen mit blauer Schrift sind Stellschrauben: ändern, "
          "dann rechnen alle Blätter neu. Schwarze Zellen sind Formeln – nicht überschreiben.",
          F_HINWEIS)
    zelle(ws, "A3", "Werte aus GDD §15 (Startwerte Kapitel 1). Rot markierte Quellen sind "
          "Annahmen, die im GDD noch fehlen.", F_HINWEIS)
    kopfzeile(ws, 4, ["Parameter", "Wert", "Einheit", "Quelle"])
    for i, (name, text, wert, einheit, fmt, quelle, annahme) in enumerate(STARTWERTE):
        z = ERSTE_STARTZEILE + i
        zelle(ws, f"A{z}", text)
        zelle(ws, f"B{z}", wert, F_INPUT, fmt, GELB)
        zelle(ws, f"C{z}", einheit)
        q = zelle(ws, f"D{z}", quelle,
                  Font(name=FONT, size=10, color="C00000" if annahme else "000000"))
        if annahme:
            q.font = Font(name=FONT, size=10, color="C00000", bold=True)
    ws.column_dimensions["A"].width = 52
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 60
    ws.freeze_panes = "A5"


# --- Blatt 2: Runden ------------------------------------------------------
# Spalten des Rundenblatts
SP = dict(
    runde="A", quartal="B", pacht="C", bohren="D", ergebnis="E", groesse="F",
    bar_an="G", schuld_an="H", k_pacht="I", k_bohr="J", zinsen="K",
    foerd="L", silas_bbl="M", erloes="N", foerderzins="O", silas="P",
    cashflow="Q", bar_vor="R", kredit="S", tilgung="T", schuld_end="U",
    bar_end="V", trocken="W", status="X",
)
R0 = 5  # erste Datenzeile (Runde 1)


def rz(r):
    """Zeile einer Runde im Rundenblatt."""
    return R0 + r - 1


def blatt_runden(wb):
    ws = wb.create_sheet("Runden")
    zelle(ws, "A1", "16 Runden (Kapitel 1, Jahr 1–4, je Runde ein Quartal)", F_TITEL)
    zelle(ws, "A2", "Gelb = deine Eingaben je Runde: neue Parzellen pachten, bohren ja/nein, "
          "Ergebnis (Trocken/Fund) und Größe der Lagerstätte bei Fund. "
          "Vorgabe: Pechsträhne – jede Runde eine Bohrung, alle trocken.", F_HINWEIS)
    zelle(ws, "A3", "Ablauf je Runde: Pacht und Bohrung bezahlen, Zinsen zahlen, Öl aus "
          "früheren Funden verkaufen. Reicht das Geld nicht, springt die Bank bis zum "
          "Kreditrahmen ein. Ist auch der ausgeschöpft: PLEITE. Ein Fund fördert ab der "
          "Folgerunde.", F_HINWEIS)
    kopf = ["Runde", "Quartal", "Neue Parzellen pachten", "Bohren? (1/0)", "Ergebnis",
            "Lagerstätte bei Fund (bbl)", "Bargeld Anfang", "Schuld Anfang", "Pachtkosten",
            "Bohrkosten", "Zinsen", "Förderung (bbl)", "davon Silas-Quellen (bbl)",
            "Erlös nach Transport", "Förderzins Landbesitzer", "Anteil Silas",
            "Cashflow der Runde", "Bargeld vor Kredit", "Neuer Kredit", "Tilgung",
            "Schuld Ende", "Bargeld Ende", "Trockenbohrungen bisher", "Status"]
    kopfzeile(ws, 4, kopf)
    ws.row_dimensions[4].height = 42

    dv_erg = DataValidation(type="list", formula1='"Trocken,Fund"', allow_blank=True)
    dv_bin = DataValidation(type="whole", operator="between", formula1="0", formula2="1")
    ws.add_data_validation(dv_erg)
    ws.add_data_validation(dv_bin)

    S = SP
    for r in range(1, RUNDEN + 1):
        z = rz(r)
        prev = z - 1
        jahr, q = (r - 1) // 4 + 1, (r - 1) % 4 + 1
        zelle(ws, f"{S['runde']}{z}", r)
        zelle(ws, f"{S['quartal']}{z}", f"Jahr {jahr} · Q{q}")
        # Eingaben
        zelle(ws, f"{S['pacht']}{z}", 1, F_INPUT, FMT_ZAHL, GELB)
        zelle(ws, f"{S['bohren']}{z}", 1, F_INPUT, FMT_ZAHL, GELB)
        zelle(ws, f"{S['ergebnis']}{z}", "Trocken", F_INPUT, None, GELB)
        zelle(ws, f"{S['groesse']}{z}", 200000, F_INPUT, FMT_BBL, GELB)
        dv_erg.add(f"{S['ergebnis']}{z}")
        dv_bin.add(f"{S['bohren']}{z}")

        if r == 1:
            zelle(ws, f"{S['bar_an']}{z}", f"={REF['start_cash']}", F_LINK, FMT_DOLLAR)
            zelle(ws, f"{S['schuld_an']}{z}", 0, F_NORMAL, FMT_DOLLAR)
            pacht_vorher = "0"
            trocken_vorher = "0"
            status_vorher = '""'
        else:
            zelle(ws, f"{S['bar_an']}{z}", f"={S['bar_end']}{prev}", fmt=FMT_DOLLAR)
            zelle(ws, f"{S['schuld_an']}{z}", f"={S['schuld_end']}{prev}", fmt=FMT_DOLLAR)
            pacht_vorher = f"SUM(${S['pacht']}${R0}:{S['pacht']}{prev})"
            trocken_vorher = f"{S['trocken']}{prev}"
            status_vorher = f"{S['status']}{prev}"
        pacht_bis = f"SUM(${S['pacht']}${R0}:{S['pacht']}{z})"
        frei = REF["free_leases"]
        zelle(ws, f"{S['k_pacht']}{z}",
              f"=(MAX(0,{pacht_bis}-{frei})-MAX(0,{pacht_vorher}-{frei}))*{REF['lease_bonus']}",
              fmt=FMT_DOLLAR)
        zelle(ws, f"{S['k_bohr']}{z}", f"={S['bohren']}{z}*{REF['drill_cost']}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['zinsen']}{z}", f"={S['schuld_an']}{z}*{REF['rate']}/4", fmt=FMT_DOLLAR)
        qz = q_zeile(r)
        zelle(ws, f"{S['foerd']}{z}", f"=SUM(Quellen!$B${qz}:$Q${qz})", F_LINK, FMT_BBL)
        zelle(ws, f"{S['silas_bbl']}{z}",
              f"=SUMPRODUCT(Quellen!$B${qz}:$Q${qz},Quellen!$B$6:$Q$6)", F_LINK, FMT_BBL)
        zelle(ws, f"{S['erloes']}{z}",
              f"={S['foerd']}{z}*({REF['price']}-{REF['transport']})", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['foerderzins']}{z}",
              f"={S['foerd']}{z}*{REF['price']}*{REF['royalty']}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['silas']}{z}",
              f"={S['silas_bbl']}{z}*({REF['price']}-{REF['transport']}"
              f"-{REF['price']}*{REF['royalty']})*{REF['silas_share']}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['cashflow']}{z}",
              f"={S['erloes']}{z}-{S['foerderzins']}{z}-{S['silas']}{z}"
              f"-{S['k_pacht']}{z}-{S['k_bohr']}{z}-{S['zinsen']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['bar_vor']}{z}", f"={S['bar_an']}{z}+{S['cashflow']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['kredit']}{z}",
              f"=IF({S['bar_vor']}{z}<0,MIN(-{S['bar_vor']}{z},"
              f"MAX(0,{REF['credit_limit']}-{S['schuld_an']}{z})),0)", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['tilgung']}{z}",
              f"=IF(AND({REF['auto_repay']}=1,{S['bar_vor']}{z}>0),"
              f"MIN({S['bar_vor']}{z},{S['schuld_an']}{z}),0)", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['schuld_end']}{z}",
              f"={S['schuld_an']}{z}+{S['kredit']}{z}-{S['tilgung']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['bar_end']}{z}",
              f"={S['bar_vor']}{z}+{S['kredit']}{z}-{S['tilgung']}{z}", fmt=FMT_DOLLAR)
        zelle(ws, f"{S['trocken']}{z}",
              f"={trocken_vorher}+IF(AND({S['bohren']}{z}=1,{S['ergebnis']}{z}=\"Trocken\"),1,0)",
              fmt=FMT_ZAHL)
        zelle(ws, f"{S['status']}{z}",
              f"=IF(OR({status_vorher}=\"PLEITE\",{S['bar_end']}{z}<0),\"PLEITE\",\"ok\")",
              bold=True)
        for sp in range(1, len(kopf) + 1):
            ws.cell(row=z, column=sp).border = RAHMEN

    # Ganze Zeile rot, sobald pleite
    letzte = rz(RUNDEN)
    ws.conditional_formatting.add(
        f"A{R0}:X{letzte}",
        FormulaRule(formula=[f'$X{R0}="PLEITE"'], fill=ROT))
    ws.conditional_formatting.add(
        f"X{R0}:X{letzte}", FormulaRule(formula=[f'$X{R0}="ok"'], fill=GRUEN))

    # Zusammenfassung – Texte in Spalte A laufen bis F, Werte stehen in Spalte G
    s = letzte + 2
    zelle(ws, f"A{s}", "Ergebnis", F_TITEL)
    erg = [
        ("Erste Runde mit PLEITE (0 = nie pleite)",
         f'=IF(COUNTIF(X{R0}:X{letzte},"PLEITE")=0,0,'
         f'{RUNDEN}-COUNTIF(X{R0}:X{letzte},"PLEITE")+1)', FMT_ZAHL),
        ("Trockenbohrungen, die Jacob noch bezahlen konnte",
         f"=IF(G{s+1}=0,W{letzte},IF(G{s+1}=1,0,INDEX(W{R0}:W{letzte},G{s+1}-1)))", FMT_ZAHL),
        ("Bargeld am Ende von Runde 16", f"=V{letzte}", FMT_DOLLAR),
        ("Schuld am Ende von Runde 16", f"=U{letzte}", FMT_DOLLAR),
        ("Gefördertes Öl gesamt (bbl)", f"=SUM(L{R0}:L{letzte})", FMT_BBL),
    ]
    for i, (text, formel, fmt) in enumerate(erg, start=1):
        zelle(ws, f"A{s+i}", text, bold=True)
        c = zelle(ws, f"G{s+i}", formel, Font(name=FONT, size=11, bold=True), fmt,
                  PatternFill("solid", fgColor="FFF2CC"))
        c.border = RAHMEN
    zelle(ws, f"A{s+7}", "Hinweis: PLEITE heißt hier „Rechnung nicht mehr bezahlbar“. "
          "Im Spiel folgt laut GDD §8 erst eine Frist von 2 Runden (Notverkauf, Konsortium, "
          "Umschuldung). Die erste PLEITE-Runde ist also der Moment, in dem diese Frist beginnt.",
          F_HINWEIS)

    breiten = {"A": 8, "B": 13, "C": 11, "D": 9, "E": 10, "F": 13}
    for sp in range(1, len(kopf) + 1):
        b = get_column_letter(sp)
        ws.column_dimensions[b].width = breiten.get(b, 12)
    ws.freeze_panes = "C5"
    return s  # Zeile der Überschrift „Ergebnis“


# --- Blatt 3: Quellen -----------------------------------------------------
# Spalte B..Q = Quelle aus Runde 1..16; Zeilen 10..25 Förderung, 30..45 Restreserve
Q_FOERD0 = 10
Q_RESERVE0 = 30


def q_zeile(r):
    return Q_FOERD0 + r - 1


def blatt_quellen(wb):
    ws = wb.create_sheet("Quellen")
    zelle(ws, "A1", "Quellen: Förderung je Fund (Hilfsblatt, nur Formeln)", F_TITEL)
    zelle(ws, "A2", "GDD §15: q_t = q₀ · (1 − D)^t · R_t / R₀ – jede Quelle fördert ab der "
          "Runde nach dem Fund, höchstens bis die Lagerstätte leer ist.", F_HINWEIS)
    zelle(ws, "A3", "Quelle aus Runde", F_BOLD)
    zelle(ws, "A4", "Fund? (1/0)", F_BOLD)
    zelle(ws, "A5", "Fund-Nummer", F_BOLD)
    zelle(ws, "A6", "Silas verdient mit?", F_BOLD)
    zelle(ws, "A7", "Lagerstätte R₀ (bbl)", F_BOLD)
    zelle(ws, f"A{Q_FOERD0-1}", "Förderung je Runde (bbl)", F_BOLD)
    zelle(ws, f"A{Q_RESERVE0-1}", "Restreserve zu Rundenbeginn (bbl)", F_BOLD)

    for j in range(1, RUNDEN + 1):
        c = get_column_letter(j + 1)
        rr = rz(j)
        zelle(ws, f"{c}3", j, F_BOLD).fill = GRAU
        zelle(ws, f"{c}4",
              f'=IF(AND(Runden!$D${rr}=1,Runden!$E${rr}="Fund"),1,0)', F_LINK, FMT_ZAHL)
        zelle(ws, f"{c}5", f"=IF({c}4=1,SUM($B$4:{c}4),0)", fmt=FMT_ZAHL)
        zelle(ws, f"{c}6", f"=IF(AND({c}4=1,{c}5<={REF['silas_wells']}),1,0)", fmt=FMT_ZAHL)
        zelle(ws, f"{c}7", f"=IF({c}4=1,Runden!$F${rr},0)", F_LINK, FMT_BBL)
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
    ws.column_dimensions["A"].width = 30
    for j in range(2, RUNDEN + 2):
        ws.column_dimensions[get_column_letter(j)].width = 10
    ws.freeze_panes = "B4"


# --- Blatt 4: Pleiterechner ----------------------------------------------
PR_KOSTEN = [1500, 2000, 2500, 3000]
PR_RAHMEN = [0, 3000, 6000, 10000]
PR_HILF0 = 24  # erste Rundenzeile im Hilfsblock


def blatt_pleiterechner(wb):
    ws = wb.create_sheet("Pleiterechner")
    zelle(ws, "A1", "Pleiterechner: Wie viele Trockenbohrungen hält Jacob aus?", F_TITEL)
    zelle(ws, "A2", "Annahme: Pechsträhne – jede Runde eine neue Parzelle pachten und bohren, "
          "alles trocken. Pachtbonus, Startgeld, Zins und freie Pachtoptionen kommen aus "
          "„Startwerte“. Bohrkosten (Zeilen) und Kreditrahmen (Spalten) sind hier frei wählbar.",
          F_HINWEIS)

    zelle(ws, "A4", "Bezahlbare Trockenbohrungen, bevor Jacob pleite ist", F_BOLD)
    zelle(ws, "B5", "Bohrkosten ↓ / Kreditrahmen →", F_BOLD).fill = GRAU
    for k, rahmen in enumerate(PR_RAHMEN):
        c = get_column_letter(3 + k)
        zelle(ws, f"{c}5", rahmen, F_INPUT, FMT_DOLLAR, GELB).border = RAHMEN
        zelle(ws, f"{c}12", f"={c}5", fmt=FMT_DOLLAR, bold=True).fill = GRAU
    for i, kosten in enumerate(PR_KOSTEN):
        z = 6 + i
        zelle(ws, f"B{z}", kosten, F_INPUT, FMT_DOLLAR, GELB).border = RAHMEN
        zelle(ws, f"B{z+7}", f"=B{z}", fmt=FMT_DOLLAR, bold=True).fill = GRAU

    zelle(ws, "A11", "Wahrscheinlichkeit, mit all diesen Bohrungen kein Öl zu finden "
          "(Trefferquote aus „Startwerte“)", F_BOLD)
    zelle(ws, "B12", "Bohrkosten ↓ / Kreditrahmen →", F_BOLD).fill = GRAU
    zelle(ws, "A18", "Lesart: Bei 2.000 $ Bohrkosten und 3.000 $ Kredit kann Jacob 2 "
          "Trockenbohrungen bezahlen; die dritte nicht mehr. Ein Fund rettet ihn nicht sicher "
          "– eine „Tasche“ (45 % aller Funde) hat nur 20.000 bbl.", F_HINWEIS)

    # Hilfsblock: je Szenario eine Spalte mit kumulierten Ausgaben
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
                kosten = (f"{c}${PR_HILF0-2}+IF($A{z}>{REF['free_leases']},"
                          f"{REF['lease_bonus']},0)")
                if r == 1:
                    zelle(ws, f"{c}{z}", f"={kosten}", fmt=FMT_DOLLAR)
                else:
                    zins = f"MAX(0,{c}{z-1}-{REF['start_cash']})*{REF['rate']}/4"
                    zelle(ws, f"{c}{z}", f"={c}{z-1}+{kosten}+{zins}", fmt=FMT_DOLLAR)
            grenze = f"({REF['start_cash']}+{c}${PR_HILF0-1})"
            ziel = f"{get_column_letter(3+k)}{6+i}"
            zelle(ws, ziel,
                  f"=SUMPRODUCT(({c}{PR_HILF0}:{c}{letzte}<={grenze})*1)",
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
    blatt_runden(wb)
    blatt_quellen(wb)
    blatt_pleiterechner(wb)
    wb.calculation.fullCalcOnLoad = True  # Excel/Numbers rechnen beim Öffnen neu
    ziel = Path(ziel)
    ziel.parent.mkdir(parents=True, exist_ok=True)
    wb.save(ziel)
    return ziel


if __name__ == "__main__":
    pfad = baue(sys.argv[1] if len(sys.argv) > 1 else ZIEL)
    print(f"geschrieben: {pfad}")
