import {
  M_PER_BAR,
  PE_MATEN,
  VERDEELSLANG_MATEN,
  christiansen,
  hazenWilliams,
  kiesMaat,
  m3u_naar_m3s,
  maxSlanglengte,
} from './hydraulica';
import { TEELTWOORDEN } from './types';
import type {
  Aanname,
  Bandbreedte,
  Bron,
  Gewas,
  Grondsoort,
  Melding,
  Invoer,
  Ontwerp,
  Product,
  ProductRol,
  RekenData,
  Resultaat,
  Stroom,
  Stuklijstregel,
  TapeSoort,
  Waterkwaliteit,
} from './types';

/**
 * Vaste uitgangspunten van de berekening. Allemaal vuistregels die de
 * vakman in fase 0 moet nalopen; ze staan hier bij elkaar zodat dat kan.
 */
export const UITGANGSPUNTEN = {
  /** Referentieverdamping op een droge piekdag in Nederland, mm/dag. */
  verdampingPiek_mm: 4.5,
  /** Op zand is de piek hoger omdat de grond minder vasthoudt. */
  verdampingPiekZand_mm: 5.0,
  rendementDruppel: 0.9,
  werkdrukTape_bar: 0.8,
  binnendiameterTape_mm: 15.9,
  /** Wateranalyse: vanaf dit ijzergehalte een zandfilter, en vanaf het tweede beluchting of ontijzering. */
  ijzerFilterVanaf_mgl: 0.2,
  ijzerOntijzerenVanaf_mgl: 1.5,
  /** Wateranalyse: vanaf deze EC kijken we of het water geschikt is voor het gewas. */
  zoutVanaf_mScm: 1.5,
  /** Eenjarige tape is hooguit zo dik; meerjarige tape is dikker. */
  maxWanddikteEenjarig_mil: 8,
  /** Rollengte als het tapeproduct er geen heeft. */
  standaardRollengteTape_m: 2500,
  maxPomptijdPerDag_u: 20,
  /** Eén sectie mag maximaal dit deel van het brondebiet vragen. */
  bronmarge: 0.9,
  verliesKopstation_bar: 0.5,
  maxSnelheidHoofdleiding_ms: 1.5,
  maxSnelheidVerdeelslang_ms: 1.5,
  pomprendement: 0.6,
  /** Grens waarboven een pomp op een gewoon stopcontact niet meer werkt. */
  max230V_kW: 2.2,
  /** Sectiedebiet waarboven een zelfreinigend filter loont. */
  automatischFilterVanaf_m3u: 25,
  reserveTape: 0.03,
  reserveLeiding: 0.05,
  /** Brondebiet als de boer het niet weet: laag (ontwerp) en hoog (bandbreedte). */
  brondebietOnbekend_m3u: {
    put: [10, 40],
    sloot: [20, 60],
    leiding: [2, 5],
  } satisfies Record<Bron, [number, number]>,
} as const;

const STANDAARD_GROND: Grondsoort = 'zand_klei';
const STANDAARD_WATER: Waterkwaliteit = 'algen';
const STANDAARD_STROOM: Stroom = 'geen';

/** Volledig ingevulde invoer: alle "Weet ik niet" vervangen door een waarde. */
type IngevuldeInvoer = Omit<Invoer, 'bedbreedte_m' | 'tapesPerBed' | 'grond' | 'brondebiet_m3u' | 'water' | 'stroom' | 'tape'> & {
  tape: TapeSoort;
  bedbreedte_m: number;
  tapesPerBed: number;
  grond: Grondsoort;
  brondebiet_m3u: number;
  water: Waterkwaliteit;
  stroom: Stroom;
};

export class InvoerFout extends Error {}

