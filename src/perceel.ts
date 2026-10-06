// Van een perceel op de kaart naar de maten waarmee de rekenkern rekent.
// Coördinaten zijn [lengtegraad, breedtegraad] (WGS84), zoals in GeoJSON.

export type LonLat = [number, number];
type Punt = { x: number; y: number };

export interface PerceelMaten {
  oppervlak_m2: number;
  /** Breedte dwars op de bedden. */
  breedte_m: number;
  /** Oppervlak gedeeld door breedte: geeft samen met de breedte precies de juiste meters tape. */
  gemiddeldeBedlengte_m: number;
  langsteBedlengte_m: number;
  /** Richting van de bedden in graden vanaf het oosten, tegen de klok in (0 tot 180). */
  richting_graden: number;
}

const M_PER_GRAAD_BREEDTE = 110_540;
const M_PER_GRAAD_LENGTE_EVENAAR = 111_320;

/** Platte projectie rond het eerste punt; ruim nauwkeurig genoeg voor één perceel. */
function projecteer(punten: LonLat[], oorsprong: LonLat): Punt[] {
  const kx = M_PER_GRAAD_LENGTE_EVENAAR * Math.cos((oorsprong[1] * Math.PI) / 180);
  return punten.map(([lon, lat]) => ({ x: (lon - oorsprong[0]) * kx, y: (lat - oorsprong[1]) * M_PER_GRAAD_BREEDTE }));
}

/** Haalt een dubbel eindpunt (gesloten ring) weg. */
function openRing(ring: LonLat[]): LonLat[] {
  const a = ring[0];
  const b = ring[ring.length - 1];
  return a && b && ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

function oppervlak(p: Punt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Richting van de langste zijde, in radialen. */
export function langsteZijde(ring: LonLat[]): number {
  const p = projecteer(openRing(ring), ring[0]!);
  let beste = 0;
  let hoek = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > beste) {
      beste = l;
      hoek = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  return hoek;
}

/**
 * Meet het perceel op met de bedden in de opgegeven richting (standaard
 * evenwijdig aan de langste zijde). Gaten in het perceel tellen niet mee.
 */
export function meetPerceel(ring: LonLat[], richting_rad?: number): PerceelMaten {
  const open = openRing(ring);
  if (open.length < 3) throw new Error('Een perceel heeft minstens drie hoekpunten nodig.');
  const hoek = richting_rad ?? langsteZijde(open);
  const p = projecteer(open, open[0]!);
  const cos = Math.cos(-hoek);
  const sin = Math.sin(-hoek);
  // Draai zo dat de bedden langs de x-as lopen.
  const r = p.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
  const ys = r.map((q) => q.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const breedte = maxY - minY;
  const opp = oppervlak(p);

  // Langste bed: leg om de halve meter een lijn over het perceel en meet het langste stuk binnen de grens.
  let langste = 0;
  const stappen = Math.max(20, Math.min(4000, Math.ceil(breedte / 0.5)));
  for (let s = 0; s < stappen; s++) {
    const y = minY + ((s + 0.5) / stappen) * breedte;
    const xs: number[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) langste = Math.max(langste, xs[i + 1]! - xs[i]!);
  }

  return {
    oppervlak_m2: opp,
    breedte_m: breedte,
    gemiddeldeBedlengte_m: breedte > 0 ? opp / breedte : 0,
    langsteBedlengte_m: langste,
    richting_graden: (((hoek * 180) / Math.PI) % 180 + 180) % 180,
  };
}

/** Kortste afstand in meter van een punt tot de rand van het perceel; 0 als het punt erin ligt. */
export function afstandTotPerceel(punt: LonLat, ring: LonLat[]): number {
  const open = openRing(ring);
  if (ligtIn(punt, open)) return 0;
  const [q, ...p] = projecteer([punt, ...open], punt);
  let kortste = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((q!.x - a.x) * dx + (q!.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    kortste = Math.min(kortste, Math.hypot(a.x + t * dx - q!.x, a.y + t * dy - q!.y));
  }
  return kortste;
}

export function ligtIn([x, y]: LonLat, ring: LonLat[]): boolean {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}
