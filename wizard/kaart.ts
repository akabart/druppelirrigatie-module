// Kaart voor stap 2 (perceel) en stap 5 (bron). Luchtfoto en perceelgrenzen
// komen van PDOK: open data, geen sleutel nodig.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ligtIn, type LonLat } from '../src/perceel';

export type KaartModus = 'kies' | 'teken' | 'bron' | 'kijk';

export interface Adres {
  naam: string;
  punt: LonLat;
}

const LUCHTFOTO = 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg';
const BRT = 'https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png';
const BRP = 'https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items';
const ZOEK = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
/** Midden van de Noordoostpolder. */
const START: L.LatLngTuple = [52.7, 5.75];

const naarLL = ([lon, lat]: LonLat): L.LatLngTuple => [lat, lon];
const naarLonLat = (p: L.LatLng): LonLat => [p.lng, p.lat];

export class PerceelKaart {
  readonly el: HTMLElement;
  ring: LonLat[] | null = null;
  bron: LonLat | null = null;
  /** Wordt aangeroepen als het perceel of de bron verandert. */
  onWijzig: () => void = () => {};
  /** Korte melding voor onder de kaart. */
  onMelding: (tekst: string, soort?: 'info' | 'fout') => void = () => {};

  private kaart: L.Map;
  private modus: KaartModus = 'kies';
  private vlak: L.Polygon | null = null;
  private hoeken: L.Marker[] = [];
  private bronMarker: L.Marker | null = null;
  private bronLijn: L.Polyline | null = null;
  private tekenen = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'kaart';
    this.kaart = L.map(this.el, { center: START, zoom: 12, zoomControl: true, attributionControl: true });
    const foto = L.tileLayer(LUCHTFOTO, { maxZoom: 21, maxNativeZoom: 19, attribution: 'Luchtfoto © PDOK' });
    const brt = L.tileLayer(BRT, { maxZoom: 21, maxNativeZoom: 19, attribution: 'Kaart © Kadaster' });
    foto.addTo(this.kaart);
    let gemeld = false;
    const tegelFout = () => {
      if (gemeld) return;
      gemeld = true;
      this.onMelding('De kaart laadt hier niet. Kies hieronder "Ik vul de maten liever zelf in".', 'fout');
    };
    foto.on('tileerror', tegelFout);
    brt.on('tileerror', tegelFout);
    L.control.layers({ Luchtfoto: foto, Kaart: brt }, undefined, { position: 'topright' }).addTo(this.kaart);
    this.kaart.on('click', (e: L.LeafletMouseEvent) => this.klik(e.latlng));
  }

  /** Na verplaatsen in de pagina moet Leaflet zijn maat opnieuw bepalen. */
  ververs(): void {
    requestAnimationFrame(() => {
      this.kaart.invalidateSize();
      this.passend();
    });
  }

  zetModus(m: KaartModus): void {
    this.modus = m;
    this.tekenen = false;
    this.el.dataset.modus = m;
    this.tekenHoeken();
  }

  begin(ring: LonLat[] | null, bron: LonLat | null): void {
    this.ring = ring;
    this.bron = bron;
    this.tekenVlak();
    this.tekenBron();
  }

  async zoek(tekst: string): Promise<Adres[]> {
    const url = `${ZOEK}?q=${encodeURIComponent(tekst)}&rows=6&fl=weergavenaam,centroide_ll,type`;
    const antwoord = await fetch(url);
    if (!antwoord.ok) throw new Error('Zoeken lukt nu niet.');
    const json = (await antwoord.json()) as { response: { docs: { weergavenaam: string; centroide_ll: string }[] } };
    return json.response.docs.flatMap((d) => {
      const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(d.centroide_ll);
      return m ? [{ naam: d.weergavenaam, punt: [Number(m[1]), Number(m[2])] as LonLat }] : [];
    });
  }

  vliegNaar(punt: LonLat, zoom = 16): void {
    this.kaart.setView(naarLL(punt), zoom);
  }

  wisPerceel(): void {
    this.ring = null;
    this.tekenVlak();
    this.onWijzig();
  }

  /** Begin met intekenen: elke klik zet een hoekpunt. */
  startTekenen(): void {
    this.zetModus('teken');
    this.ring = [];
    this.tekenen = true;
    this.tekenVlak();
    this.onMelding('Tik de hoeken van je perceel aan, één voor één. Tik daarna op "Klaar met intekenen".');
  }

  stopTekenen(): void {
    this.tekenen = false;
    if (this.ring && this.ring.length < 3) {
      this.ring = null;
      this.onMelding('Een perceel heeft minstens drie hoeken nodig.', 'fout');
    }
    this.tekenVlak();
    this.onWijzig();
  }

  get bezigMetTekenen(): boolean {
    return this.tekenen;
  }

  private klik(p: L.LatLng): void {
    if (this.modus === 'kies') void this.kiesPerceel(naarLonLat(p));
    else if (this.modus === 'teken' && this.tekenen) {
      this.ring = [...(this.ring ?? []), naarLonLat(p)];
      this.tekenVlak();
    } else if (this.modus === 'bron') {
      this.bron = naarLonLat(p);
      this.tekenBron();
      this.onWijzig();
    }
  }

  private async kiesPerceel(punt: LonLat): Promise<void> {
    const d = 0.0006;
    const bbox = [punt[0] - d, punt[1] - d, punt[0] + d, punt[1] + d].join(',');
    this.onMelding('Perceel zoeken...');
    try {
      const antwoord = await fetch(`${BRP}?f=json&limit=50&bbox=${bbox}`);
      if (!antwoord.ok) throw new Error(String(antwoord.status));
      const json = (await antwoord.json()) as { features: { geometry: { type: string; coordinates: unknown }; properties: { gewas?: string; jaar?: number } }[] };
      for (const f of json.features) {
        const ringen: LonLat[][] =
          f.geometry.type === 'Polygon'
            ? [(f.geometry.coordinates as LonLat[][])[0]!]
            : f.geometry.type === 'MultiPolygon'
              ? (f.geometry.coordinates as LonLat[][][]).map((p) => p[0]!)
              : [];
        const raak = ringen.find((r) => ligtIn(punt, r));
        if (raak) {
          this.ring = raak.slice(0, -1);
          this.tekenVlak();
          this.onWijzig();
          const g = f.properties.gewas ? ` (in ${f.properties.jaar ?? 'het register'} stond hier: ${f.properties.gewas.toLowerCase()})` : '';
          this.onMelding(`Perceel gevonden${g}. Klopt de grens niet? Sleep de witte hoekpunten.`);
          return;
        }
      }
      this.onMelding('Hier staat geen perceel in het register. Teken het zelf in.', 'fout');
    } catch {
      this.onMelding('De perceelkaart is nu niet bereikbaar. Teken je perceel zelf in of vul de maten in.', 'fout');
    }
  }

  private tekenVlak(): void {
    this.vlak?.remove();
    this.vlak = null;
    if (this.ring && this.ring.length >= 2) {
      this.vlak = L.polygon(this.ring.map(naarLL), { color: '#ffd23f', weight: 3, fillColor: '#ffd23f', fillOpacity: 0.18, interactive: false }).addTo(this.kaart);
    }
    this.tekenHoeken();
    this.tekenBron();
  }

  private tekenHoeken(): void {
    for (const h of this.hoeken) h.remove();
    this.hoeken = [];
    if (!this.ring || (this.modus !== 'kies' && this.modus !== 'teken')) return;
    this.ring.forEach((p, i) => {
      const m = L.marker(naarLL(p), {
        draggable: true,
        icon: L.divIcon({ className: 'hoekpunt', iconSize: [18, 18] }),
        keyboard: false,
      }).addTo(this.kaart);
      m.on('drag', () => {
        if (!this.ring) return;
        this.ring[i] = naarLonLat(m.getLatLng());
        this.vlak?.setLatLngs(this.ring.map(naarLL));
      });
      m.on('dragend', () => this.onWijzig());
      this.hoeken.push(m);
    });
  }

  private tekenBron(): void {
    this.bronMarker?.remove();
    this.bronLijn?.remove();
    this.bronMarker = null;
    this.bronLijn = null;
    if (!this.bron) return;
    this.bronMarker = L.marker(naarLL(this.bron), {
      draggable: this.modus === 'bron',
      icon: L.divIcon({ className: 'bronpunt', iconSize: [22, 22] }),
    }).addTo(this.kaart);
    this.bronMarker.on('dragend', () => {
      this.bron = naarLonLat(this.bronMarker!.getLatLng());
      this.tekenBron();
      this.onWijzig();
    });
    if (this.ring && this.ring.length >= 3) {
      const dichtst = dichtstbijzijnd(this.bron, this.ring);
      this.bronLijn = L.polyline([naarLL(this.bron), naarLL(dichtst)], { color: '#3fa7ff', weight: 3, dashArray: '6 6', interactive: false }).addTo(this.kaart);
    }
  }

  private passend(): void {
    const punten = [...(this.ring ?? []), ...(this.bron ? [this.bron] : [])];
    if (punten.length >= 2) this.kaart.fitBounds(L.latLngBounds(punten.map(naarLL)), { padding: [30, 30], maxZoom: 18 });
  }
}

/** Dichtstbijzijnde punt op de rand, voor de stippellijn van bron naar perceel. */
function dichtstbijzijnd(p: LonLat, ring: LonLat[]): LonLat {
  if (ligtIn(p, ring)) return p;
  const k = Math.cos((p[1] * Math.PI) / 180);
  let beste: LonLat = ring[0]!;
  let min = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = (b[0] - a[0]) * k;
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * k) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q: LonLat = [a[0] + t * (b[0] - a[0]), a[1] + t * dy];
    const d = Math.hypot((q[0] - p[0]) * k, q[1] - p[1]);
    if (d < min) {
      min = d;
      beste = q;
    }
  }
  return beste;
}
