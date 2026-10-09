// De wizard voor de boer: één vraag per scherm, overal "Weet ik niet",
// en aan het eind de uitkomst met een aanvraag voor een offerte.
import './stijl.css';
import { bereken, InvoerFout, standaardData, TEELTWOORDEN, UITGANGSPUNTEN, type Bron, type Grondsoort, type Invoer, type RekenData, type Resultaat, type Stroom, type Stuklijstregel, type TapeSoort, type Voeding, type Waterkwaliteit } from '../src/index';
import { afstandTotPerceel, langsteZijde, meetPerceel, type LonLat, type PerceelMaten } from '../src/perceel';
import { PerceelKaart } from './kaart';

/** Instellingen die de WordPress-plugin later meegeeft. */
interface Config {
  data?: RekenData;
  /** Adres waar een aanvraag naartoe gaat. Zonder adres is het een proefversie. */
  aanvraagUrl?: string;
}
const config: Config = (window as unknown as { DRUPPELCALCULATOR?: Config }).DRUPPELCALCULATOR ?? {};
const data = config.data ?? standaardData;

interface Staat {
  stap: number;
  gewas?: string;
  ring?: LonLat[];
  gedraaid: boolean;
  handmatigPerceel: boolean;
  bedlengte?: number;
  perceelbreedte?: number;
  bedWeetNiet: boolean;
  bedbreedte?: number;
  tapes?: number;
  grond?: Grondsoort | null;
  bron?: Bron;
  bronPunt?: LonLat;
  handmatigAfstand: boolean;
  afstand?: number;
  debiet?: number | null;
  water?: Waterkwaliteit | null;
  ijzer?: number;
  ec?: number;
  stroom?: Stroom | null;
  fertigatie: boolean;
  automatisch: boolean;
  tape?: TapeSoort | null;
  voeding?: Voeding;
}

const OPSLAG = 'druppelcalculator-v1';
const leeg = (): Staat => ({ stap: 0, gedraaid: false, handmatigPerceel: false, bedWeetNiet: false, handmatigAfstand: false, fertigatie: false, automatisch: false });
let s: Staat = laad();

function laad(): Staat {
  try {
    const t = localStorage.getItem(OPSLAG);
    if (t) return { ...leeg(), ...(JSON.parse(t) as Partial<Staat>) };
  } catch {
    /* geen opslag beschikbaar */
  }
  return leeg();
}
function bewaar(): void {
  try {
    localStorage.setItem(OPSLAG, JSON.stringify(s));
  } catch {
    /* geen opslag beschikbaar */
  }
}

