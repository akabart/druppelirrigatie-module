// Hydraulische basisformules. Alles in SI tenzij de naam anders zegt.

const G = 9.81;
/** Kinematische viscositeit van water bij ongeveer 15 °C, m²/s. */
const NU = 1.14e-6;
/** 1 bar = 10,2 m waterkolom. */
export const M_PER_BAR = 10.2;

export const m3u_naar_m3s = (q: number) => q / 3600;

/** Stroomsnelheid in m/s bij debiet in m³/uur en binnendiameter in mm. */
export function snelheid(debiet_m3u: number, binnendiameter_mm: number): number {
  const d = binnendiameter_mm / 1000;
  return m3u_naar_m3s(debiet_m3u) / ((Math.PI * d * d) / 4);
}

/**
 * Drukverlies volgens Hazen-Williams, in meter waterkolom.
 * C = 140 voor PE en PVC.
 */
export function hazenWilliams(debiet_m3u: number, binnendiameter_mm: number, lengte_m: number, c = 140): number {
  const q = m3u_naar_m3s(debiet_m3u);
  const d = binnendiameter_mm / 1000;
  return (10.67 * lengte_m * Math.pow(q, 1.852)) / (Math.pow(c, 1.852) * Math.pow(d, 4.87));
}

/**
 * Christiansen-factor: een leiding met n gelijke uitstroompunten verliest
 * minder druk dan een leiding die het hele debiet tot het eind draagt.
 */
export function christiansen(n: number, m = 1.852): number {
  if (n <= 1) return 1;
  return 1 / (m + 1) + 1 / (2 * n) + Math.sqrt(m - 1) / (6 * n * n);
}

/**
 * Drukverlies in een druppelslang (gladde buis, Blasius) met gelijkmatig
 * verdeelde druppelaars, in meter waterkolom.
 */
export function verliesDruppelslang(lengte_m: number, binnendiameter_mm: number, debietPerMeter_lu: number): number {
  const d = binnendiameter_mm / 1000;
  const q = (debietPerMeter_lu * lengte_m) / 1000 / 3600;
  const v = q / ((Math.PI * d * d) / 4);
  if (v === 0) return 0;
  const re = (v * d) / NU;
  // Blasius voor turbulent, Hagen-Poiseuille voor laminair.
  const f = re < 2000 ? 64 / re : 0.316 * Math.pow(re, -0.25);
  const volleStroom = (f * lengte_m * v * v) / (d * 2 * G);
  // Bij Blasius is de exponent op het debiet 1,75.
  return volleStroom * christiansen(1000, 1.75);
}

/**
 * Langste druppelslang waarbij de druk aan het eind nog minstens
 * (1 - toegestaneVariatie) van de druk aan het begin is. Bij tape met een
 * druppelaarexponent van 0,5 geeft 20% drukverschil ongeveer 10%
 * afgifteverschil, de gangbare ontwerpgrens.
 */
export function maxSlanglengte(
  binnendiameter_mm: number,
  debietPerMeter_lu: number,
  werkdruk_bar: number,
  toegestaneVariatie = 0.2,
): number {
  const grens = werkdruk_bar * M_PER_BAR * toegestaneVariatie;
  let lo = 1;
  let hi = 2000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (verliesDruppelslang(mid, binnendiameter_mm, debietPerMeter_lu) <= grens) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}

/** Standaard PE-maten met binnendiameter (PE100, SDR17), in mm. */
export const PE_MATEN: ReadonlyArray<{ buiten_mm: number; binnen_mm: number }> = [
  { buiten_mm: 32, binnen_mm: 28.0 },
  { buiten_mm: 40, binnen_mm: 35.2 },
  { buiten_mm: 50, binnen_mm: 44.0 },
  { buiten_mm: 63, binnen_mm: 55.4 },
  { buiten_mm: 75, binnen_mm: 66.0 },
  { buiten_mm: 90, binnen_mm: 79.2 },
  { buiten_mm: 110, binnen_mm: 96.8 },
  { buiten_mm: 125, binnen_mm: 110.2 },
  { buiten_mm: 160, binnen_mm: 141.0 },
];

/** Plat oprolbare verdeelslang, binnendiameter in mm. */
export const VERDEELSLANG_MATEN: ReadonlyArray<{ inch: number; binnen_mm: number }> = [
  { inch: 2, binnen_mm: 51 },
  { inch: 3, binnen_mm: 76 },
  { inch: 4, binnen_mm: 102 },
  { inch: 6, binnen_mm: 152 },
];

export function kiesMaat<T extends { binnen_mm: number }>(
  maten: ReadonlyArray<T>,
  debiet_m3u: number,
  maxSnelheid_ms: number,
): T {
  const passend = maten.find((m) => snelheid(debiet_m3u, m.binnen_mm) <= maxSnelheid_ms);
  return passend ?? maten[maten.length - 1]!;
}
