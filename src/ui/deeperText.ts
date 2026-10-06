// Spielspaß K1 (Tieferbohren): kurze Texte zur Wette „tiefer oder aufgeben?“ – für Ranch-Fenster,
// Ruths Zettel und die Bohrturm-Akte. Die Zahlen rechnet src/sim/deeper.ts.

import type { DeeperOutlook } from '../sim/deeper';

/** „etwa 6 %“ – ganze Prozent, kleine Werte nicht als 0 %. */
export function schwelleText(breakEven: number): string {
  const p = Math.round(breakEven * 100);
  return p < 1 ? 'unter 1 %' : `etwa ${p} %`;
}

/** Kurzform: „600 m lohnt ab etwa 6 %, Geologe 9 %“ – oder „ein Fund in 600 m käme zu spät“. */
export function deeperShort(outlook: DeeperOutlook | null): string | null {
  if (!outlook) return null;
  if (outlook.breakEven >= 1) return `ein Fund in ${outlook.depth} m käme zu spät`;
  const geologe = outlook.chance === null ? '' : `, Geologe ${Math.round(outlook.chance * 100)} %`;
  return `${outlook.depth} m lohnt ab ${schwelleText(outlook.breakEven)}${geologe}`;
}
