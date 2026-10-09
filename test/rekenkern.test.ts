import { describe, expect, it } from 'vitest';
import { InvoerFout, bereken, standaardData } from '../src/index';
import type { Invoer, Product, RekenData } from '../src/index';

/** Alles ingevuld; elke test past aan wat hij nodig heeft. */
const basis: Invoer = {
  gewas: 'zaaiuien',
  bedlengte_m: 150,
  perceelbreedte_m: 80,
  bedbreedte_m: 1.5,
  tapesPerBed: 3,
  grond: 'zand_klei',
  bron: 'put',
  bronafstand_m: 100,
  brondebiet_m3u: 20,
  water: 'helder',
  stroom: '400V',
  fertigatie: false,
  automatisch: false,
  tape: 'eenjarig',
  // Het Stadex-formulier voedt vanaf de kopakker; de standaard is het midden (zie de test daarvoor).
  voeding: 'kopakker',
};

describe('situatie 1: het ingevulde Stadex-formulier (uien, 150 × 80 m)', () => {
  const r = bereken(basis, standaardData);

  it('past 53 bedden op 80 m, niet de 100 van het formulier', () => {
    expect(r.ontwerp.aantalBedden).toBe(53);
  });

  it('komt op dezelfde tape en hetzelfde debiet per bed als Stadex', () => {
    expect(r.ontwerp.aantalSlangen).toBe(159);
    expect(r.ontwerp.meterTape).toBe(23850);
    expect(r.ontwerp.bedDebiet_m3u).toBeCloseTo(0.675, 6); // Stadex regel 24: 675 liter per bed
    expect(r.ontwerp.totaalDebiet_m3u).toBeCloseTo(35.775, 6);
  });

  it('voedt de tape van één kant, omdat 150 m binnen de maximale lengte valt', () => {
    expect(r.ontwerp.voedingInMidden).toBe(false);
    expect(r.ontwerp.maxSlanglengte_m).toBeGreaterThan(150);
  });

  it('verdeelt het perceel in secties die binnen de bron passen', () => {
    // Eén bed vraagt 0,675 m³/uur; 90% van 20 m³/uur = 18, dus maximaal 26 bedden per sectie.
    // 53 bedden in 3 secties van 18 bedden = 12,15 m³/uur.
    expect(r.ontwerp.aantalSecties).toBe(3);
    expect(r.ontwerp.beddenPerSectie).toBe(18);
    expect(r.ontwerp.sectieDebiet_m3u).toBeCloseTo(12.15, 6);
    expect(r.ontwerp.sectieDebiet_m3u).toBeLessThanOrEqual(0.9 * 20);
  });

  it('rekent de waterbehoefte op een piekdag', () => {
    // 4,5 mm × Kc 1,05 / 0,9 = 5,25 mm op 1,1925 ha = 62,6 m³.
    expect(r.ontwerp.piekbehoefte_mm).toBeCloseTo(5.25, 6);
    expect(r.ontwerp.dagbehoefte_m3).toBeCloseTo(62.606, 2);
    expect(r.ontwerp.pomptijdPerDag_u).toBeCloseTo(3 * (62.60625 / 35.775), 6);
  });

  it('zet een startkoppeling en eindstop per tapeslang op de stuklijst', () => {
    const aantal = (rol: string) => r.stuklijst.find((l) => l.rol === rol)?.aantal;
    expect(aantal('startkoppeling')).toBe(159);
    expect(aantal('eindstop')).toBe(159);
    expect(aantal('sectieafsluiter')).toBe(3);
  });

  it('telt alle antwoorden als eigen antwoord', () => {
    expect(r.aannames).toEqual([]);
    expect(r.eigenAntwoorden).toBe(9);
    expect(r.bandbreedte).toBeNull();
  });
});

