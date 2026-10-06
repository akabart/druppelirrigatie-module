// De wizard voor de boer: één vraag per scherm, overal "Weet ik niet",
// en aan het eind de uitkomst met een aanvraag voor een offerte.
import './stijl.css';
import { bereken, InvoerFout, standaardData, TEELTWOORDEN, type Bron, type Grondsoort, type Invoer, type RekenData, type Resultaat, type Stroom, type Waterkwaliteit } from '../src/index';
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
  stroom?: Stroom | null;
  fertigatie: boolean;
  automatisch: boolean;
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
        [
          { waarde: 'zand', label: 'Zand', uitleg: 'minder dan 8% lutum', beeld: BEELD.grond('#e4c98f', korrels('#c9a862', 14, 1.6)) },
          { waarde: 'zand_klei', label: 'Zavel', uitleg: 'zand met klei, 8 tot 25% lutum', beeld: BEELD.grond('#c9a978', korrels('#9c7d52', 10, 1.4)) },
          { waarde: 'klei', label: 'Klei', uitleg: 'meer dan 25% lutum', beeld: BEELD.grond('#8f7457', korrels('#6e5741', 5, 2.4)) },
          { waarde: 'veen', label: 'Veen', uitleg: 'veel organische stof', beeld: BEELD.grond('#4b3a2c', korrels('#2f241b', 8, 1.2)) },
        ],
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
          [
            { waarde: 'put', label: 'Bron of put', uitleg: 'grondwater', beeld: '<svg viewBox="0 0 40 40"><path d="M4 34h32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M8 34v-4h24v4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="20" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="17" cy="20" r="3" fill="currentColor"/><path d="M26 17h6v-7h4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 29v1" stroke="currentColor" stroke-width="2.5"/><path d="M36 12c-1 2-1 3 0 4 1-1 1-2 0-4z" fill="#3fa7ff"/></svg>' },
            { waarde: 'sloot', label: 'Sloot of vijver', uitleg: 'oppervlaktewater', beeld: '<svg viewBox="0 0 40 40"><path d="M2 16l8 14h20l8-14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M8 22c4 2 8 2 12 0s8-2 12 0l-3 7H11z" fill="#3fa7ff"/></svg>' },
            { waarde: 'leiding', label: 'Leidingwater', uitleg: 'kraan of brandkraan', beeld: '<svg viewBox="0 0 40 40"><path d="M6 12h18a6 6 0 0 1 6 6v6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M30 28c-2 3-2 5 0 6 2-1 2-3 0-6z" fill="#3fa7ff"/></svg>' },
          ],
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
        [
          { waarde: 'helder', label: 'Helder', uitleg: 'geen aanslag', beeld: BEELD.druppel('#bfe3ff') },
          { waarde: 'ijzer', label: 'Roestbruin', uitleg: 'oranje aanslag op de bak', beeld: BEELD.druppel('#d2843f') },
          { waarde: 'algen', label: 'Groen of algen', uitleg: 'of er drijft vuil in', beeld: BEELD.druppel('#6fa35a') },
        ],
        s.water,
        'we nemen het zwaarste filter',
      ),
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
        [
          { waarde: 'geen', label: 'Geen stroom', uitleg: 'dan wordt het diesel', beeld: '<svg viewBox="0 0 40 40"><path d="M22 4L10 22h9l-2 14 13-19h-9z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M6 6l28 28" stroke="currentColor" stroke-width="2.5"/></svg>' },
          { waarde: '230V', label: 'Gewoon stopcontact', uitleg: '230 volt', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="14" cy="20" r="2.6" fill="currentColor"/><circle cx="26" cy="20" r="2.6" fill="currentColor"/></svg>' },
          { waarde: '400V', label: 'Krachtstroom', uitleg: '400 volt, de rode stekker', beeld: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#e0453a" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="12" r="2.3" fill="#fff"/><circle cx="13" cy="21" r="2.3" fill="#fff"/><circle cx="27" cy="21" r="2.3" fill="#fff"/><circle cx="16" cy="28" r="2.3" fill="#fff"/><circle cx="24" cy="28" r="2.3" fill="#fff"/></svg>' },
        ],
        s.stroom,
        'we rekenen met een dieselpomp',
      ),
    klaar: () => s.stroom !== undefined,
  },
  {
    titel: 'Extra',
    kort: 'Extra',
    vraag: 'Wat wil je er nog bij?',
    toon: () => `
      <p class="hulp">Allebei mag, geen van beide ook.</p>
      <div class="keuzes">
        <label class="keuze vinkkeuze"><input type="checkbox" data-vink="fertigatie" ${s.fertigatie ? 'checked' : ''}><span class="keuzetekst"><strong>Mest meegeven met het water</strong><span>fertigatie: een pomp die meststof bijdoseert</span></span></label>
        <label class="keuze vinkkeuze"><input type="checkbox" data-vink="automatisch" ${s.automatisch ? 'checked' : ''}><span class="keuzetekst"><strong>Automatisch laten lopen</strong><span>een computer zet de secties om de beurt aan</span></span></label>
      </div>`,
    klaar: () => true,
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
      <p class="intro">Beantwoord ${AANTAL} korte vragen over je perceel en je water. Je ziet meteen hoeveel tape, welke pomp en welke onderdelen erbij horen. Weet je iets niet, kies dan "Weet ik niet". Dan rekenen we met een veilige aanname en kijkt een vakman met je mee.</p>
      <ul class="beloftes">
        <li>Duurt een paar minuten</li>
        <li>Je perceel teken je op de kaart</li>
        <li>Nergens aan vast</li>
      </ul>
      <p class="let-op">Proefversie. De rekenregels worden nog door een vakman nagelopen en de prijzen volgen later.</p>
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
    stroom: s.stroom ?? null,
    fertigatie: s.fertigatie,
    automatisch: s.automatisch,
  };
}

