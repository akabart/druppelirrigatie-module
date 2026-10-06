import { describe, expect, it } from 'vitest';
import { afstandTotPerceel, ligtIn, meetPerceel, type LonLat } from '../src/perceel';

// Punten in meters rond een plek bij Emmeloord, omgezet naar lengte- en breedtegraad.
const O: LonLat = [5.75, 52.71];
const kx = 111_320 * Math.cos((O[1] * Math.PI) / 180);
const ll = (x: number, y: number): LonLat => [O[0] + x / kx, O[1] + y / 110_540];

function gedraaid(punten: [number, number][], graden: number): LonLat[] {
  const h = (graden * Math.PI) / 180;
  return punten.map(([x, y]) => ll(x * Math.cos(h) - y * Math.sin(h), x * Math.sin(h) + y * Math.cos(h)));
}

describe('meetPerceel', () => {
  it('meet een recht perceel van 150 bij 80 m', () => {
    const m = meetPerceel([ll(0, 0), ll(150, 0), ll(150, 80), ll(0, 80), ll(0, 0)]);
    expect(m.oppervlak_m2).toBeCloseTo(12_000, -1);
    expect(m.breedte_m).toBeCloseTo(80, 0);
    expect(m.gemiddeldeBedlengte_m).toBeCloseTo(150, 0);
    expect(m.langsteBedlengte_m).toBeCloseTo(150, 0);
  });

  it('legt de bedden langs de langste zijde, ook als het perceel scheef ligt', () => {
    const m = meetPerceel(gedraaid([[0, 0], [300, 0], [300, 60], [0, 60]], 30));
    expect(m.richting_graden).toBeCloseTo(30, 0);
    expect(m.breedte_m).toBeCloseTo(60, 0);
    expect(m.gemiddeldeBedlengte_m).toBeCloseTo(300, 0);
  });

  it('geeft bij een driehoek de gemiddelde en de langste bedlengte', () => {
    // Bedden langs de x-as; ze lopen van 200 m aan de onderkant tot 0 m aan de top.
    const m = meetPerceel([ll(0, 0), ll(200, 0), ll(0, 100)], 0);
    expect(m.oppervlak_m2).toBeCloseTo(10_000, -1);
    expect(m.breedte_m).toBeCloseTo(100, 0);
    expect(m.gemiddeldeBedlengte_m).toBeCloseTo(100, 0);
    expect(m.langsteBedlengte_m).toBeGreaterThan(198);
  });

  it('kan de bedden een kwartslag draaien', () => {
    const m = meetPerceel([ll(0, 0), ll(150, 0), ll(150, 80), ll(0, 80)], Math.PI / 2);
    expect(m.breedte_m).toBeCloseTo(150, 0);
    expect(m.gemiddeldeBedlengte_m).toBeCloseTo(80, 0);
  });
});

describe('afstandTotPerceel', () => {
  const vak = [ll(0, 0), ll(100, 0), ll(100, 100), ll(0, 100)];
  it('meet de kortste afstand tot de rand', () => {
    expect(afstandTotPerceel(ll(-40, 50), vak)).toBeCloseTo(40, 0);
    expect(afstandTotPerceel(ll(130, 140), vak)).toBeCloseTo(50, 0);
  });
  it('is 0 als de bron op het perceel ligt', () => {
    expect(ligtIn(ll(50, 50), vak)).toBe(true);
    expect(afstandTotPerceel(ll(50, 50), vak)).toBe(0);
  });
});
