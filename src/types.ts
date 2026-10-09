// Alle typen van de rekenkern. Lengtes in meter, debieten in m³/uur
// tenzij de naam anders zegt (bijvoorbeeld _lu = liter per uur).

export type Grondsoort = 'zand' | 'zand_klei' | 'klei' | 'veen';
export type Bron = 'put' | 'sloot' | 'leiding';
export type Waterkwaliteit = 'helder' | 'ijzer' | 'algen';
export type Stroom = 'geen' | '230V' | '400V';

/**
 * Wat de boer invult. `null` betekent "Weet ik niet": de rekenkern vult dan
 * een standaard in, rekent de uitersten door en stuurt naar de offerteroute.
 */
export interface Invoer {
  gewas: string;
  /** Lengte van de bedden (in de rijrichting). */
  bedlengte_m: number;
  /** Breedte van het perceel, dwars op de bedden. */
  perceelbreedte_m: number;
  bedbreedte_m: number | null;
  tapesPerBed: number | null;
  grond: Grondsoort | null;
  bron: Bron;
  /** Afstand van de bron tot de kop van het perceel. */
  bronafstand_m: number;
  brondebiet_m3u: number | null;
  water: Waterkwaliteit | null;
  stroom: Stroom | null;
  fertigatie: boolean;
  automatisch: boolean;
  /** Eenjarige tape koop je elk seizoen opnieuw; meerjarige is dikker en gaat een paar jaar mee. */
  tape: TapeSoort | null;
  /**
   * Waar de verdeelslang ligt. Standaard in het midden (gangbaar in de polder, besluit Bart 2026-10-09);
   * 'kopakker' kan alleen als één tape de hele lengte aankan.
   */
  voeding?: Voeding;
}

export type TapeSoort = 'eenjarig' | 'meerjarig';
export type Voeding = 'midden' | 'kopakker';

export type Teeltwijze = 'bed' | 'rug';

/** Woorden voor de teeltvorm, zodat we bij aardappelen en peen over ruggen praten. */
export const TEELTWOORDEN: Record<Teeltwijze, { enkel: string; meervoud: string; breedte: string }> = {
  bed: { enkel: 'bed', meervoud: 'bedden', breedte: 'bedbreedte' },
  rug: { enkel: 'rug', meervoud: 'ruggen', breedte: 'afstand tussen de ruggen' },
};

export interface Gewas {
  id: string;
  naam: string;
  /** Liggen de tapes in bedden of op ruggen? Alleen voor de woorden, niet voor de berekening. */
  teeltwijze: Teeltwijze;
  bedbreedte_m: number;
  tapesPerBed: number;
  druppelaarafstand_m: Record<Grondsoort, number>;
  druppelaardebiet_lu: number;
  /** Gewasfactor in de piekmaand. */
  kc: number;
  /** Waar de standaardwaarden vandaan komen, zodat de vakman ze kan nalopen. */
  bron: string;
}

export type ProductRol =
  | 'driptape'
  | 'startkoppeling'
  | 'eindstop'
  | 'reparatiekoppeling'
  | 'verdeelslang'
  | 'verdeelslang_eindkap'
  | 'hoofdleiding'
  | 'sectieafsluiter'
  | 'magneetklep'
  | 'beregeningscomputer'
  | 'ontluchter'
  | 'spoelventiel'
  | 'filter'
  | 'terugslagklep'
  | 'watermeter'
  | 'manometer'
  | 'drukregelaar'
  | 'pomp'
  | 'fertigatie';

/**
 * Een product zoals het later ook als WooCommerce-product bestaat.
 * `prijs: null` = prijs op aanvraag.
 */
export interface Product {
  id: string;
  naam: string;
  rol: ProductRol;
  eenheid: 'stuk' | 'meter' | 'rol';
  prijs: number | null;
  rollengte_m?: number;
  diameter_mm?: number;
  diameter_inch?: number;
  wanddikte_mil?: number;
  druppelaarafstand_m?: number;
  druppelaardebiet_lu?: number;
  /** Maximale slanglengte volgens de fabrikant; overschrijft de eigen berekening. */
  maxLengte_m?: number;
  filtertype?: 'schijf' | 'zand_schijf';
  maxDebiet_m3u?: number;
  /** Aantal stations van een beregeningscomputer. */
  stations?: number;
  bronUrl?: string;
  /** false zolang de specificaties niet zijn nagelopen. */
  geverifieerd: boolean;
}