export function bereken(invoer: Invoer, data: RekenData): Resultaat {
  const gewas = data.gewassen.find((g) => g.id === invoer.gewas);
  if (!gewas) throw new InvoerFout(`Onbekend gewas: ${invoer.gewas}`);
  controleer(invoer);

  const { ingevuld, aannames } = vulAan(invoer, gewas);
  const meldingen: Melding[] = [];
  const ontwerp = ontwerpSysteem(ingevuld, gewas, data.producten, meldingen);
  const stuklijst = maakStuklijst(ontwerp, ingevuld, data.producten, meldingen);
  const totaalprijs = telOp(stuklijst);

  const bandbreedte = aannames.length > 0 ? berekenBandbreedte(invoer, gewas, data.producten) : null;

  if (totaalprijs === null) {
    meldingen.push({ code: 'geen_prijs', soort: 'intern', tekst: 'Nog niet alle producten hebben een prijs; de prijs volgt in een offerte.' });
  }

  // Elke wizardstap telt als één antwoord; bedbreedte en tapes zijn samen één stap.
  const stappen = 9;
  const onbekendeStappen = new Set(aannames.map((a) => (a.veld === 'tapesPerBed' ? 'bedbreedte_m' : a.veld))).size;

  return {
    route: aannames.length === 0 && totaalprijs !== null ? 'bestellen' : 'offerte',
    ontwerp,
    stuklijst,
    totaalprijs,
    bandbreedte,
    aannames,
    waarschuwingen: meldingen.map((m) => m.tekst),
    meldingen,
    eigenAntwoorden: stappen - onbekendeStappen,
  };
}

function controleer(invoer: Invoer): void {
  if (!(invoer.bedlengte_m > 0)) throw new InvoerFout('De lengte van de bedden of ruggen moet groter zijn dan 0.');
  if (!(invoer.perceelbreedte_m > 0)) throw new InvoerFout('Perceelbreedte moet groter zijn dan 0.');
  if (!(invoer.bronafstand_m >= 0)) throw new InvoerFout('Afstand tot de bron kan niet negatief zijn.');
  if (invoer.bedbreedte_m !== null && !(invoer.bedbreedte_m > 0)) throw new InvoerFout('De breedte van een bed of de afstand tussen de ruggen moet groter zijn dan 0.');
  if (invoer.tapesPerBed !== null && !(Number.isInteger(invoer.tapesPerBed) && invoer.tapesPerBed > 0)) {
    throw new InvoerFout('Aantal tapes per bed of rug moet een heel getal groter dan 0 zijn.');
  }
  if (invoer.brondebiet_m3u !== null && !(invoer.brondebiet_m3u > 0)) throw new InvoerFout('Brondebiet moet groter zijn dan 0.');
}

function vulAan(invoer: Invoer, gewas: Gewas): { ingevuld: IngevuldeInvoer; aannames: Aanname[] } {
  const aannames: Aanname[] = [];
  const neem = <T>(veld: keyof Invoer, waarde: T | null, standaard: T, tekst: string, uitleg: string): T => {
    if (waarde !== null) return waarde;
    aannames.push({ veld, waarde: tekst, uitleg });
    return standaard;
  };

  const [laag] = UITGANGSPUNTEN.brondebietOnbekend_m3u[invoer.bron];
  const ingevuld: IngevuldeInvoer = {
    ...invoer,
    bedbreedte_m: neem('bedbreedte_m', invoer.bedbreedte_m, gewas.bedbreedte_m, `${gewas.bedbreedte_m} m`, `Gangbare ${TEELTWOORDEN[gewas.teeltwijze].breedte} voor ${gewas.naam.toLowerCase()}.`),
    tapesPerBed: neem('tapesPerBed', invoer.tapesPerBed, gewas.tapesPerBed, `${gewas.tapesPerBed}`, `Gangbaar aantal tapes per ${TEELTWOORDEN[gewas.teeltwijze].enkel} voor ${gewas.naam.toLowerCase()}.`),
    grond: neem('grond', invoer.grond, STANDAARD_GROND, 'zavel', 'Tussenwaarde tussen zand en klei.'),
    brondebiet_m3u: neem('brondebiet_m3u', invoer.brondebiet_m3u, laag, `${laag} m³/uur`, 'Voorzichtige schatting voor dit soort bron; meet het met een emmer en een stopwatch.'),
    water: neem('water', invoer.water, STANDAARD_WATER, 'groen of algen', 'We rekenen met het zwaarste filter.'),
    stroom: neem('stroom', invoer.stroom, STANDAARD_STROOM, 'geen stroom', 'We rekenen met een dieselpomp.'),
    tape: neem('tape', invoer.tape, 'eenjarig' as TapeSoort, 'eenjarige tape', 'Gangbaar in de akkerbouw.'),
  };
  return { ingevuld, aannames };
}