describe('situatie 2: 1 ha aardappelen, rijen van 200 m', () => {
  const r = bereken(
    { ...basis, gewas: 'aardappelen', bedlengte_m: 200, perceelbreedte_m: 50, bedbreedte_m: 0.75, tapesPerBed: 1 },
    standaardData,
  );

  it('voedt de tape vanuit het midden omdat 200 m te lang is', () => {
    expect(r.ontwerp.voedingInMidden).toBe(true);
    expect(r.ontwerp.slanglengte_m).toBe(100);
    expect(r.ontwerp.aantalSlangen).toBe(132);
    expect(r.waarschuwingen.some((w) => w.includes('vanuit het midden'))).toBe(true);
  });

  it('komt uit op het rekenvoorbeeld uit het plan', () => {
    expect(r.ontwerp.aantalBedden).toBe(66);
    expect(r.ontwerp.meterTape).toBe(13200);
    expect(r.ontwerp.totaalDebiet_m3u).toBeCloseTo(44, 6);
    expect(r.ontwerp.aantalSecties).toBe(3);
    expect(r.ontwerp.sectieDebiet_m3u).toBeCloseTo(14.667, 3);
    expect(r.ontwerp.hoofdleiding_mm).toBe(75);
  });
});

describe('situatie 3: de boer weet veel niet', () => {
  const r = bereken(
    { ...basis, bedbreedte_m: null, tapesPerBed: null, grond: null, brondebiet_m3u: null, water: null, stroom: null },
    standaardData,
  );

  it('stuurt naar de offerteroute en telt de aannames', () => {
    expect(r.route).toBe('offerte');
    expect(r.eigenAntwoorden).toBe(4);
    expect(r.aannames.map((a) => a.veld)).toEqual(['bedbreedte_m', 'tapesPerBed', 'grond', 'brondebiet_m3u', 'water', 'stroom']);
  });

  it('kiest de veilige kant: zwaarste filter en dieselpomp', () => {
    expect(r.ontwerp.filtertype).toBe('zand_schijf');
    expect(r.ontwerp.pomptype).toBe('diesel');
    expect(r.ontwerp.brondebiet_m3u).toBe(10);
  });

  it('geeft een bandbreedte voor pomp en secties', () => {
    expect(r.bandbreedte).not.toBeNull();
    const b = r.bandbreedte!;
    expect(b.pompdebiet_m3u.min).toBeLessThan(b.pompdebiet_m3u.max);
    expect(b.aantalSecties.min).toBeLessThan(b.aantalSecties.max);
    expect(b.pompdebiet_m3u.min).toBeLessThanOrEqual(r.ontwerp.sectieDebiet_m3u);
    expect(b.pompdebiet_m3u.max).toBeGreaterThanOrEqual(r.ontwerp.sectieDebiet_m3u);
  });
});

describe('situatie 4: peen met bedden van 500 m', () => {
  const r = bereken({ ...basis, gewas: 'peen', bedlengte_m: 500, bedbreedte_m: null, tapesPerBed: null }, standaardData);

  it('gebruikt meer verdeelleidingen zodat geen tape te lang wordt', () => {
    expect(r.ontwerp.aantalVerdeelleidingen).toBeGreaterThanOrEqual(2);
    expect(r.ontwerp.slanglengte_m).toBeLessThanOrEqual(r.ontwerp.maxSlanglengte_m);
    expect(r.ontwerp.aantalSlangen).toBe(r.ontwerp.aantalBedden * 2 * 2 * r.ontwerp.aantalVerdeelleidingen);
  });
});

describe('situatie 5: leidingwater met weinig debiet', () => {
  const r = bereken({ ...basis, bron: 'leiding', brondebiet_m3u: 3 }, standaardData);

  it('maakt veel kleine secties en waarschuwt dat de bron te klein is', () => {
    expect(r.ontwerp.sectieDebiet_m3u).toBeLessThanOrEqual(2.7);
    expect(r.ontwerp.pomptijdPerDag_u).toBeGreaterThan(20);
    expect(r.waarschuwingen.some((w) => w.includes('bron is te klein'))).toBe(true);
  });
});