export interface RekenData {
  gewassen: Gewas[];
  producten: Product[];
}

export interface Stuklijstregel {
  rol: ProductRol;
  omschrijving: string;
  aantal: number;
  eenheid: 'stuk' | 'meter' | 'rol';
  product: Product | null;
  prijsPerEenheid: number | null;
  totaal: number | null;
  uitleg: string;
}

export interface Aanname {
  veld: keyof Invoer;
  waarde: string;
  uitleg: string;
}

export interface Ontwerp {
  gewas: Gewas;
  bedbreedte_m: number;
  tapesPerBed: number;
  grond: Grondsoort;
  druppelaarafstand_m: number;
  druppelaardebiet_lu: number;
  aantalBedden: number;
  /** Aantal verdeelleidingen dwars over het perceel. */
  aantalVerdeelleidingen: number;
  /** true = tape wordt van twee kanten gevoed (verdeelleiding in het midden). */
  voedingInMidden: boolean;
  /** true = de bedden zijn zo kort dat voeden vanaf de kopakker ook kan. */
  kopakkerMogelijk: boolean;
  tape: TapeSoort;
  /** Hoofdleiding van de bron tot de verste verdeelslang. */
  hoofdleidingLengte_m: number;
  slanglengte_m: number;
  maxSlanglengte_m: number;
  aantalSlangen: number;
  meterTape: number;
  aantalDruppelaars: number;
  totaalDebiet_m3u: number;
  bedDebiet_m3u: number;
  beteeldOppervlak_ha: number;
  piekbehoefte_mm: number;
  dagbehoefte_m3: number;
  brondebiet_m3u: number;
  aantalSecties: number;
  beddenPerSectie: number;
  sectieDebiet_m3u: number;
  pomptijdPerDag_u: number;
  beregeningstijdPerSectie_u: number;
  hoofdleiding_mm: number;
  verdeelslang_inch: number;
  drukverliesHoofdleiding_bar: number;
  drukverliesVerdeelslang_bar: number;
  pompdruk_bar: number;
  pompvermogen_kW: number;
  pomptype: 'elektrisch_230V' | 'elektrisch_400V' | 'diesel';
  filtertype: 'schijf' | 'zand_schijf';
  automatischFilter: boolean;
}

/**
 * Een melding bij de uitkomst. `soort` zegt hoe de wizard hem toont:
 * - `uitleg`: hoort bij het ontwerp, de boer ziet het als "goed om te weten";
 * - `blokkade`: zo werkt het niet, de boer moet iets aanpassen of wij kijken mee;
 * - `intern`: alleen voor ons, gaat mee in de aanvraag maar niet op het scherm.
 */
export interface Melding {
  code: 'geen_prijs' | 'rollengte_onbekend' | 'voeding_midden' | 'bron_te_klein_bed' | 'pomptijd_te_lang' | 'stroom_te_licht' | 'ijzer' | 'tape_jaarlijks';
  soort: 'uitleg' | 'blokkade' | 'intern';
  tekst: string;
}

export interface Bandbreedte {
  min: number;
  max: number;
}

export interface Resultaat {
  route: 'bestellen' | 'offerte';
  ontwerp: Ontwerp;
  stuklijst: Stuklijstregel[];
  totaalprijs: number | null;
  /** Alleen gevuld bij "Weet ik niet": uitersten over alle mogelijke antwoorden. */
  bandbreedte: {
    meterTape: Bandbreedte;
    pompdebiet_m3u: Bandbreedte;
    aantalSecties: Bandbreedte;
    totaalprijs: Bandbreedte | null;
  } | null;
  aannames: Aanname[];
  /** Alle meldingen als tekst; dezelfde als in `meldingen`. */
  waarschuwingen: string[];
  meldingen: Melding[];
  eigenAntwoorden: number;
}