function ontwerpSysteem(inv: IngevuldeInvoer, gewas: Gewas, producten: Product[], meldingen: Melding[]): Ontwerp {
  const U = UITGANGSPUNTEN;
  const woord = TEELTWOORDEN[gewas.teeltwijze];
  const druppelaarafstand_m = gewas.druppelaarafstand_m[inv.grond];
  const druppelaardebiet_lu = gewas.druppelaardebiet_lu;
  const debietPerMeter_lu = druppelaardebiet_lu / druppelaarafstand_m;

  const aantalBedden = Math.floor(inv.perceelbreedte_m / inv.bedbreedte_m + 1e-9);
  if (aantalBedden < 1) throw new InvoerFout(`Het perceel is smaller dan één ${woord.enkel}.`);

  // Maximale slanglengte: fabrikantentabel als die er is, anders eigen berekening.
  const tape = zoekTape(producten, druppelaarafstand_m, druppelaardebiet_lu, inv.tape);
  const maxSlanglengte_m =
    tape?.maxLengte_m ?? maxSlanglengte(U.binnendiameterTape_mm, debietPerMeter_lu, U.werkdrukTape_bar);

  // Standaard vanuit het midden; vanaf de kopakker alleen als de boer dat kiest én één tape de lengte aankan.
  const kopakkerMogelijk = inv.bedlengte_m <= maxSlanglengte_m;
  let aantalVerdeelleidingen = 1;
  let voedingInMidden = true;
  let slangenPerTaperij = 2;
  if (kopakkerMogelijk && inv.voeding === 'kopakker') {
    voedingInMidden = false;
    slangenPerTaperij = 1;
  } else if (inv.bedlengte_m > 2 * maxSlanglengte_m) {
    aantalVerdeelleidingen = Math.ceil(inv.bedlengte_m / (2 * maxSlanglengte_m));
    slangenPerTaperij = 2 * aantalVerdeelleidingen;
  }
  if (!kopakkerMogelijk) {
    meldingen.push({
      code: 'voeding_midden',
      soort: 'uitleg',
      tekst:
        `De ${woord.meervoud} zijn langer dan de ${maxSlanglengte_m} m die een tape aankan. ` +
        `De tape wordt daarom vanuit ${aantalVerdeelleidingen === 1 ? 'het midden' : `${aantalVerdeelleidingen} verdeelleidingen`} gevoed.`,
    });
  }
  const slanglengte_m = inv.bedlengte_m / slangenPerTaperij;
  const aantalSlangen = aantalBedden * inv.tapesPerBed * slangenPerTaperij;
  const meterTape = aantalBedden * inv.tapesPerBed * inv.bedlengte_m;
  const aantalDruppelaars = Math.round(meterTape / druppelaarafstand_m);
  const bedDebiet_m3u = (inv.tapesPerBed * inv.bedlengte_m * debietPerMeter_lu) / 1000;
  const totaalDebiet_m3u = aantalBedden * bedDebiet_m3u;

  // Waterbehoefte op een piekdag.
  const beteeldOppervlak_ha = (aantalBedden * inv.bedbreedte_m * inv.bedlengte_m) / 10000;
  const verdamping = inv.grond === 'zand' ? U.verdampingPiekZand_mm : U.verdampingPiek_mm;
  const piekbehoefte_mm = (verdamping * gewas.kc) / U.rendementDruppel;
  const dagbehoefte_m3 = piekbehoefte_mm * beteeldOppervlak_ha * 10;

  // Secties: het kleinste aantal waarbij één sectie binnen de bron past.
  // Een sectie bestaat altijd uit hele bedden.
  const sectieGrens_m3u = U.bronmarge * inv.brondebiet_m3u;
  let maxBeddenPerSectie = Math.floor(sectieGrens_m3u / bedDebiet_m3u + 1e-9);
  if (maxBeddenPerSectie < 1) {
    maxBeddenPerSectie = 1;
    meldingen.push({
      code: 'bron_te_klein_bed',
      soort: 'blokkade',
      tekst: `De bron levert te weinig voor zelfs één ${woord.enkel} (${nl(bedDebiet_m3u)} m³/uur nodig). Splits de ${woord.meervoud} of zoek een grotere bron.`,
    });
  }
  const aantalSecties = Math.ceil(aantalBedden / maxBeddenPerSectie);
  const beddenPerSectie = Math.ceil(aantalBedden / aantalSecties);
  const sectieDebiet_m3u = beddenPerSectie * bedDebiet_m3u;

  // Elke sectie krijgt dezelfde gift, dus elke sectie draait even lang.
  const beregeningstijdPerSectie_u = dagbehoefte_m3 / totaalDebiet_m3u;
  const pomptijdPerDag_u = aantalSecties * beregeningstijdPerSectie_u;
  if (pomptijdPerDag_u > U.maxPomptijdPerDag_u) {
    meldingen.push({
      code: 'pomptijd_te_lang',
      soort: 'blokkade',
      tekst: `Op een droge piekdag moet de pomp ${nl(pomptijdPerDag_u)} uur draaien; meer dan ${U.maxPomptijdPerDag_u} uur is niet haalbaar. De bron is te klein voor dit perceel.`,
    });
  }

  // Leidingen.
  const hoofd = kiesMaat(PE_MATEN, sectieDebiet_m3u, U.maxSnelheidHoofdleiding_ms);
  // Bij voeding in het midden loopt de hoofdleiding door tot de verste verdeelslang.
  const hoofdleidingLengte_m =
    inv.bronafstand_m + (voedingInMidden ? (inv.bedlengte_m * (2 * aantalVerdeelleidingen - 1)) / (2 * aantalVerdeelleidingen) : 0);
  const drukverliesHoofdleiding_bar = hazenWilliams(sectieDebiet_m3u, hoofd.binnen_mm, hoofdleidingLengte_m) / M_PER_BAR;

  const debietPerVerdeelleiding = sectieDebiet_m3u / aantalVerdeelleidingen;
  const verdeel = kiesMaat(VERDEELSLANG_MATEN, debietPerVerdeelleiding, U.maxSnelheidVerdeelslang_ms);
  const sectiebreedte_m = beddenPerSectie * inv.bedbreedte_m;
  const transport_m = Math.max(0, inv.perceelbreedte_m - sectiebreedte_m);
  const drukverliesVerdeelslang_bar =
    (hazenWilliams(debietPerVerdeelleiding, verdeel.binnen_mm, transport_m) +
      hazenWilliams(debietPerVerdeelleiding, verdeel.binnen_mm, sectiebreedte_m) * christiansen(beddenPerSectie)) /
    M_PER_BAR;

  const pompdruk_bar =
    U.werkdrukTape_bar + drukverliesVerdeelslang_bar + drukverliesHoofdleiding_bar + U.verliesKopstation_bar;
  const pompvermogen_kW =
    (1000 * 9.81 * m3u_naar_m3s(sectieDebiet_m3u) * pompdruk_bar * M_PER_BAR) / U.pomprendement / 1000;

  const pomptype = inv.stroom === 'geen' ? 'diesel' : inv.stroom === '230V' ? 'elektrisch_230V' : 'elektrisch_400V';
  if (pomptype === 'elektrisch_230V' && pompvermogen_kW > U.max230V_kW) {
    meldingen.push({
      code: 'stroom_te_licht',
      soort: 'blokkade',
      tekst: `De pomp vraagt ongeveer ${nl(pompvermogen_kW)} kW; dat kan niet op een gewoon stopcontact. Kies krachtstroom (400 V) of een dieselpomp.`,
    });
  }

  // Een wateranalyse maakt het oordeel alleen strenger, nooit milder dan wat de boer ziet.
  const ijzer = inv.ijzer_mgl ?? null;
  const ijzerhoudend = inv.water === 'ijzer' || (ijzer !== null && ijzer >= U.ijzerFilterVanaf_mgl);
  // Slootwater bevat altijd organisch materiaal, ook als het helder lijkt.
  const filtertype = inv.water === 'helder' && inv.bron !== 'sloot' && !ijzerhoudend ? 'schijf' : 'zand_schijf';
  const automatischFilter =
    sectieDebiet_m3u > U.automatischFilterVanaf_m3u || inv.water === 'algen' || inv.bron === 'sloot';
  if (ijzerhoudend) {
    meldingen.push({
      code: 'ijzer',
      soort: 'uitleg',
      tekst:
        ijzer === null
          ? 'IJzerhoudend water laat druppelaars snel verstoppen. Wij kijken of beluchting of ontijzering nodig is.'
          : ijzer >= U.ijzerOntijzerenVanaf_mgl
            ? `Je water bevat ${nl(ijzer)} mg/l ijzer. Dat is veel: wij adviseren beluchting of ontijzering vóór het filter.`
            : `Je water bevat ${nl(ijzer)} mg/l ijzer. Het zandfilter vangt dat op; wij kijken of beluchting nodig is.`,
    });
  }
  if (inv.ec_mScm != null && inv.ec_mScm >= U.zoutVanaf_mScm) {
    meldingen.push({
      code: 'zout',
      soort: 'uitleg',
      tekst: `Je water heeft een EC van ${nl(inv.ec_mScm)} mS/cm. Wij kijken of dat goed gaat bij je gewas.`,
    });
  }
  if (inv.tape === 'eenjarig') {
    meldingen.push({
      code: 'tape_jaarlijks',
      soort: 'uitleg',
      tekst: 'Eenjarige tape koop je elk seizoen opnieuw. Pomp, filter en leidingen gaan jaren mee.',
    });
  }

  return {
    gewas,
    bedbreedte_m: inv.bedbreedte_m,
    tapesPerBed: inv.tapesPerBed,
    grond: inv.grond,
    druppelaarafstand_m,
    druppelaardebiet_lu,
    aantalBedden,
    aantalVerdeelleidingen,
    kopakkerMogelijk,
    tape: inv.tape,
    hoofdleidingLengte_m,
    voedingInMidden,
    slanglengte_m,
    maxSlanglengte_m,
    aantalSlangen,
    meterTape,
    aantalDruppelaars,
    totaalDebiet_m3u,
    bedDebiet_m3u,
    beteeldOppervlak_ha,
    piekbehoefte_mm,
    dagbehoefte_m3,
    brondebiet_m3u: inv.brondebiet_m3u,
    aantalSecties,
    beddenPerSectie,
    sectieDebiet_m3u,
    pomptijdPerDag_u,
    beregeningstijdPerSectie_u,
    hoofdleiding_mm: hoofd.buiten_mm,
    verdeelslang_inch: verdeel.inch,
    drukverliesHoofdleiding_bar,
    drukverliesVerdeelslang_bar,
    pompdruk_bar,
    pompvermogen_kW,
    pomptype,
    filtertype,
    automatischFilter,
  };
}