describe('waterbron en pomp', () => {
  it('kiest bij slootwater altijd een zandfilter dat zichzelf reinigt', () => {
    const r = bereken({ ...basis, bron: 'sloot' }, standaardData);
    expect(r.ontwerp.filtertype).toBe('zand_schijf');
    expect(r.ontwerp.automatischFilter).toBe(true);
  });

  it('waarschuwt bij ijzerhoudend water', () => {
    const r = bereken({ ...basis, water: 'ijzer' }, standaardData);
    expect(r.waarschuwingen.some((w) => w.includes('IJzerhoudend'))).toBe(true);
  });

  it('waarschuwt als de pomp te zwaar is voor een stopcontact', () => {
    const r = bereken({ ...basis, stroom: '230V', brondebiet_m3u: 60, bronafstand_m: 400 }, standaardData);
    expect(r.ontwerp.pompvermogen_kW).toBeGreaterThan(2.2);
    expect(r.waarschuwingen.some((w) => w.includes('stopcontact'))).toBe(true);
  });

  it('geeft elke melding een soort, zodat de wizard weet wat de boer te zien krijgt', () => {
    const r = bereken({ ...basis, stroom: '230V', brondebiet_m3u: 60, bronafstand_m: 400, water: 'ijzer' }, standaardData);
    const soort = (code: string) => r.meldingen.find((m) => m.code === code)?.soort;
    expect(soort('stroom_te_licht')).toBe('blokkade');
    expect(soort('ijzer')).toBe('uitleg');
    expect(soort('geen_prijs')).toBe('intern');
    expect(r.waarschuwingen).toEqual(r.meldingen.map((m) => m.tekst));
    expect(r.waarschuwingen.join(' ')).not.toMatch(/vakman/i);
  });

  it('zet een magneetklep per sectie en een computer op de lijst bij automatisch', () => {
    const r = bereken({ ...basis, automatisch: true }, standaardData);
    expect(r.stuklijst.find((l) => l.rol === 'magneetklep')?.aantal).toBe(3);
    expect(r.stuklijst.find((l) => l.rol === 'beregeningscomputer')?.product?.stations).toBe(12);
    expect(r.stuklijst.some((l) => l.rol === 'sectieafsluiter')).toBe(false);
  });
});

describe('prijzen', () => {
  const geprijsd = (rol: Product['rol'], prijs: number, extra: Partial<Product> = {}): Product => ({
    id: rol,
    naam: rol,
    rol,
    eenheid: 'stuk',
    prijs,
    geverifieerd: true,
    ...extra,
  });
  const producten: Product[] = [
    geprijsd('driptape', 400, { eenheid: 'rol', rollengte_m: 3000, druppelaarafstand_m: 0.2, druppelaardebiet_lu: 0.3 }),
    geprijsd('startkoppeling', 1.5),
    geprijsd('eindstop', 0.5),
    geprijsd('reparatiekoppeling', 0.4),
    geprijsd('verdeelslang', 300, { eenheid: 'rol', rollengte_m: 100, diameter_inch: 3 }),
    geprijsd('verdeelslang_eindkap', 12),
    geprijsd('sectieafsluiter', 45),
    geprijsd('ontluchter', 25),
    geprijsd('spoelventiel', 15),
    geprijsd('hoofdleiding', 4, { eenheid: 'meter', diameter_mm: 75 }),
    geprijsd('pomp', 2500, { maxDebiet_m3u: 20 }),
    geprijsd('filter', 600, { filtertype: 'schijf', maxDebiet_m3u: 20 }),
    geprijsd('terugslagklep', 60),
    geprijsd('watermeter', 150),
    geprijsd('manometer', 20),
    geprijsd('drukregelaar', 80),
  ];
  const data: RekenData = { gewassen: standaardData.gewassen, producten };

  it('geeft geen totaalprijs als een maat in de producttabel ontbreekt', () => {
    const r = bereken(basis, data);
    expect(r.ontwerp.verdeelslang_inch).toBe(3);
    expect(r.ontwerp.hoofdleiding_mm).toBe(63);
    // De hoofdleiding is 63 mm en er is alleen een 75 mm-product, dus die regel heeft geen prijs.
    expect(r.totaalprijs).toBeNull();
    expect(r.route).toBe('offerte');
  });

  it('telt de stuklijst op als elk product een prijs heeft', () => {
    const r = bereken(basis, { ...data, producten: [...producten, geprijsd('hoofdleiding', 3, { eenheid: 'meter', diameter_mm: 63 })] });
    const som = r.stuklijst.reduce((t, l) => t + (l.totaal ?? NaN), 0);
    expect(r.totaalprijs).toBeCloseTo(som, 2);
    expect(r.route).toBe('bestellen');
    // 23.850 m tape + 3% = 24.566 m, rollen van 3000 m = 9 rollen.
    expect(r.stuklijst.find((l) => l.rol === 'driptape')?.aantal).toBe(9);
    // 80 m + 5% = 84 m verdeelslang, rollen van 100 m = 1 rol.
    expect(r.stuklijst.find((l) => l.rol === 'verdeelslang')).toMatchObject({ aantal: 1, eenheid: 'rol' });
  });

  it('maakt van een product zonder prijs een offerte', () => {
    const zonderPrijs = producten.map((p) => (p.rol === 'pomp' ? { ...p, prijs: null } : p));
    const r = bereken(basis, { ...data, producten: zonderPrijs });
    expect(r.totaalprijs).toBeNull();
    expect(r.route).toBe('offerte');
  });
});