// ---------- hulpjes ----------
const app = document.getElementById('app')!;
const esc = (t: unknown) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (n: number, d = 1) => n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: d });
const euro = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const uren = (u: number) => {
  const h = Math.floor(u);
  const m = Math.round((u - h) * 60);
  return m === 60 ? `${h + 1} uur` : m === 0 ? `${h} uur` : `${h} uur ${m} min`;
};
const getal = (v: string): number | undefined => {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

let kaart: PerceelKaart | null = null;
function deKaart(): PerceelKaart {
  if (!kaart) {
    kaart = new PerceelKaart();
    kaart.begin(s.ring ?? null, s.bronPunt ?? null);
    kaart.onWijzig = () => {
      s.ring = kaart!.ring && kaart!.ring.length >= 3 ? kaart!.ring : undefined;
      s.bronPunt = kaart!.bron ?? undefined;
      bewaar();
      werkStapBij();
    };
    kaart.onMelding = (tekst, soort = 'info') => {
      const m = document.getElementById('kaartmelding');
      if (m) {
        m.textContent = tekst;
        m.dataset.soort = soort;
      }
    };
  }
  return kaart;
}

function maten(): PerceelMaten | null {
  if (!s.ring || s.ring.length < 3) return null;
  try {
    const basis = langsteZijde(s.ring);
    return meetPerceel(s.ring, s.gedraaid ? basis + Math.PI / 2 : basis);
  } catch {
    return null;
  }
}

function bronafstand(): number | undefined {
  if (s.handmatigAfstand || s.handmatigPerceel || !s.ring) return s.afstand;
  if (!s.bronPunt) return undefined;
  return Math.round(afstandTotPerceel(s.bronPunt, s.ring));
}

// ---------- keuzekaarten ----------
interface Optie<T> {
  waarde: T;
  label: string;
  uitleg?: string;
  beeld?: string;
}
function keuzes<T extends string>(naam: string, opties: Optie<T>[], gekozen: T | null | undefined, weetNiet: string | null): string {
  const knop = (waarde: string, label: string, uitleg = '', beeld = '', aan = false) => `
    <button type="button" class="keuze${aan ? ' aan' : ''}" data-keuze="${naam}" data-waarde="${esc(waarde)}" aria-pressed="${aan}">
      ${beeld ? `<span class="beeld" aria-hidden="true">${beeld}</span>` : ''}
      <span class="keuzetekst"><strong>${esc(label)}</strong>${uitleg ? `<span>${esc(uitleg)}</span>` : ''}</span>
    </button>`;
  return `<div class="keuzes">${opties.map((o) => knop(o.waarde, o.label, o.uitleg, o.beeld, gekozen === o.waarde)).join('')}${
    weetNiet ? knop('', 'Weet ik niet', weetNiet, BEELD.vraag, gekozen === null) : ''
  }</div>`;
}

const BEELD = {
  vraag: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M15 15a5 5 0 1 1 7 4.6c-1.4.6-2 1.6-2 3v1.4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="29" r="1.8" fill="currentColor"/></svg>',
  grond: (kleur: string, korrel: string) =>
    `<svg viewBox="0 0 40 40"><rect x="3" y="8" width="34" height="26" rx="4" fill="${kleur}"/>${korrel}</svg>`,
  druppel: (kleur: string) => `<svg viewBox="0 0 40 40"><path d="M20 4C14 13 9 19 9 25a11 11 0 0 0 22 0c0-6-5-12-11-21z" fill="${kleur}" stroke="currentColor" stroke-width="1.5"/></svg>`,
};
const korrels = (kleur: string, n: number, r: number) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${7 + ((i * 7.3) % 27)}" cy="${12 + ((i * 5.1) % 19)}" r="${r}" fill="${kleur}"/>`).join('');

// ---------- keuzes per vraag ----------
const GROND_OPTIES: Optie<Grondsoort>[] = [
  { waarde: 'zand', label: 'Zand', uitleg: 'minder dan 8% lutum', beeld: BEELD.grond('#e4c98f', korrels('#c9a862', 14, 1.6)) },
  { waarde: 'zand_klei', label: 'Zavel', uitleg: 'zand met klei, 8 tot 25% lutum', beeld: BEELD.grond('#c9a978', korrels('#9c7d52', 10, 1.4)) },
  { waarde: 'klei', label: 'Klei', uitleg: 'meer dan 25% lutum', beeld: BEELD.grond('#8f7457', korrels('#6e5741', 5, 2.4)) },
  { waarde: 'veen', label: 'Veen', uitleg: 'veel organische stof', beeld: BEELD.grond('#4b3a2c', korrels('#2f241b', 8, 1.2)) },
];

const BRON_OPTIES: Optie<Bron>[] = [
  { waarde: 'put', label: 'Bron of put', uitleg: 'grondwater', beeld: '<svg viewBox="0 0 40 40"><path d="M4 34h32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M8 34v-4h24v4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="20" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="17" cy="20" r="3" fill="currentColor"/><path d="M26 17h6v-7h4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 29v1" stroke="currentColor" stroke-width="2.5"/><path d="M36 12c-1 2-1 3 0 4 1-1 1-2 0-4z" fill="#3fa7ff"/></svg>' },
  { waarde: 'sloot', label: 'Sloot of vijver', uitleg: 'oppervlaktewater', beeld: '<svg viewBox="0 0 40 40"><path d="M2 16l8 14h20l8-14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M8 22c4 2 8 2 12 0s8-2 12 0l-3 7H11z" fill="#3fa7ff"/></svg>' },
  { waarde: 'leiding', label: 'Leidingwater', uitleg: 'kraan of brandkraan', beeld: '<svg viewBox="0 0 40 40"><path d="M6 12h18a6 6 0 0 1 6 6v6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M30 28c-2 3-2 5 0 6 2-1 2-3 0-6z" fill="#3fa7ff"/></svg>' },
];

const WATER_OPTIES: Optie<Waterkwaliteit>[] = [
  { waarde: 'helder', label: 'Helder', uitleg: 'geen aanslag', beeld: BEELD.druppel('#bfe3ff') },
  { waarde: 'ijzer', label: 'Roestbruin', uitleg: 'oranje aanslag op de bak', beeld: BEELD.druppel('#d2843f') },
  { waarde: 'algen', label: 'Groen of algen', uitleg: 'of er drijft vuil in', beeld: BEELD.druppel('#6fa35a') },
];

const TAPE_OPTIES: Optie<TapeSoort>[] = [
  { waarde: 'eenjarig', label: 'Eén seizoen', uitleg: 'dunne tape, elk jaar nieuw', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" stroke-width="2"/></svg>' },
  { waarde: 'meerjarig', label: 'Meerdere seizoenen', uitleg: 'dikkere tape, gaat een paar jaar mee', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" stroke-width="2"/></svg>' },
];

const STROOM_OPTIES: Optie<Stroom>[] = [
  { waarde: 'geen', label: 'Geen stroom', uitleg: 'dan wordt het diesel', beeld: '<svg viewBox="0 0 40 40"><path d="M22 4L10 22h9l-2 14 13-19h-9z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M6 6l28 28" stroke="currentColor" stroke-width="2.5"/></svg>' },
  { waarde: '230V', label: 'Gewoon stopcontact', uitleg: '230 volt', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="14" cy="20" r="2.6" fill="currentColor"/><circle cx="26" cy="20" r="2.6" fill="currentColor"/></svg>' },
  { waarde: '400V', label: 'Krachtstroom', uitleg: '400 volt, de rode stekker', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#e0453a" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="12" r="2.3" fill="#fff"/><circle cx="13" cy="21" r="2.3" fill="#fff"/><circle cx="27" cy="21" r="2.3" fill="#fff"/><circle cx="16" cy="28" r="2.3" fill="#fff"/><circle cx="24" cy="28" r="2.3" fill="#fff"/></svg>' },
];

// ---------- de stappen ----------
interface Stap {
  titel: string;
  vraag: string;
  /** Kort label voor de voortgang en het overzicht. */
  kort: string;
  toon: () => string;
  klaar: () => boolean;
  /** Na het tekenen: kaart erin hangen of velden koppelen. */
  na?: () => void;
}

/** Groter is vrijwel zeker een tekenfout, bijvoorbeeld door te ver uitgezoomd te tekenen. */
const MAX_PERCEEL_M2 = 3_000_000;

/** Eenvoudige icoontjes per gewas; een nieuw gewas zonder eigen icoon krijgt een blad. */
const GEWAS_BEELD: Record<string, string> = {
  zaaiuien:
    '<svg viewBox="0 0 40 40"><path d="M20 4c-1 5-1 8 0 12M20 16c2-5 5-8 8-9" fill="none" stroke="#4f8a3a" stroke-width="2.5" stroke-linecap="round"/><path d="M20 15c-8 3-12 9-11 15 1 5 6 7 11 7s10-2 11-7c1-6-3-12-11-15z" fill="#c98a3d" stroke="currentColor" stroke-width="1.5"/><path d="M20 17c-3 4-4 10-3 19M20 17c3 4 4 10 3 19" fill="none" stroke="#9c6526" stroke-width="1.2"/></svg>',
  aardappelen:
    '<svg viewBox="0 0 40 40"><path d="M8 24c-2-8 5-15 14-15 8 0 12 5 11 11-1 7-8 12-15 12-5 0-9-3-10-8z" fill="#d6b06a" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="18" r="1.4" fill="#8a6a35"/><circle cx="24" cy="15" r="1.4" fill="#8a6a35"/><circle cx="26" cy="24" r="1.4" fill="#8a6a35"/><circle cx="17" cy="26" r="1.4" fill="#8a6a35"/></svg>',
  tulpen:
    '<svg viewBox="0 0 40 40"><path d="M20 22v15" stroke="#4f8a3a" stroke-width="2.5" stroke-linecap="round"/><path d="M20 33c-6-1-9-6-9-11 4 1 7 4 9 8M20 31c5-1 8-5 8-9-4 1-6 3-8 7" fill="#6fa35a"/><path d="M12 8l4 4 4-7 4 7 4-4v8c0 5-4 8-8 8s-8-3-8-8z" fill="#e0453a" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  peen:
    '<svg viewBox="0 0 40 40"><path d="M20 11c-4-3-7-5-10-4 2 3 5 5 9 5M20 11c0-4 1-7 3-8 1 3 0 6-2 8M20 11c4-2 7-3 10-1-3 2-6 3-9 3" fill="#4f8a3a"/><path d="M13 13h14l-6 24h-2z" fill="#f08a24" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 19h4M17 25h3M18 31h2" stroke="#b85f12" stroke-width="1.3" stroke-linecap="round"/></svg>',
  overig:
    '<svg viewBox="0 0 40 40"><path d="M20 36V18M20 18c0-8 6-13 14-13 0 8-6 13-14 13zM20 24c0-6-5-10-12-10 0 6 5 10 12 10z" fill="#6fa35a" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

/** De woorden bed of rug, afhankelijk van het gekozen gewas. */
const woord = () => TEELTWOORDEN[data.gewassen.find((g) => g.id === s.gewas)?.teeltwijze ?? 'bed'];

const gewasNaam = (id?: string) => data.gewassen.find((g) => g.id === id)?.naam ?? '';

const STAPPEN: Stap[] = [
  {
    titel: 'Gewas',
    kort: 'Gewas',
    vraag: 'Wat teel je op dit perceel?',
    toon: () =>
      keuzes(
        'gewas',
        data.gewassen.map((g) => ({
          waarde: g.id,
          label: g.naam,
          uitleg: TEELTWOORDEN[g.teeltwijze].enkel === 'rug' ? 'op ruggen' : 'in bedden',
          beeld: GEWAS_BEELD[g.id] ?? GEWAS_BEELD.overig,
        })),
        s.gewas,
        null,
      ),
    klaar: () => !!s.gewas,
  },
  {
    titel: 'Perceel',
    kort: 'Perceel',
    vraag: 'Waar ligt je perceel?',
    toon: () => {
      if (s.handmatigPerceel) {
        return `
          <p class="hulp">Vul de maten van het stuk in dat je wilt beregenen.</p>
          <div class="twee">
            <label class="veld"><span>Lengte van de ${woord().meervoud} <em>m</em></span><input inputmode="decimal" data-veld="bedlengte" value="${s.bedlengte ?? ''}" placeholder="bijv. 300"></label>
            <label class="veld"><span>Breedte van het perceel <em>m</em></span><input inputmode="decimal" data-veld="perceelbreedte" value="${s.perceelbreedte ?? ''}" placeholder="bijv. 100"></label>
          </div>
          <button type="button" class="link" data-actie="kaartPerceel">Toch liever op de kaart</button>`;
      }
      return `
        <p class="hulp">Zoek je adres of plaats, en tik dan op je perceel. De grens komt uit het register van RVO. Klopt hij niet, sleep dan de hoekpunten of teken het perceel zelf in.</p>
        <form class="zoek" data-actie="zoek"><input type="search" id="zoekveld" placeholder="Adres, postcode of plaats" autocomplete="off"><button type="submit">Zoek</button></form>
        <ul class="zoekresultaten" id="zoekresultaten"></ul>
        <div id="kaartplek"></div>
        <p class="kaartmelding" id="kaartmelding" aria-live="polite"></p>
        <div class="kaartknoppen" id="kaartknoppen"></div>
        <div id="perceelmaten"></div>
        <button type="button" class="link" data-actie="handmatigPerceel">Ik vul de maten liever zelf in</button>`;
    },
    klaar: () => (s.handmatigPerceel ? (s.bedlengte ?? 0) > 0 && (s.perceelbreedte ?? 0) > 0 : (maten()?.oppervlak_m2 ?? Infinity) <= MAX_PERCEEL_M2 && !kaart?.bezigMetTekenen),
    na: () => {
      if (s.handmatigPerceel) return;
      const k = deKaart();
      k.zetModus('kies');
      document.getElementById('kaartplek')!.replaceWith(k.el);
      k.ververs();
      werkKaartknoppenBij();
    },
  },
  {
    titel: 'Bedden',
    get kort() {
      return woord().enkel === 'rug' ? 'Ruggen' : 'Bedden';
    },
    get vraag() {
      return woord().enkel === 'rug'
        ? 'Hoe ver liggen de ruggen uit elkaar en hoeveel tapes liggen erop?'
        : 'Hoe breed is een bed en hoeveel tapes liggen erop?';
    },
    toon: () => {
      const g = data.gewassen.find((x) => x.id === s.gewas);
      const bb = s.bedbreedte ?? g?.bedbreedte_m;
      const tp = s.tapes ?? g?.tapesPerBed;
      return `
        <p class="hulp">We hebben ingevuld wat gangbaar is voor ${esc(gewasNaam(s.gewas).toLowerCase())}. Doe jij het anders, pas het dan aan. ${
          woord().enkel === 'rug' ? 'De afstand tussen de ruggen is van hart tot hart.' : 'De bedbreedte is van het midden van het ene pad tot het midden van het volgende.'
        }</p>
        <div class="bedplaatje" aria-hidden="true">${bedSvg(tp ?? 3)}</div>
        <div class="twee">
          <label class="veld"><span>${woord().enkel === 'rug' ? 'Afstand tussen de ruggen' : 'Bedbreedte'} <em>m</em></span><input inputmode="decimal" data-veld="bedbreedte" value="${bb ?? ''}" ${s.bedWeetNiet ? 'disabled' : ''}></label>
          <label class="veld"><span>Tapes per ${woord().enkel}</span><input inputmode="numeric" data-veld="tapes" value="${tp ?? ''}" ${s.bedWeetNiet ? 'disabled' : ''}></label>
        </div>
        <label class="vink"><input type="checkbox" data-vink="bedWeetNiet" ${s.bedWeetNiet ? 'checked' : ''}> Weet ik niet, reken met wat gangbaar is</label>`;
    },
    klaar: () => s.bedWeetNiet || ((s.bedbreedte ?? 1) > 0 && Number.isInteger(s.tapes ?? 1) && (s.tapes ?? 1) > 0),
  },
  {
    titel: 'Grond',
    kort: 'Grond',
    vraag: 'Wat voor grond is het?',
    toon: () =>
      `<p class="hulp">Op lichte grond zakt het water sneller weg; daar komen de druppelaars dichter bij elkaar. Het lutumgehalte staat op je grondmonster.</p>` +
      keuzes<Grondsoort>(
        'grond',
        GROND_OPTIES,
        s.grond,
        'we nemen een tussenwaarde',
      ),
    klaar: () => s.grond !== undefined,
  },
  {
    titel: 'Bron',
    kort: 'Bron',
    vraag: 'Waar komt het water vandaan?',
    toon: () => {
      const kaartDeel = s.handmatigPerceel || s.handmatigAfstand
        ? `<label class="veld smal"><span>Afstand van de bron tot het perceel <em>m</em></span><input inputmode="decimal" data-veld="afstand" value="${s.afstand ?? ''}" placeholder="bijv. 50"></label>
           ${s.handmatigPerceel ? '' : '<button type="button" class="link" data-actie="kaartAfstand">Toch op de kaart aanwijzen</button>'}`
        : `<p class="hulp">Tik op de kaart waar de bron, sloot of kraan is. Dan meten we hoe lang de leiding naar het perceel wordt.</p>
           <div id="kaartplek"></div>
           <p class="kaartmelding" id="kaartmelding" aria-live="polite"></p>
           <div id="bronmaat"></div>
           <button type="button" class="link" data-actie="handmatigAfstand">Ik vul de afstand liever zelf in</button>`;
      return (
        keuzes<Bron>(
          'bron',
          BRON_OPTIES,
          s.bron,
          null,
        ) + (s.bron ? kaartDeel : '')
      );
    },
    klaar: () => !!s.bron && (bronafstand() ?? -1) >= 0,
    na: () => {
      if (!s.bron || s.handmatigPerceel || s.handmatigAfstand) return;
      const k = deKaart();
      k.zetModus('bron');
      document.getElementById('kaartplek')!.replaceWith(k.el);
      k.ververs();
      k.onMelding(s.bronPunt ? 'Sleep de blauwe stip als hij niet goed staat.' : 'Tik op de plek van je bron.');
      werkBronmaatBij();
    },
  },
  {
    titel: 'Hoeveel water',
    kort: 'Waterbron',
    vraag: 'Hoeveel water levert je bron per uur?',
    toon: () => `
      <p class="hulp">${
        s.bron === 'put'
          ? 'Staat in je putrapport of op de pomp. Geen idee? Meet het met een emmer.'
          : s.bron === 'leiding'
            ? 'Leidingwater levert meestal maar een paar kuub per uur. Meet het met een emmer aan de kraan.'
            : 'Bij een sloot hangt het af van de pomp en hoeveel water je mag onttrekken. Vul in wat je weet, of kies "Weet ik niet".'
      }</p>
      <label class="veld smal"><span>Water per uur <em>m³/uur</em></span><input inputmode="decimal" data-veld="debiet" value="${typeof s.debiet === 'number' ? s.debiet : ''}" ${s.debiet === null ? 'disabled' : ''} placeholder="bijv. 30"></label>
      <details class="emmer" ${s.debiet === null ? '' : ''}>
        <summary>Meten met een emmer van 10 liter</summary>
        <p>Zet de kraan of pomp helemaal open en tel hoeveel seconden het duurt tot de emmer vol is.</p>
        <label class="veld smal"><span>Seconden tot de emmer vol is</span><input inputmode="decimal" data-veld="emmer" placeholder="bijv. 12"></label>
        <p class="emmeruitkomst" id="emmeruitkomst"></p>
      </details>
      <label class="vink"><input type="checkbox" data-vink="debietWeetNiet" ${s.debiet === null ? 'checked' : ''}> Weet ik niet, we rekenen met een voorzichtige schatting</label>`,
    klaar: () => s.debiet === null || (s.debiet ?? 0) > 0,
  },
  {
    titel: 'Water',
    kort: 'Waterkwaliteit',
    vraag: 'Hoe ziet je water eruit?',
    toon: () =>
      `<p class="hulp">Hiermee kiezen we het filter. Druppelaars zijn klein en raken snel verstopt.</p>` +
      keuzes<Waterkwaliteit>(
        'water',
        WATER_OPTIES,
        s.water,
        'we nemen het zwaarste filter',
      ) +
      `<div class="analyse">
        <h2>Heb je een wateranalyse? Vul hem in!</h2>
        <p class="hulp">Dan kiezen we het filter op de echte cijfers. Leeg laten mag ook.</p>
        <div class="twee">
          <label class="veld"><span>IJzer <em>mg/l</em></span><input inputmode="decimal" data-veld="ijzer" value="${s.ijzer ?? ''}" placeholder="bijv. 0,4"></label>
          <label class="veld"><span>Zoutgehalte (EC) <em>mS/cm</em></span><input inputmode="decimal" data-veld="ec" value="${s.ec ?? ''}" placeholder="bijv. 0,8"></label>
        </div>
      </div>`,
    klaar: () => s.water !== undefined,
  },
  {
    titel: 'Stroom',
    kort: 'Stroom',
    vraag: 'Welke stroom is er bij de pomp?',
    toon: () =>
      `<p class="hulp">Daarmee kiezen we tussen een elektrische pomp en een dieselpomp.</p>` +
      keuzes<Stroom>(
        'stroom',
        STROOM_OPTIES,
        s.stroom,
        'we rekenen met een dieselpomp',
      ),
    klaar: () => s.stroom !== undefined,
  },
  {
    titel: 'Extra',
    kort: 'Extra',
    vraag: 'Nog twee laatste vragen',
    toon: () => `
      <h2>Hoe lang moet de tape meegaan?</h2>
      <p class="hulp">Dunne tape is goedkoper en ruim je na de oogst op. Dikkere tape kost meer, maar gaat een paar seizoenen mee.</p>
      ${keuzes<TapeSoort>('tape', TAPE_OPTIES, s.tape, 'we rekenen met eenjarige tape')}
      <h2>Wat wil je er nog bij?</h2>
      <p class="hulp">Allebei mag, geen van beide ook.</p>
      <div class="keuzes">
        <label class="keuze vinkkeuze"><input type="checkbox" data-vink="fertigatie" ${s.fertigatie ? 'checked' : ''}><span class="keuzetekst"><strong>Mest meegeven met het water</strong><span>fertigatie: een pomp die meststof bijdoseert</span></span></label>
        <label class="keuze vinkkeuze"><input type="checkbox" data-vink="automatisch" ${s.automatisch ? 'checked' : ''}><span class="keuzetekst"><strong>Automatisch laten lopen</strong><span>een computer zet de secties om de beurt aan</span></span></label>
      </div>`,
    klaar: () => s.tape !== undefined,
  },
];

/** Dwarsdoorsnede van een bed of een rug, met de tapes erop. */
function bedSvg(tapes: number): string {
  const n = Math.max(1, Math.min(6, Math.round(tapes)));
  const rug = woord().enkel === 'rug';
  // Bij een rug liggen de tapes op de bolle kant, bij een bed op het vlakke midden.
  const hoogte = (x: number) => (rug ? 44 + 14 * Math.pow((x - 120) / 75, 2) : 44);
  const stippen = Array.from({ length: n }, (_, i) => {
    const x = rug ? 120 + ((i + 0.5) / n - 0.5) * 90 : 50 + ((i + 0.5) * 140) / n;
    return `<circle cx="${x.toFixed(1)}" cy="${(hoogte(x) - 3).toFixed(1)}" r="4" fill="var(--accent)"/>`;
  }).join('');
  const grond = rug
    ? 'M20 60 Q45 60 50 58 Q75 42 120 42 Q165 42 190 58 Q195 60 220 60'
    : 'M0 60 L30 60 L45 44 L195 44 L210 60 L240 60';
  return `<svg viewBox="0 0 240 70"><path d="${grond}" fill="none" stroke="var(--muted)" stroke-width="2"/><path d="${
    rug ? 'M52 57 Q75 43 120 43 Q165 43 188 57' : 'M45 44 L195 44'
  }" fill="none" stroke="var(--grond)" stroke-width="6" stroke-linecap="round"/>${stippen}<text x="120" y="20" text-anchor="middle" font-size="12" fill="var(--muted)">${n} ${
    n === 1 ? 'tape' : 'tapes'
  } op een ${woord().enkel}</text></svg>`;
}

// ---------- tekenen ----------
const AANTAL = STAPPEN.length;

function render(): void {
  if (s.stap === 0) return renderStart();
  if (s.stap > AANTAL) return renderUitkomst();
  const st = STAPPEN[s.stap - 1]!;
  app.innerHTML = `
    <div class="voortgang" aria-label="Vraag ${s.stap} van ${AANTAL}">
      <div class="balk"><span style="width:${(s.stap / AANTAL) * 100}%"></span></div>
      <span class="teller">Vraag ${s.stap} van ${AANTAL} · ${esc(st.kort)}</span>
    </div>
    <section class="scherm">
      <h1>${esc(st.vraag)}</h1>
      <div class="inhoud">${st.toon()}</div>
    </section>
    <nav class="knoppen">
      <button type="button" class="terug" data-actie="terug">Terug</button>
      <button type="button" class="verder" data-actie="verder" ${st.klaar() ? '' : 'disabled'}>${s.stap === AANTAL ? 'Bereken' : 'Verder'}</button>
    </nav>`;
  st.na?.();
  if (s.stap === 6) werkEmmerBij();
  app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
}

function werkStapBij(): void {
  const st = STAPPEN[s.stap - 1];
  if (!st) return;
  const v = app.querySelector<HTMLButtonElement>('[data-actie="verder"]');
  if (v) v.disabled = !st.klaar();
  if (s.stap === 2) werkKaartknoppenBij();
  if (s.stap === 5) werkBronmaatBij();
}

function werkKaartknoppenBij(): void {
  const k = kaart;
  const knoppen = document.getElementById('kaartknoppen');
  const uit = document.getElementById('perceelmaten');
  if (!k || !knoppen || !uit) return;
  knoppen.innerHTML = k.bezigMetTekenen
    ? `<button type="button" data-actie="klaarTekenen" class="primair">Klaar met intekenen</button><button type="button" data-actie="wis">Opnieuw</button>`
    : `<button type="button" data-actie="teken">${s.ring ? 'Opnieuw intekenen' : 'Zelf intekenen'}</button>${s.ring ? '<button type="button" data-actie="draai">${woord().meervoud.charAt(0).toUpperCase() + woord().meervoud.slice(1)} een kwartslag draaien</button><button type="button" data-actie="wis">Wis perceel</button>' : ''}`;
  const m = maten();
  uit.innerHTML = m
    ? `<dl class="maten">
        <div><dt>Oppervlak</dt><dd>${nl(m.oppervlak_m2 / 10_000, 2)} ha</dd></div>
        <div><dt>Lengte ${woord().meervoud}</dt><dd>${nl(m.gemiddeldeBedlengte_m, 0)} m${m.langsteBedlengte_m > m.gemiddeldeBedlengte_m * 1.1 ? ` <small>(langste ${nl(m.langsteBedlengte_m, 0)} m)</small>` : ''}</dd></div>
        <div><dt>Breedte</dt><dd>${nl(m.breedte_m, 0)} m</dd></div>
      </dl>${m.oppervlak_m2 > MAX_PERCEEL_M2 ? '<p class="fout">Dit perceel is groter dan 300 ha. Zoom verder in en teken het opnieuw.</p>' : ''}`
    : '';
}

function werkBronmaatBij(): void {
  const el = document.getElementById('bronmaat');
  if (!el) return;
  const a = bronafstand();
  el.innerHTML = a === undefined ? '' : `<dl class="maten"><div><dt>Leiding naar het perceel</dt><dd>${a === 0 ? 'bron ligt op het perceel' : `${nl(a, 0)} m`}</dd></div></dl>`;
}

function werkEmmerBij(): void {
  const veld = app.querySelector<HTMLInputElement>('[data-veld="emmer"]');
  const uit = document.getElementById('emmeruitkomst');
  if (!veld || !uit) return;
  const sec = getal(veld.value);
  uit.innerHTML = sec && sec > 0 ? `Dat is ongeveer <strong>${nl(36 / sec)} m³ per uur</strong>. <button type="button" class="link" data-actie="neemEmmer" data-waarde="${(36 / sec).toFixed(1)}">Neem over</button>` : '';
}

function renderStart(): void {
  app.innerHTML = `
    <section class="scherm start">
      <p class="bovenkop">Druppelirrigatie</p>
      <h1>Wat heb je nodig om je perceel te druppelen?</h1>
      <p class="intro">Beantwoord ${AANTAL} korte vragen over je perceel en je water. Je ziet meteen hoeveel tape, welke pomp en welke onderdelen erbij horen. Weet je iets niet, kies dan "Weet ik niet". Dan rekenen we met een veilige aanname en kijken wij met je mee.</p>
      <ul class="beloftes">
        <li>Duurt een paar minuten</li>
        <li>Je perceel teken je op de kaart</li>
        <li>Nergens aan vast</li>
      </ul>
      <p class="let-op">Proefversie. We lopen de rekenregels nog na en de prijzen volgen later.</p>
      <div class="knoppen">
        ${s.gewas ? '<button type="button" data-actie="opnieuw">Opnieuw beginnen</button>' : ''}
        <button type="button" class="verder" data-actie="begin">${s.gewas ? 'Verder waar je was' : 'Begin'}</button>
      </div>
    </section>`;
}

function invoer(): Invoer {
  const m = maten();
  const g = data.gewassen.find((x) => x.id === s.gewas);
  return {
    gewas: s.gewas!,
    bedlengte_m: s.handmatigPerceel ? s.bedlengte! : Math.round(m!.gemiddeldeBedlengte_m),
    perceelbreedte_m: s.handmatigPerceel ? s.perceelbreedte! : Math.round(m!.breedte_m),
    bedbreedte_m: s.bedWeetNiet ? null : (s.bedbreedte ?? g?.bedbreedte_m ?? null),
    tapesPerBed: s.bedWeetNiet ? null : (s.tapes ?? g?.tapesPerBed ?? null),
    grond: s.grond ?? null,
    bron: s.bron!,
    bronafstand_m: bronafstand() ?? 0,
    brondebiet_m3u: s.debiet ?? null,
    water: s.water ?? null,
    ijzer_mgl: s.ijzer ?? null,
    ec_mScm: s.ec ?? null,
    stroom: s.stroom ?? null,
    fertigatie: s.fertigatie,
    automatisch: s.automatisch,
    tape: s.tape ?? null,
    voeding: s.voeding,
  };
}

// ---------- de eindpagina ----------
// Volgorde (voorstel eindpagina, 2026-10-06): kop met kerncijfers en rekensom, eventuele blokkades,
// de antwoorden als kaartjes, een schema van het systeem, "goed om te weten", het pakket en de offerte.

/** Welke stap hoort bij welk invoerveld, zodat de boer een antwoord direct kan aanpassen. */
const STAP_VAN: Partial<Record<keyof Invoer, number>> = { bedbreedte_m: 3, tapesPerBed: 3, grond: 4, brondebiet_m3u: 6, water: 7, stroom: 8, tape: 9 };

/** Hoe we de bron in een zin noemen. */
const BRON_WOORD: Record<Bron, { kort: string; bij: string; naar: string }> = {
  put: { kort: 'bron', bij: 'Bij de bron', naar: 'Van de bron naar het perceel' },
  sloot: { kort: 'sloot', bij: 'Bij de sloot', naar: 'Van de sloot naar het perceel' },
  leiding: { kort: 'kraan', bij: 'Bij de kraan', naar: 'Van de kraan naar het perceel' },
};
const POMP_WOORD: Record<string, string> = { diesel: 'dieselpomp', elektrisch_230V: 'pomp op het stopcontact', elektrisch_400V: 'pomp op krachtstroom' };

const ICOON = {
  perceel:
    '<svg viewBox="0 0 40 40"><path d="M6 9l26-3 3 26-27 2z" fill="#9fc98a" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 14l21-2M10 19l22-2M10 24l22-2M10 29l23-2" stroke="#4f8a3a" stroke-width="1.2"/></svg>',
  bed: '<svg viewBox="0 0 40 40"><path d="M2 30h5l4-8h18l4 8h5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 22h18" stroke="var(--grond)" stroke-width="4"/><circle cx="16" cy="19" r="2.6" fill="var(--accent)"/><circle cx="24" cy="19" r="2.6" fill="var(--accent)"/></svg>',
  rug: '<svg viewBox="0 0 40 40"><path d="M2 30h5q4-10 13-10t13 10h5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="17.5" r="2.6" fill="var(--accent)"/></svg>',
  emmer:
    '<svg viewBox="0 0 40 40"><path d="M9 12h18l-2 22H11z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 20h14l-1 13H12z" fill="#3fa7ff"/><path d="M27 15h4a3 3 0 0 1 0 6h-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  extra:
    '<svg viewBox="0 0 40 40"><rect x="7" y="7" width="26" height="26" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 20l4 4 8-9" fill="none" stroke="var(--ok)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lampje:
    '<svg viewBox="0 0 40 40"><path d="M20 6a10 10 0 0 0-6 18c1 1 2 3 2 5h8c0-2 1-4 2-5a10 10 0 0 0-6-18z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 33h8M17 37h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  klok: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 11v10l6 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  hand: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 11v11" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="28" r="2" fill="currentColor"/></svg>',
};

const meervoud = (n: number, een: string, veel: string) => `${nl(n, 0)} ${n === 1 ? een : veel}`;
const eenheidVoluit = (n: number, e: 'stuk' | 'meter' | 'rol') =>
  e === 'stuk' ? meervoud(n, 'stuk', 'stuks') : e === 'rol' ? meervoud(n, 'rol', 'rollen') : `${nl(n, 0)} meter`;
const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const optieVan = <T extends string>(opties: Optie<T>[], w: T | null | undefined) => opties.find((o) => o.waarde === w);

let laatste: Resultaat | null = null;

function renderUitkomst(): void {
  let r: Resultaat;
  const inv = invoer();
  try {
    r = bereken(inv, data);
  } catch (e) {
    app.innerHTML = `<section class="scherm"><h1>Dit kunnen we nog niet doorrekenen</h1><p class="let-op">${esc(e instanceof InvoerFout ? e.message : 'Er ging iets mis bij het rekenen.')}</p><div class="knoppen"><button type="button" data-actie="terug">Terug</button></div></section>`;
    return;
  }
  laatste = r;
  const o = r.ontwerp;
  const w = woord();
  const bron = BRON_WOORD[inv.bron];
  const gewas = gewasNaam(s.gewas);
  const tapes = meervoud(o.tapesPerBed, 'tape', 'tapes');

  const lead =
    `Een compleet systeem dat je ${esc(gewas.toLowerCase())} op een droge dag tot ${nl(o.dagbehoefte_m3, 0)} m³ water geeft, direct bij de wortel. ` +
    (r.meldingen.some((m) => m.soort === 'blokkade')
      ? 'Zoals het nu is ingevuld, werkt dat nog niet. Hieronder lees je wat er anders moet.'
      : o.aantalSecties > 1
      ? `Het perceel krijgt in ${o.aantalSecties} secties om de beurt water, zodat je ${bron.kort} het bijhoudt.`
      : `Het hele perceel krijgt in één keer water.`);

  const sectieSom =
    o.aantalSecties > 1
      ? `alles tegelijk vraagt ${nl(o.totaalDebiet_m3u)} m³/uur, je ${bron.kort} geeft ± ${nl(o.brondebiet_m3u)} m³/uur, dus ${o.aantalSecties} keer na elkaar`
      : `alles tegelijk vraagt ${nl(o.totaalDebiet_m3u)} m³/uur, dat kan je ${bron.kort} aan`;

  const prijsBekend = r.route === 'bestellen' && r.totaalprijs !== null;
  const geblokkeerd = isGeblokkeerd(r);
  const actie = geblokkeerd
    ? `<div class="actie"><button type="button" class="verder" data-actie="toonBlokkade">Eerst aanpassen</button><small>Klopt het systeem, dan kun je direct een offerte aanvragen.</small></div>`
    : prijsBekend
    ? `<div class="actie"><strong class="totaal">${euro(r.totaalprijs!)}</strong><button type="button" class="verder" disabled>In winkelmand (volgt met de webshop)</button></div>`
    : `<div class="actie"><button type="button" class="verder" data-actie="naarOfferte">Vraag je offerte aan</button><small>Vrijblijvend. We bellen je terug met een prijs op maat.</small></div>`;

  app.innerHTML = `
    <div class="uitkomst">
      <section class="kop" aria-labelledby="titel">
        <p class="bovenkop">Jouw druppelsysteem</p>
        <h1 id="titel">Druppelirrigatie voor ${nl(o.beteeldOppervlak_ha, 1)} ha ${esc(gewas.toLowerCase())}</h1>
        <p class="lead">${lead}</p>
        <div class="kerncijfers">
          <div class="kerncijfer"><span class="waarde">${nl(o.meterTape, 0)} m</span><span class="label">driptape op ${meervoud(o.aantalBedden, w.enkel, w.meervoud)}</span><span class="som">${meervoud(o.aantalBedden, w.enkel, w.meervoud)} × ${tapes} × ${nl(inv.bedlengte_m, 0)} m</span></div>
          <div class="kerncijfer"><span class="waarde">${meervoud(o.aantalSecties, 'sectie', 'secties')}</span><span class="label">${o.aantalSecties > 1 ? 'elk' : ''} ongeveer ${uren(o.beregeningstijdPerSectie_u)} per dag</span><span class="som">${sectieSom}</span></div>
          <div class="kerncijfer"><span class="waarde">${nl(o.sectieDebiet_m3u)} m³/uur</span><span class="label">${POMP_WOORD[o.pomptype]}, ${nl(o.pompdruk_bar)} bar</span><span class="som">${meervoud(o.beddenPerSectie, w.enkel, w.meervoud)} per sectie × ${nl(o.bedDebiet_m3u, 2)} m³/uur per ${w.enkel}</span></div>
        </div>
        ${actie}
      </section>
      ${blokkades(r)}
      ${antwoordKaartjes(r)}
      <section class="deel" aria-labelledby="h-schema">
        <header>
          <h2 id="h-schema">Zo werkt jouw systeem</h2>
          <p>Van de ${bron.kort} tot aan de plant.${o.aantalSecties > 1 ? ' De pomp geeft steeds één sectie tegelijk water.' : ''}</p>
        </header>
        <div class="schema">${schemaSvg(r)}</div>
      </section>
      ${weetjes(r)}
      ${pakket(r)}
      ${prijsBekend || geblokkeerd ? '' : offerte(r)}
      <button type="button" class="link terugknop" data-actie="terug">Antwoorden aanpassen</button>
      ${geblokkeerd ? blokkadePopup(r) : ''}
    </div>`;
  if (geblokkeerd) toonBlokkade();
}

/** Een systeem dat niet werkt kan niet als offerte worden aangevraagd (besluit Bart, 2026-10-09). */
const isGeblokkeerd = (r: Resultaat) => r.meldingen.some((m) => m.soort === 'blokkade');

function toonBlokkade(): void {
  const d = document.getElementById('blokkadepopup') as HTMLDialogElement | null;
  if (!d || d.open) return;
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
}

/** Rode popup: zegt eerlijk dat het zo niet werkt, en wat de boer kan aanpassen om wel verder te kunnen. */
function blokkadePopup(r: Resultaat): string {
  return `
    <dialog id="blokkadepopup" class="popup-blokkade" aria-labelledby="h-popup">
      <div class="popup-kop">${ICOON.hand}<h2 id="h-popup">Zo werkt dit systeem nog niet</h2></div>
      <div class="popup-inhoud">
        <p>Met een kleine aanpassing lukt het vaak wel. Kies wat je wilt veranderen, dan rekenen we direct opnieuw.</p>
        <div class="weetjes">${blokkadeKaartjes(r).join('')}</div>
        <div class="knoppen"><button type="button" data-actie="sluitBlokkade">Bekijk eerst de berekening</button></div>
      </div>
    </dialog>`;
}

/** Echte blokkades: rood, met een concreet advies en een knop naar de vraag die het oplost. */
function blokkades(r: Resultaat): string {
  const kaartjes = blokkadeKaartjes(r);
  if (!kaartjes.length) return '';
  return `
    <section class="deel" aria-labelledby="h-blokkade">
      <header><h2 id="h-blokkade">Dit moet eerst anders</h2><p>Pas dit aan, dan kun je je offerte aanvragen.</p></header>
      <div class="weetjes">${kaartjes.join('')}</div>
    </section>`;
}

function blokkadeKaartjes(r: Resultaat): string[] {
  const o = r.ontwerp;
  const w = woord();
  const bron = BRON_WOORD[invoer().bron];
  return r.meldingen
    .filter((m) => m.soort === 'blokkade')
    .map((m) => {
      if (m.code === 'bron_te_klein_bed')
        return blokkade(
          `Je ${bron.kort} is te klein voor één ${w.enkel}`,
          `Eén ${w.enkel} vraagt al ${nl(o.bedDebiet_m3u, 1)} m³/uur. Meet wat je ${bron.kort} echt levert, of maak de ${w.meervoud} korter. Wij denken graag met je mee.`,
          6,
          'Opbrengst aanpassen',
        );
      if (m.code === 'pomptijd_te_lang')
        return blokkade(
          `Je ${bron.kort} houdt dit perceel niet bij`,
          `Op een droge dag zou de pomp ${uren(o.pomptijdPerDag_u)} moeten draaien, en meer dan 20 uur per dag is niet haalbaar. Meet wat je ${bron.kort} echt levert, of beregen een kleiner stuk. Wij denken graag met je mee.`,
          6,
          'Opbrengst aanpassen',
        );
      if (m.code === 'stroom_te_licht')
        return blokkade(
          'Een stopcontact is te licht voor deze pomp',
          `De pomp vraagt ongeveer ${nl(o.pompvermogen_kW)} kW. Met krachtstroom of een dieselpomp gaat het wel.`,
          8,
          'Stroom aanpassen',
        );
      return blokkade('Dit moet eerst anders', esc(m.tekst), 0, '');
    });
}

function blokkade(kop: string, tekst: string, stap: number, knop: string): string {
  return `<div class="weetje blokkade">${ICOON.hand}<div><h3>${esc(kop)}</h3><p>${tekst}</p>${
    stap ? `<button type="button" class="link" data-actie="ga" data-stap="${stap}">${knop}</button>` : ''
  }</div></div>`;
}

/** Kaartje per antwoord; wat we zelf hebben aangenomen krijgt een stippelrand en een knop om het in te vullen. */
function antwoordKaartjes(r: Resultaat): string {
  const inv = invoer();
  const o = r.ontwerp;
  const w = woord();
  const bron = BRON_WOORD[inv.bron];
  const geschat = new Set(r.aannames.map((a) => (a.veld === 'tapesPerBed' ? 'bedbreedte_m' : a.veld)));
  const ha = s.handmatigPerceel ? (inv.bedlengte_m * inv.perceelbreedte_m) / 10_000 : (maten()?.oppervlak_m2 ?? 0) / 10_000;

  const kaartje = (icoon: string, label: string, waarde: string, stap: number, tip?: string) =>
    tip !== undefined
      ? `<div class="antwoord geschat">${icoon}<div class="tekst"><span class="label-geschat">Door ons geschat</span><strong>${waarde}</strong><span>${tip}</span></div><button type="button" class="link" data-actie="ga" data-stap="${stap}">Invullen</button></div>`
      : `<div class="antwoord">${icoon}<div class="tekst"><span>${label}</span><strong>${waarde}</strong></div><button type="button" class="link" data-actie="ga" data-stap="${stap}">Aanpassen</button></div>`;

  const bedTekst =
    w.enkel === 'rug'
      ? `${nl(o.bedbreedte_m, 2)} m tussen de ruggen, ${meervoud(o.tapesPerBed, 'tape', 'tapes')}`
      : `${nl(o.bedbreedte_m, 2)} m breed, ${meervoud(o.tapesPerBed, 'tape', 'tapes')}`;
  const grond = optieVan(GROND_OPTIES, o.grond);
  const water = optieVan(WATER_OPTIES, s.water ?? 'algen');
  const stroom = optieVan(STROOM_OPTIES, s.stroom ?? 'geen');
  const bronOptie = optieVan(BRON_OPTIES, inv.bron);
  const extra = [o.tape === 'eenjarig' ? 'eenjarige tape' : 'meerjarige tape', s.fertigatie ? 'mest meegeven' : '', s.automatisch ? 'automatisch' : ''].filter(Boolean).join(', ');

  const kaartjes = [
    kaartje(GEWAS_BEELD[s.gewas ?? ''] ?? GEWAS_BEELD.overig!, 'Gewas', esc(gewasNaam(s.gewas)), 1),
    kaartje(ICOON.perceel, 'Perceel', `${nl(inv.bedlengte_m, 0)} × ${nl(inv.perceelbreedte_m, 0)} m, ${nl(ha, 1)} ha`, 2),
    kaartje(w.enkel === 'rug' ? ICOON.rug : ICOON.bed, hoofdletter(w.enkel), bedTekst, 3, geschat.has('bedbreedte_m') ? `Gangbaar voor ${esc(gewasNaam(s.gewas).toLowerCase())}.` : undefined),
    kaartje(grond?.beeld ?? '', 'Grond', esc(grond?.label ?? ''), 4, geschat.has('grond') ? 'Het lutumgehalte staat op je grondmonster.' : undefined),
    kaartje(bronOptie?.beeld ?? '', 'Water', `${esc(bronOptie?.label ?? '')}, ${inv.bronafstand_m === 0 ? 'op het perceel' : `${nl(inv.bronafstand_m, 0)} m van het perceel`}`, 5),
    kaartje(ICOON.emmer, 'Opbrengst', `${hoofdletter(bron.kort)} levert ${nl(o.brondebiet_m3u)} m³/uur`, 6, geschat.has('brondebiet_m3u') ? 'Meten kan met een emmer en een stopwatch.' : undefined),
    kaartje(water?.beeld ?? '', 'Waterkwaliteit', esc(water?.label ?? '') + (inv.ijzer_mgl != null ? `, ijzer ${nl(inv.ijzer_mgl)} mg/l` : '') + (inv.ec_mScm != null ? `, EC ${nl(inv.ec_mScm)}` : ''), 7, geschat.has('water') ? 'We rekenen met het zwaarste filter.' : undefined),
    kaartje(stroom?.beeld ?? '', 'Stroom bij de bron', esc(stroom?.label ?? ''), 8, geschat.has('stroom') ? 'We rekenen met een dieselpomp.' : undefined),
    kaartje(ICOON.extra, 'Tape en extra', hoofdletter(extra), 9, geschat.has('tape') ? 'We rekenen met eenjarige tape.' : undefined),
  ];
  return `
    <section class="deel" aria-labelledby="h-situatie">
      <header>
        <h2 id="h-situatie">Gebaseerd op jouw perceel</h2>
        <p>Klopt iets niet? Pas het aan, dan rekenen we direct opnieuw.</p>
      </header>
      <div class="antwoorden">${kaartjes.join('')}</div>
    </section>`;
}

/** Uitleg die bij het ontwerp hoort, als voordeel geformuleerd. Interne meldingen staan hier niet. */
function weetjes(r: Resultaat): string {
  const o = r.ontwerp;
  const w = woord();
  const inv = invoer();
  const bron = BRON_WOORD[inv.bron];
  const heeft = (code: string) => r.meldingen.some((m) => m.code === code);
  const kaartjes: string[] = [];
  const weetje = (icoon: string, kop: string, tekst: string) => `<div class="weetje">${icoon}<div><h3>${esc(kop)}</h3><p>${tekst}</p></div></div>`;

  // Midden is de standaard; alleen als de bedden kort genoeg zijn, mag de boer de kopakker kiezen.
  const voedingKnop = (naar: Voeding, tekst: string) =>
    `<button type="button" class="link" data-actie="voeding" data-waarde="${naar}">${tekst}</button>`;
  if (!o.voedingInMidden)
    kaartjes.push(
      weetje(
        ICOON.lampje,
        'Water vanaf de kopakker',
        `De verdeelslang ligt langs de kopakker en elke tape loopt ${nl(o.slanglengte_m, 0)} m het perceel in. Zo ligt er niets in het perceel waar je overheen rijdt. ${voedingKnop('midden', 'Toch vanuit het midden')}`,
      ),
    );
  else if (o.kopakkerMogelijk)
    kaartjes.push(
      weetje(
        ICOON.lampje,
        'Water vanuit het midden',
        `De verdeelslang ligt dwars door het midden van je perceel, zodat elke tape maar ${nl(o.slanglengte_m, 0)} m lang is en overal evenveel water geeft. Je ${w.meervoud} zijn kort genoeg om ook vanaf de kopakker te voeden. ${voedingKnop('kopakker', 'Liever vanaf de kopakker')}`,
      ),
    );
  else
    kaartjes.push(
      weetje(
        ICOON.lampje,
        o.aantalVerdeelleidingen === 1 ? 'Water vanuit het midden' : `Water vanuit ${o.aantalVerdeelleidingen} verdeelslangen`,
        `Je ${w.meervoud} zijn ${nl(inv.bedlengte_m, 0)} m lang. Een tape geeft tot ongeveer ${nl(o.maxSlanglengte_m, 0)} m overal evenveel water, daarom ${
          o.aantalVerdeelleidingen === 1
            ? 'leggen we de verdeelslang dwars door het midden van je perceel.'
            : `leggen we ${o.aantalVerdeelleidingen} verdeelslangen dwars over je perceel.`
        }`,
      ),
    );
  if (heeft('tape_jaarlijks'))
    kaartjes.push(weetje(ICOON.klok, 'Tape is een jaarlijkse kost', 'Eenjarige tape koop je elk seizoen opnieuw. Pomp, filter en leidingen gaan jaren mee.'));
  if (!heeft('pomptijd_te_lang') && !heeft('bron_te_klein_bed')) {
    const b = r.bandbreedte;
    const meer =
      r.aannames.some((a) => a.veld === 'brondebiet_m3u') && b && b.pompdebiet_m3u.max > o.sectieDebiet_m3u + 0.05
        ? ` Levert je ${bron.kort} meer dan we schatten, dan kunnen er minder secties en een grotere pomp (tot ${nl(b.pompdebiet_m3u.max)} m³/uur) in.`
        : '';
    kaartjes.push(weetje(ICOON.klok, `De pomp draait ${uren(o.pomptijdPerDag_u)} op een droge dag`, `Dat is op de warmste dagen. Gemiddeld is het minder.${meer}`));
  }
  const melding = (code: string) => r.meldingen.find((m) => m.code === code)?.tekst ?? '';
  if (heeft('ijzer')) kaartjes.push(weetje(ICOON.lampje, 'IJzer in het water', esc(melding('ijzer'))));
  if (heeft('zout')) kaartjes.push(weetje(ICOON.lampje, 'Zout in het water', esc(melding('zout'))));
  const m = s.handmatigPerceel ? null : maten();
  if (m && m.langsteBedlengte_m > m.gemiddeldeBedlengte_m * 1.15)
    kaartjes.push(
      weetje(
        ICOON.lampje,
        'Je perceel is niet recht',
        `De langste ${w.enkel} is ${nl(m.langsteBedlengte_m, 0)} m; we rekenen met gemiddeld ${nl(m.gemiddeldeBedlengte_m, 0)} m. Wij kijken of de lange ${w.meervoud} genoeg druk houden.`,
      ),
    );
  if (!kaartjes.length) return '';
  return `
    <section class="deel" aria-labelledby="h-weten">
      <header><h2 id="h-weten">Goed om te weten</h2></header>
      <div class="weetjes">${kaartjes.join('')}</div>
    </section>`;
}

function pakket(r: Resultaat): string {
  const o = r.ontwerp;
  const w = woord();
  const inv = invoer();
  const bron = BRON_WOORD[inv.bron];
  const zones: [string, string[]][] = [
    [bron.bij, ['pomp', 'filter', 'terugslagklep', 'watermeter', 'manometer', 'drukregelaar', 'fertigatie']],
    [bron.naar, ['hoofdleiding']],
    ['Verdeling over het perceel', ['verdeelslang', 'verdeelslang_eindkap', 'sectieafsluiter', 'magneetklep', 'beregeningscomputer', 'ontluchter', 'spoelventiel']],
    [`Op de ${w.meervoud}`, ['driptape', 'startkoppeling', 'eindstop', 'reparatiekoppeling']],
  ];
  // Zolang alles op aanvraag is, heeft een prijskolom geen zin.
  const metPrijs = r.stuklijst.some((l) => l.totaal !== null);
  const uitleg = (l: Stuklijstregel) => {
    if (l.rol !== 'driptape' || l.eenheid !== 'rol') return esc(l.uitleg);
    const rol = l.product?.rollengte_m ?? UITGANGSPUNTEN.standaardRollengteTape_m;
    return `${nl(o.aantalBedden, 0)} ${w.meervoud} × ${meervoud(o.tapesPerBed, 'tape', 'tapes')} × ${nl(inv.bedlengte_m, 0)} m = ${nl(o.meterTape, 0)} m, plus ${nl(UITGANGSPUNTEN.reserveTape * 100, 0)}% reserve, in rollen van ${nl(rol, 0)} m.`;
  };
  const rijen = zones
    .map(([zone, rollen]) => {
      const regels = r.stuklijst.filter((l) => rollen.includes(l.rol));
      if (!regels.length) return '';
      return (
        `<tr class="zone"><th colspan="${metPrijs ? 3 : 2}" scope="colgroup">${esc(zone)}</th></tr>` +
        regels
          .map(
            (l) =>
              `<tr><td class="getal">${eenheidVoluit(l.aantal, l.eenheid)}</td><td>${esc(l.omschrijving)}<span class="uitleg">${uitleg(l)}</span></td>${
                metPrijs ? `<td class="getal">${l.totaal === null ? '<span class="op-aanvraag">op aanvraag</span>' : euro(l.totaal)}</td>` : ''
              }</tr>`,
          )
          .join('')
      );
    })
    .join('');
  return `
    <section class="deel" aria-labelledby="h-pakket">
      <header>
        <h2 id="h-pakket">Dit zit er in je pakket</h2>
        <p>Alles van ${bron.kort} tot plant, op maat berekend voor jouw perceel.</p>
      </header>
      <div class="pakket"><table><thead><tr><th class="getal">Aantal</th><th>Onderdeel</th>${metPrijs ? '<th class="getal">Prijs</th>' : ''}</tr></thead><tbody>${rijen}</tbody></table></div>
    </section>`;
}

function offerte(r: Resultaat): string {
  const bron = BRON_WOORD[invoer().bron];
  const nareken = r.aannames.some((a) => a.veld === 'brondebiet_m3u')
    ? `Wij rekenen je plan na, ook wat je ${bron.kort} precies levert.`
    : 'Wij rekenen je plan persoonlijk na.';
  return `
    <section class="offerte" id="offerte" aria-labelledby="h-offerte">
      <header class="deel" style="gap:.3rem">
        <h2 id="h-offerte">Vraag je offerte aan</h2>
        <ul class="beloftes"><li>Vrijblijvend</li><li>Wij rekenen het persoonlijk na</li><li>Alles uit één hand</li></ul>
      </header>
      <ol class="stappen">
        <li>Je laat hieronder je naam en telefoonnummer achter.</li>
        <li>${nareken}</li>
        <li>We bellen je terug met een prijs op maat.</li>
      </ol>
      <form id="aanvraag" class="aanvraag" novalidate>
        <label class="veld"><span>Naam</span><input name="naam" autocomplete="name" required></label>
        <label class="veld"><span>Telefoon</span><input name="telefoon" type="tel" autocomplete="tel" required></label>
        <label class="veld"><span>E-mail <em>mag leeg</em></span><input name="email" type="email" autocomplete="email"></label>
        <label class="veld"><span>Plaats</span><input name="plaats" autocomplete="address-level2"></label>
        <label class="veld breed"><span>Opmerking <em>mag leeg</em></span><textarea name="opmerking" rows="3" placeholder="Bijvoorbeeld wanneer je het systeem nodig hebt"></textarea></label>
        <label class="vink breed"><input type="checkbox" name="akkoord" required> Je mag me bellen over deze aanvraag. We gebruiken je gegevens alleen daarvoor.</label>
        <p class="fout breed" id="aanvraagfout" aria-live="polite"></p>
        <div class="breed"><button type="submit" class="verder">Bel me terug</button></div>
      </form>
      <div id="aanvraagklaar"></div>
    </section>`;
}

/** Schema van bron tot secties. Alle maten komen uit het ontwerp; het perceel is niet op schaal. */
function schemaSvg(r: Resultaat): string {
  const o = r.ontwerp;
  const inv = invoer();
  const bron = BRON_WOORD[inv.bron];
  const hoofdleiding = r.stuklijst.find((l) => l.rol === 'hoofdleiding');
  const n = o.aantalSecties;
  const top = 20;
  const hoogte = 216;
  const strook = hoogte / n;
  const links = 390;
  const rechts = 750;

  const bronTeken =
    inv.bron === 'sloot'
      ? '<path d="M10 120 l18 34 h44 l18 -34" fill="none" stroke="var(--muted)" stroke-width="2.5"/><path d="M22 134 c10 5 20 5 30 0 s20 -5 30 0 l-8 18 h-44 z" fill="var(--water)"/>'
      : inv.bron === 'put'
        ? '<rect x="38" y="96" width="24" height="64" rx="3" fill="none" stroke="var(--muted)" stroke-width="2.5"/><rect x="40" y="128" width="20" height="30" fill="var(--water)"/>'
        : '<path d="M20 112 h34 a10 10 0 0 1 10 10 v6" fill="none" stroke="var(--muted)" stroke-width="7" stroke-linecap="round"/><path d="M64 138 c-3 5-3 8 0 10 3-2 3-5 0-10z" fill="var(--water)"/>';

  // Verdeelslangen: bij voeding uit het midden staan ze in het perceel, anders langs de kopkant.
  const k = o.voedingInMidden ? o.aantalVerdeelleidingen : 1;
  const verdeelX = Array.from({ length: k }, (_, i) => (o.voedingInMidden ? links + ((i + 0.5) / k) * (rechts - links) : links + 10));

  const stroken = Array.from({ length: n }, (_, i) => {
    const y = top + i * strook;
    const lijnen = Math.max(1, Math.min(4, Math.floor(strook / 12)));
    const tapes = Array.from({ length: lijnen }, (_, j) => {
      const ty = y + ((j + 1) * strook) / (lijnen + 1);
      return `M${links + 8} ${ty.toFixed(1)}H${rechts - 8}`;
    }).join('');
    const label = strook >= 18 ? `<text x="${o.voedingInMidden ? links + 12 : links + 24}" y="${(y + strook / 2 + 5).toFixed(1)}" class="sterk sectie">Sectie ${i + 1}</text>` : '';
    const kranen = verdeelX.map((x) => `<circle cx="${x.toFixed(1)}" cy="${(y + strook / 2).toFixed(1)}" r="${Math.min(6, strook / 3).toFixed(1)}"/>`).join('');
    return {
      vlak: `<rect x="${links}" y="${y.toFixed(1)}" width="${rechts - links}" height="${strook.toFixed(1)}" fill="${i % 2 ? 'var(--veld-2)' : 'var(--veld)'}"/>`,
      tapes,
      label,
      kranen,
    };
  });

  const verdeelTekst = o.voedingInMidden
    ? o.aantalVerdeelleidingen === 1
      ? 'Verdeelslang in het midden, kranen per sectie'
      : `${o.aantalVerdeelleidingen} verdeelslangen, kranen per sectie`
    : 'Verdeelslang langs de kopkant, kranen per sectie';
  const bovenTekst = o.voedingInMidden ? `tape gaat ${nl(o.slanglengte_m, 0)} m naar links en naar rechts` : `tapes van ${nl(o.slanglengte_m, 0)} m`;

  return `<svg viewBox="0 0 760 262" role="img" aria-label="Schema: ${bron.kort}, pomp, filter, ${hoofdleiding ? nl(hoofdleiding.aantal, 0) + ' meter ' : ''}hoofdleiding naar het perceel en ${n} ${n === 1 ? 'sectie' : 'secties'} met tapes">
    ${bronTeken}
    <text x="50" y="182" text-anchor="middle" class="sterk">${hoofdletter(bron.kort)}</text>
    <text x="50" y="198" text-anchor="middle" class="klein">± ${nl(o.brondebiet_m3u)} m³/uur</text>
    <path d="M70 128 H118" stroke="var(--accent)" stroke-width="5"/>
    <circle cx="140" cy="128" r="22" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/>
    <path d="M130 118 l22 10 -22 10 z" fill="var(--accent)"/>
    <text x="140" y="182" text-anchor="middle" class="sterk">Pomp</text>
    <text x="140" y="198" text-anchor="middle" class="klein">${nl(o.sectieDebiet_m3u)} m³/uur</text>
    <text x="140" y="213" text-anchor="middle" class="klein">${nl(o.pompdruk_bar)} bar</text>
    <path d="M162 128 H196" stroke="var(--accent)" stroke-width="5"/>
    <rect x="196" y="100" width="34" height="56" rx="8" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/>
    <path d="M203 112 h20 M203 120 h20 M203 128 h20 M203 136 h20 M203 144 h20" stroke="var(--muted)" stroke-width="1.5"/>
    <text x="213" y="182" text-anchor="middle" class="sterk">Filter</text>
    <text x="215" y="198" text-anchor="middle" class="klein">${o.filtertype === 'schijf' ? 'schijf' : 'zand +'}</text>${o.filtertype === 'schijf' ? '' : '<text x="215" y="213" text-anchor="middle" class="klein">schijf</text>'}
    <path d="M230 128 H${links}" stroke="var(--accent)" stroke-width="5" stroke-dasharray="14 6"/>
    <text x="310" y="114" text-anchor="middle" class="sterk">Hoofdleiding</text>
    <text x="310" y="150" text-anchor="middle" class="klein">${hoofdleiding ? `${nl(hoofdleiding.aantal, 0)} m, ` : ''}${o.hoofdleiding_mm} mm</text>
    ${stroken.map((x) => x.vlak).join('')}
    <rect x="${links}" y="${top}" width="${rechts - links}" height="${hoogte}" rx="4" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
    <path d="${stroken.map((x) => x.tapes).join('')}" stroke="var(--tape)" stroke-width="1.4" opacity=".75"/>
    <path d="M${links} 128 H${verdeelX[0]!.toFixed(1)} ${verdeelX.map((x) => `M${x.toFixed(1)} ${top + 2}V${top + hoogte - 2}`).join(' ')}" stroke="var(--accent)" stroke-width="6" fill="none"/>
    <g fill="var(--surface)" stroke="var(--ink)" stroke-width="2">${stroken.map((x) => x.kranen).join('')}</g>
    ${stroken.map((x) => x.label).join('')}
    <text x="${rechts}" y="254" text-anchor="end" class="klein">${verdeelTekst}</text>
    <text x="${(links + rechts) / 2}" y="13" text-anchor="middle" class="klein">${bovenTekst}</text>
  </svg>`;
}

function aanvraagTekst(r: Resultaat, f: Record<string, string>): string {
  const i = invoer();
  const o = r.ontwerp;
  return [
    `Aanvraag druppelirrigatie`,
    `Naam: ${f.naam}`,
    `Telefoon: ${f.telefoon}`,
    f.email ? `E-mail: ${f.email}` : '',
    f.plaats ? `Plaats: ${f.plaats}` : '',
    f.opmerking ? `Opmerking: ${f.opmerking}` : '',
    ``,
    `Gewas: ${gewasNaam(i.gewas)}`,
    `Perceel: bedlengte ${i.bedlengte_m} m, breedte ${i.perceelbreedte_m} m (${nl(o.beteeldOppervlak_ha, 2)} ha)`,
    s.ring ? `Perceelgrens (lengtegraad breedtegraad): ${s.ring.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join('; ')}` : '',
    `${woord().enkel === 'rug' ? 'Ruggen' : 'Bed'}: ${o.bedbreedte_m} m, ${o.tapesPerBed} tapes, ${o.tape} tape, voeding ${o.voedingInMidden ? 'vanuit het midden' : 'vanaf de kopakker'}`,
    `Bron: ${i.bron}, ${i.bronafstand_m} m van het perceel, ${i.brondebiet_m3u ?? 'debiet onbekend'} m³/u`,
    i.ijzer_mgl != null || i.ec_mScm != null ? `Wateranalyse: ijzer ${i.ijzer_mgl ?? '-'} mg/l, EC ${i.ec_mScm ?? '-'} mS/cm` : `Wateranalyse: niet ingevuld${i.bron === 'put' ? ' (put: eerst een watermonster laten nemen)' : ''}`,
    `Uitkomst: ${nl(o.meterTape, 0)} m tape, ${o.aantalSecties} secties, pomp ${nl(o.sectieDebiet_m3u)} m³/u bij ${nl(o.pompdruk_bar)} bar`,
    r.aannames.length ? `Aangenomen: ${r.aannames.map((a) => `${a.veld} = ${a.waarde}`).join(', ')}` : '',
    r.meldingen.length ? `Meldingen: ${r.meldingen.map((m) => `[${m.soort}] ${m.tekst}`).join(' | ')}` : '',
  ].filter((x, n) => x !== '' || n === 6).join('\n');
}

async function verstuur(form: HTMLFormElement): Promise<void> {
  const fout = document.getElementById('aanvraagfout')!;
  if (laatste && isGeblokkeerd(laatste)) return;
  const f = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
  if (!f.naam?.trim() || !f.telefoon?.trim()) {
    fout.textContent = 'Vul je naam en telefoonnummer in.';
    return;
  }
  if (!f.akkoord) {
    fout.textContent = 'Vink aan dat we je mogen bellen.';
    return;
  }
  fout.textContent = '';
  const tekst = aanvraagTekst(laatste!, f);
  const klaar = document.getElementById('aanvraagklaar')!;
  if (config.aanvraagUrl) {
    try {
      const a = await fetch(config.aanvraagUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gegevens: f, invoer: invoer(), perceel: s.ring ?? null, tekst }) });
      if (!a.ok) throw new Error();
      form.hidden = true;
      klaar.innerHTML = `<p class="gelukt">Bedankt ${esc(f.naam)}. We bellen je zo snel mogelijk terug.</p>`;
    } catch {
      fout.textContent = 'Versturen lukte niet. Probeer het later nog eens.';
    }
    return;
  }
  form.hidden = true;
  klaar.innerHTML = `
    <p class="let-op">Proefversie: de aanvraag is niet verstuurd. Dit is wat wij straks binnenkrijgen.</p>
    <pre class="aanvraagtekst" id="aanvraagtekst">${esc(tekst)}</pre>
    <div class="knoppen"><button type="button" data-actie="kopieer">Kopieer</button><button type="button" data-actie="formulierTerug">Gegevens aanpassen</button></div>`;
}

// ---------- bediening ----------
app.addEventListener('click', (e) => {
  const doel = e.target as HTMLElement;
  const keuze = doel.closest<HTMLElement>('[data-keuze]');
  if (keuze) {
    const naam = keuze.dataset.keuze as 'gewas' | 'grond' | 'bron' | 'water' | 'stroom';
    const w = keuze.dataset.waarde || null;
    if (naam === 'gewas') {
      if (s.gewas !== w) {
        s.bedbreedte = undefined;
        s.tapes = undefined;
      }
      s.gewas = w ?? undefined;
    } else (s as unknown as Record<string, unknown>)[naam] = w;
    bewaar();
    render();
    return;
  }
  const knop = doel.closest<HTMLElement>('[data-actie]');
  if (!knop || knop.tagName === 'FORM') return;
  const actie = knop.dataset.actie;
  const k = kaart;
  switch (actie) {
    case 'begin':
      s.stap = Math.max(1, s.stap);
      if (s.stap === 0) s.stap = 1;
      break;
    case 'opnieuw':
      s = { ...leeg(), stap: 1 };
      kaart?.begin(null, null);
      break;
    case 'verder':
      s.stap = Math.min(AANTAL + 1, s.stap + 1);
      window.scrollTo({ top: 0 });
      break;
    case 'terug':
      s.stap = Math.max(0, s.stap - 1);
      window.scrollTo({ top: 0 });
      break;
    case 'ga':
      s.stap = Number(knop.dataset.stap);
      window.scrollTo({ top: 0 });
      break;
    case 'handmatigPerceel':
      s.handmatigPerceel = true;
      break;
    case 'kaartPerceel':
      s.handmatigPerceel = false;
      break;
    case 'handmatigAfstand':
      s.handmatigAfstand = true;
      s.afstand = bronafstand();
      break;
    case 'kaartAfstand':
      s.handmatigAfstand = false;
      break;
    case 'teken':
      k?.startTekenen();
      s.ring = undefined;
      werkStapBij();
      return;
    case 'klaarTekenen':
      k?.stopTekenen();
      werkStapBij();
      return;
    case 'wis':
      k?.wisPerceel();
      if (k?.bezigMetTekenen) k.startTekenen();
      werkStapBij();
      return;
    case 'draai':
      s.gedraaid = !s.gedraaid;
      bewaar();
      werkStapBij();
      return;
    case 'voeding':
      s.voeding = knop.dataset.waarde as Voeding;
      break;
    case 'toonBlokkade':
      toonBlokkade();
      return;
    case 'sluitBlokkade':
      (document.getElementById('blokkadepopup') as HTMLDialogElement | null)?.close();
      return;
    case 'naarOfferte':
      document.getElementById('offerte')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector<HTMLInputElement>('#aanvraag [name="naam"]')?.focus({ preventScroll: true });
      return;
    case 'neemEmmer':
      s.debiet = Number(knop.dataset.waarde);
      break;
    case 'kopieer': {
      const t = document.getElementById('aanvraagtekst')!;
      navigator.clipboard?.writeText(t.textContent ?? '').then(
        () => (knop.textContent = 'Gekopieerd'),
        () => getSelection()?.selectAllChildren(t),
      );
      return;
    }
    case 'formulierTerug': {
      const f = document.getElementById('aanvraag');
      if (f) f.hidden = false;
      document.getElementById('aanvraagklaar')!.innerHTML = '';
      return;
    }
    default:
      return;
  }
  bewaar();
  render();
});

app.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const veld = el.dataset.veld;
  if (veld === 'emmer') return werkEmmerBij();
  if (veld) {
    const n = getal(el.value);
    if (veld === 'bedlengte') s.bedlengte = n;
    if (veld === 'perceelbreedte') s.perceelbreedte = n;
    if (veld === 'bedbreedte') s.bedbreedte = n;
    if (veld === 'tapes') {
      s.tapes = n;
      const plaatje = app.querySelector('.bedplaatje');
      if (plaatje && n) plaatje.innerHTML = bedSvg(n);
    }
    if (veld === 'afstand') s.afstand = n;
    if (veld === 'debiet') s.debiet = n;
    if (veld === 'ijzer') s.ijzer = n;
    if (veld === 'ec') s.ec = n;
    bewaar();
    werkStapBij();
  }
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  const vink = el.dataset.vink;
  if (!vink) return;
  if (vink === 'bedWeetNiet') s.bedWeetNiet = el.checked;
  if (vink === 'debietWeetNiet') s.debiet = el.checked ? null : undefined;
  if (vink === 'fertigatie') s.fertigatie = el.checked;
  if (vink === 'automatisch') s.automatisch = el.checked;
  bewaar();
  if (vink === 'fertigatie' || vink === 'automatisch') werkStapBij();
  else render();
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (form.dataset.actie === 'zoek') {
    const veld = form.querySelector<HTMLInputElement>('#zoekveld')!;
    const lijst = document.getElementById('zoekresultaten')!;
    if (!veld.value.trim()) return;
    lijst.innerHTML = '<li class="stil">Zoeken...</li>';
    try {
      const adressen = await deKaart().zoek(veld.value);
      lijst.innerHTML = adressen.length
        ? adressen.map((a, i) => `<li><button type="button" class="link" data-adres="${i}">${esc(a.naam)}</button></li>`).join('')
        : '<li class="stil">Niets gevonden. Probeer een postcode of plaatsnaam.</li>';
      lijst.querySelectorAll<HTMLButtonElement>('[data-adres]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = adressen[Number(b.dataset.adres)]!;
          deKaart().vliegNaar(a.punt, 16);
          lijst.innerHTML = '';
          deKaart().onMelding('Tik nu op je perceel.');
        }),
      );
    } catch {
      lijst.innerHTML = '<li class="stil">Zoeken lukt nu niet. Schuif en zoom zelf naar je perceel.</li>';
    }
  } else if (form.id === 'aanvraag') {
    await verstuur(form);
  }
});

if (s.stap > AANTAL) s.stap = AANTAL;
render();