function zoekTape(producten: Product[], afstand_m: number, debiet_lu: number, soort: TapeSoort): Product | undefined {
  const dikGenoeg = (p: Product) =>
    p.wanddikte_mil === undefined ||
    (soort === 'eenjarig' ? p.wanddikte_mil <= UITGANGSPUNTEN.maxWanddikteEenjarig_mil : p.wanddikte_mil > UITGANGSPUNTEN.maxWanddikteEenjarig_mil);
  return producten.find(
    (p) =>
      p.rol === 'driptape' &&
      dikGenoeg(p) &&
      p.druppelaarafstand_m !== undefined &&
      Math.abs(p.druppelaarafstand_m - afstand_m) < 1e-6 &&
      p.druppelaardebiet_lu !== undefined &&
      Math.abs(p.druppelaardebiet_lu - debiet_lu) < 0.05,
  );
}

function maakStuklijst(o: Ontwerp, inv: IngevuldeInvoer, producten: Product[], meldingen: Melding[]): Stuklijstregel[] {
  const U = UITGANGSPUNTEN;
  const regels: Stuklijstregel[] = [];
  const voeg = (
    rol: ProductRol,
    omschrijving: string,
    aantal: number,
    eenheid: Stuklijstregel['eenheid'],
    uitleg: string,
    // Zonder vijfde argument zoeken we het eerste product met deze rol;
    // null betekent dat er bewust geen passend product is.
    gekozen?: Product | null,
  ) => {
    const product = gekozen === undefined ? producten.find((p) => p.rol === rol) : (gekozen ?? undefined);
    // Een product dat per rol wordt verkocht maar in meters is berekend, rekenen we om naar rollen.
    let n = aantal;
    let e = eenheid;
    if (product && eenheid === 'meter' && product.eenheid === 'rol' && product.rollengte_m) {
      n = Math.ceil(aantal / product.rollengte_m);
      e = 'rol';
    }
    const prijs = product?.prijs ?? null;
    regels.push({
      rol,
      omschrijving: product?.naam ?? omschrijving,
      aantal: n,
      eenheid: e,
      product: product ?? null,
      prijsPerEenheid: prijs,
      totaal: prijs === null ? null : rond(prijs * n, 2),
      uitleg,
    });
  };

  // Veld.
  const tape = zoekTape(producten, o.druppelaarafstand_m, o.druppelaardebiet_lu, o.tape);
  const rollengte = tape?.rollengte_m ?? U.standaardRollengteTape_m;
  if (!tape?.rollengte_m) {
    meldingen.push({ code: 'rollengte_onbekend', soort: 'intern', tekst: `Rollengte van de tape onbekend; gerekend met ${U.standaardRollengteTape_m} m per rol.` });
  }
  const rollenTape = Math.ceil((o.meterTape * (1 + U.reserveTape)) / rollengte);
  regels.push({
    rol: 'driptape',
    omschrijving:
      tape?.naam ??
      `${o.tape === 'eenjarig' ? 'Eenjarige' : 'Meerjarige'} driptape 16 mm, druppelaar om de ${nl(o.druppelaarafstand_m * 100, 0)} cm, ${nl(o.druppelaardebiet_lu, 2)} l/uur`,
    aantal: rollenTape,
    eenheid: 'rol',
    product: tape ?? null,
    prijsPerEenheid: tape?.prijs ?? null,
    totaal: tape?.prijs == null ? null : rond(tape.prijs * rollenTape, 2),
    uitleg: `${geheel(o.meterTape)} m tape plus ${U.reserveTape * 100}% reserve, rollen van ${rollengte} m.`,
  });
  voeg('startkoppeling', 'Startkoppeling met kraantje voor tape 16 mm', o.aantalSlangen, 'stuk', 'Eén per tapeslang, verbindt de tape met de verdeelslang.');
  voeg('eindstop', 'Eindstop voor tape 16 mm', o.aantalSlangen, 'stuk', 'Eén per tapeslang; los te maken om door te spoelen.');
  voeg(
    'reparatiekoppeling',
    'Rechte koppeling tape 16 mm',
    Math.max(10, Math.ceil(o.aantalSlangen * 0.05)),
    'stuk',
    'Reserve voor reparaties en verlengen.',
  );

  // Verdeling.
  const verdeelslang = producten.find((p) => p.rol === 'verdeelslang' && p.diameter_inch === o.verdeelslang_inch);
  voeg(
    'verdeelslang',
    `Platoprolbare verdeelslang ${o.verdeelslang_inch}"`,
    Math.ceil(o.aantalVerdeelleidingen * inv.perceelbreedte_m * (1 + U.reserveLeiding)),
    'meter',
    `${o.aantalVerdeelleidingen === 1 ? 'Eén verdeelslang' : `${o.aantalVerdeelleidingen} verdeelslangen`} over de volle breedte van ${geheel(inv.perceelbreedte_m)} m.`,
    verdeelslang ?? null,
  );
  voeg('verdeelslang_eindkap', `Eindkap verdeelslang ${o.verdeelslang_inch}"`, o.aantalVerdeelleidingen, 'stuk', 'Sluit het eind van de verdeelslang af.');
  if (inv.automatisch) {
    voeg('magneetklep', 'Magneetklep per sectie', o.aantalSecties, 'stuk', 'Opent en sluit een sectie automatisch.');
    const computer = producten.find((p) => p.rol === 'beregeningscomputer' && (p.stations ?? 0) >= o.aantalSecties);
    voeg('beregeningscomputer', `Beregeningscomputer met ${o.aantalSecties} stations of meer`, 1, 'stuk', 'Laat de secties na elkaar lopen.', computer ?? null);
  } else {
    voeg('sectieafsluiter', 'Handbediende sectieafsluiter', o.aantalSecties, 'stuk', 'Eén per sectie, om de secties om de beurt open te zetten.');
  }
  voeg('ontluchter', 'Be- en ontluchtingsventiel', o.aantalSecties, 'stuk', 'Eén per sectie; voorkomt lucht en vacuüm in de leiding.');
  voeg('spoelventiel', 'Spoelventiel', o.aantalSecties * o.aantalVerdeelleidingen, 'stuk', 'Om de verdeelslang per sectie schoon te spoelen.');

  // Hoofdleiding.
  if (o.hoofdleidingLengte_m > 0) {
    voeg(
      'hoofdleiding',
      `PE-buis ${o.hoofdleiding_mm} mm`,
      Math.ceil(o.hoofdleidingLengte_m * (1 + U.reserveLeiding)),
      'meter',
      o.voedingInMidden
        ? `Van de bron tot de verdeelslang in het perceel, ${geheel(o.hoofdleidingLengte_m)} m plus reserve.`
        : `Van de bron naar het perceel, ${geheel(o.hoofdleidingLengte_m)} m plus reserve.`,
      producten.find((p) => p.rol === 'hoofdleiding' && p.diameter_mm === o.hoofdleiding_mm) ?? null,
    );
  }

  // Kopstation.
  voeg(
    'pomp',
    `${o.pomptype === 'diesel' ? 'Dieselpomp' : 'Elektrische pomp'} ${nl(o.sectieDebiet_m3u)} m³/uur bij ${nl(o.pompdruk_bar)} bar`,
    1,
    'stuk',
    `Levert één sectie tegelijk; ongeveer ${nl(o.pompvermogen_kW)} kW.`,
    producten.find((p) => p.rol === 'pomp' && p.maxDebiet_m3u !== undefined && p.maxDebiet_m3u >= o.sectieDebiet_m3u) ?? null,
  );
  voeg(
    'filter',
    `${o.filtertype === 'schijf' ? 'Schijffilter' : 'Zandfilter met schijffilter'}${o.automatischFilter ? ', zelfreinigend' : ''}, ${nl(o.sectieDebiet_m3u)} m³/uur`,
    1,
    'stuk',
    o.filtertype === 'schijf' ? 'Schoon water: een schijffilter is genoeg.' : 'Sloot-, algen- of ijzerhoudend water vraagt een zandfilter vóór het schijffilter.',
    producten.find(
      (p) => p.rol === 'filter' && p.filtertype === o.filtertype && p.maxDebiet_m3u !== undefined && p.maxDebiet_m3u >= o.sectieDebiet_m3u,
    ) ?? null,
  );
  voeg('terugslagklep', `Terugslagklep ${o.hoofdleiding_mm} mm`, 1, 'stuk', 'Voorkomt dat water met mest terug de bron in loopt.');
  voeg('watermeter', `Watermeter ${o.hoofdleiding_mm} mm`, 1, 'stuk', 'Om het verbruik bij te houden.');
  voeg('manometer', 'Manometer 0-6 bar', 2, 'stuk', 'Voor en na het filter, om te zien wanneer het filter vol zit.');
  voeg('drukregelaar', `Drukregelaar ${nl(U.werkdrukTape_bar)} bar`, 1, 'stuk', 'Tape kan maar beperkte druk aan.');
  if (inv.fertigatie) {
    voeg('fertigatie', `Bemestingsunit voor ${nl(o.sectieDebiet_m3u)} m³/uur`, 1, 'stuk', 'Geeft mest mee met het water.');
  }

  return regels;
}