describe('foute invoer', () => {
  it('weigert een onbekend gewas', () => {
    expect(() => bereken({ ...basis, gewas: 'bananen' }, standaardData)).toThrow(InvoerFout);
  });

  it('weigert een perceel dat smaller is dan één bed', () => {
    expect(() => bereken({ ...basis, perceelbreedte_m: 1 }, standaardData)).toThrow(InvoerFout);
  });

  it('weigert een negatief brondebiet', () => {
    expect(() => bereken({ ...basis, brondebiet_m3u: -5 }, standaardData)).toThrow(InvoerFout);
  });
});

describe('voeding: standaard vanuit het midden (besluit 2026-10-09)', () => {
  it('voedt zonder keuze vanuit het midden, ook als de kopakker zou kunnen', () => {
    const r = bereken({ ...basis, voeding: undefined }, standaardData);
    expect(r.ontwerp.voedingInMidden).toBe(true);
    expect(r.ontwerp.kopakkerMogelijk).toBe(true);
    expect(r.ontwerp.aantalSlangen).toBe(53 * 3 * 2);
    expect(r.ontwerp.slanglengte_m).toBe(75);
    // De hoofdleiding loopt door tot de verdeelslang halverwege de bedden.
    expect(r.ontwerp.hoofdleidingLengte_m).toBe(100 + 75);
    expect(r.meldingen.some((m) => m.code === 'voeding_midden')).toBe(false);
  });

  it('negeert de kopakker als één tape de lengte niet aankan', () => {
    const r = bereken({ ...basis, gewas: 'peen', bedlengte_m: 250, grond: 'zand', voeding: 'kopakker' }, standaardData);
    expect(r.ontwerp.kopakkerMogelijk).toBe(false);
    expect(r.ontwerp.voedingInMidden).toBe(true);
    expect(r.meldingen.find((m) => m.code === 'voeding_midden')?.soort).toBe('uitleg');
  });
});

describe('tape: eenjarig of meerjarig', () => {
  it('noemt eenjarige tape een jaarlijkse kost', () => {
    const r = bereken(basis, standaardData);
    expect(r.meldingen.some((m) => m.code === 'tape_jaarlijks')).toBe(true);
    expect(r.stuklijst.find((s) => s.rol === 'driptape')?.omschrijving).toMatch(/^Eenjarige/);
  });

  it('kiest bij meerjarig geen dunne tape uit de producttabel', () => {
    const dun: Product = { id: 'dun', naam: 'Dunne tape', rol: 'driptape', eenheid: 'rol', prijs: null, wanddikte_mil: 6, druppelaarafstand_m: 0.2, druppelaardebiet_lu: 0.3, geverifieerd: false };
    const data: RekenData = { ...standaardData, producten: [dun] };
    expect(bereken(basis, data).stuklijst.find((s) => s.rol === 'driptape')?.product?.id).toBe('dun');
    const r = bereken({ ...basis, tape: 'meerjarig' }, data);
    expect(r.stuklijst.find((s) => s.rol === 'driptape')?.product).toBeNull();
    expect(r.meldingen.some((m) => m.code === 'tape_jaarlijks')).toBe(false);
  });

  it('rekent bij "Weet ik niet" met eenjarige tape', () => {
    const r = bereken({ ...basis, tape: null }, standaardData);
    expect(r.aannames.find((a) => a.veld === 'tape')?.waarde).toBe('eenjarige tape');
  });
});
