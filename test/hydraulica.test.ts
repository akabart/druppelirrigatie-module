import { describe, expect, it } from 'vitest';
import { PE_MATEN, christiansen, hazenWilliams, kiesMaat, maxSlanglengte, snelheid } from '../src/hydraulica';

describe('hydraulica', () => {
  it('rekent de stroomsnelheid uit', () => {
    // 14,67 m³/uur door 66 mm binnendiameter: 0,004074 m³/s / 0,003421 m² = 1,19 m/s.
    expect(snelheid(14.67, 66)).toBeCloseTo(1.19, 2);
  });

  it('rekent drukverlies met Hazen-Williams zoals met de hand', () => {
    // Handberekening: 10,67 × 100 × 0,004074^1,852 / (140^1,852 × 0,066^4,87) ≈ 2,38 m.
    expect(hazenWilliams(14.67, 66, 100)).toBeCloseTo(2.38, 1);
  });

  it('verdubbelt het verlies ruim bij twee keer zoveel water', () => {
    expect(hazenWilliams(20, 66, 100) / hazenWilliams(10, 66, 100)).toBeCloseTo(2 ** 1.852, 3);
  });

  it('geeft de Christiansen-factor voor veel uitstroompunten', () => {
    expect(christiansen(1)).toBe(1);
    // Tabelwaarde voor 10 uitstroompunten bij m = 1,852 is 0,402.
    expect(christiansen(10)).toBeCloseTo(0.402, 3);
    expect(christiansen(1000)).toBeCloseTo(0.351, 3);
  });

  it('geeft een maximale tapelengte van rond de 100 m bij 20 cm en 1 l/uur', () => {
    // Handberekening met Blasius: bij 100 m is het verlies ongeveer 1,7 m, de grens is 20% van 0,8 bar = 1,63 m.
    const max = maxSlanglengte(15.9, 1.0 / 0.2, 0.8);
    expect(max).toBeGreaterThan(90);
    expect(max).toBeLessThan(110);
  });

  it('laat tape langer worden als er minder water per meter uit komt', () => {
    expect(maxSlanglengte(15.9, 1.5, 0.8)).toBeGreaterThan(maxSlanglengte(15.9, 5, 0.8));
  });

  it('kiest de kleinste leiding waarin het water niet te snel stroomt', () => {
    expect(kiesMaat(PE_MATEN, 14.67, 1.5).buiten_mm).toBe(75);
    expect(kiesMaat(PE_MATEN, 12.15, 1.5).buiten_mm).toBe(63);
  });
});