function telOp(regels: Stuklijstregel[]): number | null {
  let som = 0;
  for (const r of regels) {
    if (r.totaal === null) return null;
    som += r.totaal;
  }
  return rond(som, 2);
}

/**
 * Rekent alle mogelijke antwoorden op de "Weet ik niet"-vragen door en geeft
 * per kerngetal het laagste en hoogste resultaat.
 */
function berekenBandbreedte(invoer: Invoer, gewas: Gewas, producten: Product[]): NonNullable<Resultaat['bandbreedte']> {
  const opties = {
    grond: invoer.grond !== null ? [invoer.grond] : (['zand', 'zand_klei', 'klei', 'veen'] as Grondsoort[]),
    brondebiet_m3u:
      invoer.brondebiet_m3u !== null ? [invoer.brondebiet_m3u] : [...UITGANGSPUNTEN.brondebietOnbekend_m3u[invoer.bron]],
    water: invoer.water !== null ? [invoer.water] : (['helder', 'ijzer', 'algen'] as Waterkwaliteit[]),
    stroom: invoer.stroom !== null ? [invoer.stroom] : (['geen', '230V', '400V'] as Stroom[]),
  };

  const meter: number[] = [];
  const pomp: number[] = [];
  const secties: number[] = [];
  const prijzen: Array<number | null> = [];
  for (const grond of opties.grond)
    for (const brondebiet_m3u of opties.brondebiet_m3u)
      for (const water of opties.water)
        for (const stroom of opties.stroom) {
          const inv: IngevuldeInvoer = {
            ...invoer,
            bedbreedte_m: invoer.bedbreedte_m ?? gewas.bedbreedte_m,
            tapesPerBed: invoer.tapesPerBed ?? gewas.tapesPerBed,
            tape: invoer.tape ?? 'eenjarig',
            grond,
            brondebiet_m3u,
            water,
            stroom,
          };
          const w: Melding[] = [];
          const o = ontwerpSysteem(inv, gewas, producten, w);
          meter.push(o.meterTape);
          pomp.push(o.sectieDebiet_m3u);
          secties.push(o.aantalSecties);
          prijzen.push(telOp(maakStuklijst(o, inv, producten, w)));
        }

  const band = (xs: number[]): Bandbreedte => ({ min: Math.min(...xs), max: Math.max(...xs) });
  const bekendePrijzen = prijzen.filter((p): p is number => p !== null);
  return {
    meterTape: band(meter),
    pompdebiet_m3u: band(pomp),
    aantalSecties: band(secties),
    totaalprijs: bekendePrijzen.length === prijzen.length ? band(bekendePrijzen) : null,
  };
}

function rond(x: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(x * f) / f;
}

function geheel(x: number): string {
  return Math.round(x).toLocaleString('nl-NL');
}

/** Getal met Nederlandse komma, voor teksten die de boer leest. */
function nl(x: number, decimalen = 1): string {
  return rond(x, decimalen).toLocaleString('nl-NL', { maximumFractionDigits: decimalen });
}