/** Welke stap hoort bij welk invoerveld, zodat de boer een aanname direct kan aanpassen. */
const STAP_VAN: Partial<Record<keyof Invoer, number>> = { bedbreedte_m: 3, tapesPerBed: 3, grond: 4, brondebiet_m3u: 6, water: 7, stroom: 8 };
const POMP: Record<string, string> = { diesel: 'dieselpomp', elektrisch_230V: 'elektrische pomp, 230 V', elektrisch_400V: 'elektrische pomp, 400 V' };
const ZONES: [string, string[]][] = [
  ['Op het veld', ['driptape', 'startkoppeling', 'eindstop', 'reparatiekoppeling']],
  ['Verdeling over het perceel', ['verdeelslang', 'verdeelslang_eindkap', 'sectieafsluiter', 'magneetklep', 'beregeningscomputer', 'ontluchter', 'spoelventiel']],
  ['Leiding van bron naar perceel', ['hoofdleiding']],
  ['Bij de bron', ['pomp', 'filter', 'terugslagklep', 'watermeter', 'manometer', 'drukregelaar', 'fertigatie']],
];

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
  const b = r.bandbreedte;
  const m = s.handmatigPerceel ? null : maten();
  const extra: string[] = [];
  if (m && m.langsteBedlengte_m > m.gemiddeldeBedlengte_m * 1.15)
    extra.push(
      `Je perceel is niet recht. De langste ${woord().enkel} is ${nl(m.langsteBedlengte_m, 0)} m; we rekenen met gemiddeld ${nl(m.gemiddeldeBedlengte_m, 0)} m. De vakman kijkt of de lange ${woord().meervoud} genoeg druk houden.`,
    );
  const meldingen = [...extra, ...r.waarschuwingen];
  const bereik = (v: { min: number; max: number }, d = 0) => (v.min === v.max ? nl(v.min, d) : `${nl(v.min, d)} tot ${nl(v.max, d)}`);

  const rijen = ZONES.map(([zone, rollen]) => {
    const regels = r.stuklijst.filter((l) => rollen.includes(l.rol));
    if (!regels.length) return '';
    return `<tr class="zone"><th colspan="3" scope="colgroup">${zone}</th></tr>` + regels.map((l) => `
      <tr><td class="getal">${nl(l.aantal, 0)} ${esc(l.eenheid)}</td><td>${esc(l.omschrijving)}<span class="uitleg">${esc(l.uitleg)}</span></td><td class="getal">${l.totaal === null ? '<span class="op-aanvraag">op aanvraag</span>' : euro(l.totaal)}</td></tr>`).join('');
  }).join('');

  app.innerHTML = `
    <section class="scherm uitkomst">
      <p class="bovenkop">${esc(gewasNaam(s.gewas))} · ${nl(o.beteeldOppervlak_ha, 2)} ha</p>
      <h1>Dit heb je nodig</h1>
      <p class="intro">${o.aantalBedden} ${woord().meervoud} met ${o.tapesPerBed} ${o.tapesPerBed === 1 ? 'tape' : 'tapes'} elk, samen <strong>${nl(o.meterTape, 0)} meter tape</strong>. Je bron kan niet alles tegelijk aan, dus het perceel wordt verdeeld in <strong>${o.aantalSecties} ${o.aantalSecties === 1 ? 'sectie' : 'secties'}</strong> die om de beurt water krijgen.</p>
      <div class="cijfers">
        <div class="cijfer"><span class="label">Pomp</span><span class="waarde">${nl(o.sectieDebiet_m3u)} m³/u</span><span class="sub">${nl(o.pompdruk_bar)} bar, ${POMP[o.pomptype]}${b && b.pompdebiet_m3u.min !== b.pompdebiet_m3u.max ? `<br>kan ${bereik(b.pompdebiet_m3u, 1)} m³/u worden` : ''}</span></div>
        <div class="cijfer"><span class="label">Secties</span><span class="waarde">${o.aantalSecties} × ${o.beddenPerSectie} ${woord().meervoud}</span><span class="sub">elke sectie ${uren(o.beregeningstijdPerSectie_u)} per dag</span></div>
        <div class="cijfer"><span class="label">Water op een droge dag</span><span class="waarde">${nl(o.dagbehoefte_m3, 0)} m³</span><span class="sub">pomp draait ${uren(o.pomptijdPerDag_u)}</span></div>
        <div class="cijfer"><span class="label">Tape</span><span class="waarde">${nl(o.meterTape, 0)} m</span><span class="sub">${b && b.meterTape.min !== b.meterTape.max ? `kan ${bereik(b.meterTape)} m worden` : `${o.aantalSlangen} slangen van ${nl(o.slanglengte_m, 0)} m`}</span></div>
      </div>
      ${meldingen.length ? `<div class="blok"><h2>Let op</h2><ul class="meldingen waarschuwing">${meldingen.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${r.aannames.length ? `<div class="blok"><h2>Hier hebben we iets aangenomen</h2><ul class="meldingen aanname">${r.aannames.map((a) => `<li><span><strong>${esc(a.waarde)}</strong>: ${esc(a.uitleg)}</span>${STAP_VAN[a.veld] ? `<button type="button" class="link" data-actie="ga" data-stap="${STAP_VAN[a.veld]}">Aanpassen</button>` : ''}</li>`).join('')}</ul></div>` : ''}
      <details class="blok stuklijst">
        <summary><h2>Alle onderdelen (${r.stuklijst.length})</h2></summary>
        <div class="tabel"><table><thead><tr><th class="getal">Aantal</th><th>Onderdeel</th><th class="getal">Prijs</th></tr></thead><tbody>${rijen}</tbody></table></div>
      </details>
      ${r.route === 'bestellen' && r.totaalprijs !== null ? routeBestellen(r.totaalprijs) : routeOfferte(r)}
      <div class="knoppen">
        <button type="button" data-actie="terug">Antwoorden aanpassen</button>
      </div>
    </section>`;
}

function routeBestellen(prijs: number): string {
  return `<div class="blok route bestellen"><h2>Totaal ${euro(prijs)}</h2><p>Alles is bekend, dus je kunt dit pakket direct bestellen.</p><button type="button" class="verder" disabled>In winkelmand (volgt met de webshop)</button></div>`;
}

function routeOfferte(r: Resultaat): string {
  const reden = r.aannames.length
    ? `Omdat je ${r.aannames.length === 1 ? 'één vraag' : `${r.aannames.length} vragen`} niet wist, rekent een vakman het voor je na.`
    : 'Nog niet alle onderdelen hebben een vaste prijs, dus je krijgt een offerte op maat.';
  return `
    <div class="blok route offerte">
      <h2>Vraag een offerte aan</h2>
      <p>${reden} Laat je gegevens achter, dan bellen we je terug met een prijs.</p>
      <form id="aanvraag" class="aanvraag" novalidate>
        <label class="veld"><span>Naam</span><input name="naam" autocomplete="name" required></label>
        <label class="veld"><span>Telefoon</span><input name="telefoon" type="tel" autocomplete="tel" required></label>
        <label class="veld"><span>E-mail <em>mag leeg</em></span><input name="email" type="email" autocomplete="email"></label>
        <label class="veld"><span>Plaats</span><input name="plaats" autocomplete="address-level2"></label>
        <label class="veld breed"><span>Opmerking <em>mag leeg</em></span><textarea name="opmerking" rows="3" placeholder="Bijvoorbeeld wanneer je het systeem nodig hebt"></textarea></label>
        <label class="vink breed"><input type="checkbox" name="akkoord" required> Je mag me bellen over deze aanvraag. We gebruiken je gegevens alleen daarvoor.</label>
        <p class="fout breed" id="aanvraagfout" aria-live="polite"></p>
        <button type="submit" class="verder breed">Bel me terug</button>
      </form>
      <div id="aanvraagklaar"></div>
    </div>`;
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
    `${woord().enkel === 'rug' ? 'Ruggen' : 'Bed'}: ${o.bedbreedte_m} m, ${o.tapesPerBed} tapes`,
    `Bron: ${i.bron}, ${i.bronafstand_m} m van het perceel, ${i.brondebiet_m3u ?? 'debiet onbekend'} m³/u`,
    `Uitkomst: ${nl(o.meterTape, 0)} m tape, ${o.aantalSecties} secties, pomp ${nl(o.sectieDebiet_m3u)} m³/u bij ${nl(o.pompdruk_bar)} bar`,
    r.aannames.length ? `Aangenomen: ${r.aannames.map((a) => `${a.veld} = ${a.waarde}`).join(', ')}` : '',
  ].filter((x, n) => x !== '' || n === 6).join('\n');
}

async function verstuur(form: HTMLFormElement): Promise<void> {
  const fout = document.getElementById('aanvraagfout')!;
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
    <p class="let-op">Proefversie: de aanvraag is niet verstuurd. Dit is wat de vakman straks binnenkrijgt.</p>
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
