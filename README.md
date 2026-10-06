# Druppelirrigatie-module

Calculator waarmee een boer zonder kennis van druppelirrigatie uitrekent wat hij nodig heeft voor een agrarisch druppelirrigatiesysteem, met prijs of offerte. Het plan staat in het projectdocument "Plan: Druppelirrigatie calculator".

De rekenkern (fase 1) en de wizard voor de boer (fase 2) staan los van WordPress, zodat ze zonder website te testen zijn. De WordPress-plugin komt in fase 3.

De wizard staat online op https://akabart.github.io/druppelirrigatie-module/ en wordt bij elke wijziging op `main` vanzelf bijgewerkt.

## Wat er staat

| Pad | Inhoud |
| --- | --- |
| `src/rekenkern.ts` | De berekening van invoer naar ontwerp, stuklijst, prijs en bandbreedte. Bovenin staan alle vaste uitgangspunten (`UITGANGSPUNTEN`) bij elkaar. |
| `src/hydraulica.ts` | Snelheid, drukverlies (Hazen-Williams, Blasius), maximale tapelengte, leidingmaten. |
| `src/types.ts` | Wat de boer invult (`Invoer`) en wat eruit komt (`Resultaat`). |
| `data/gewassen.json` | Standaardwaarden per gewas: bedbreedte, tapes per bed, druppelaarafstand per grondsoort, afgifte, gewasfactor. |
| `data/producten.json` | Producten met dezelfde velden die later de WooCommerce-producten krijgen. `prijs: null` betekent prijs op aanvraag. |
| `src/perceel.ts` | Van een perceel op de kaart naar bedlengte, breedte en afstand tot de bron. |
| `wizard/` | De wizard: negen vragen, kaart (PDOK-luchtfoto en BRP-perceelgrenzen), uitkomst en offerteaanvraag. |
| `scripts/bouw-wizard.mjs` | Bouwt de wizard tot één bestand: `dist/index.html`. |
| `test/` | Rekenvoorbeelden als automatische tests. |

## Gebruiken

```sh
npm install
npm test          # alle rekenvoorbeelden
npm run typecheck
npm run bouw      # wizard naar dist/index.html; open dat bestand in de browser
```

```ts
import { bereken, standaardData } from './src/index';

const resultaat = bereken(
  {
    gewas: 'zaaiuien',
    bedlengte_m: 150,
    perceelbreedte_m: 80,
    bedbreedte_m: 1.5,
    tapesPerBed: 3,
    grond: null, // "Weet ik niet"
    bron: 'put',
    bronafstand_m: 100,
    brondebiet_m3u: 20,
    water: 'helder',
    stroom: '400V',
    fertigatie: false,
    automatisch: false,
  },
  standaardData,
);
// resultaat.route: 'bestellen' of 'offerte'
// resultaat.stuklijst, resultaat.aannames, resultaat.waarschuwingen, resultaat.bandbreedte
```

## De wizard in WordPress (later)

De wizard leest optioneel `window.DRUPPELCALCULATOR` voordat hij start:

```js
window.DRUPPELCALCULATOR = {
  data: { gewassen: [...], producten: [...] }, // bijvoorbeeld uit WooCommerce
  aanvraagUrl: '/wp-json/druppelcalculator/v1/aanvraag', // waar de offerteaanvraag heen gaat
};
```

Zonder `aanvraagUrl` is het een proefversie: de aanvraag wordt dan niet verstuurd maar op het scherm getoond.

## Een gewas of product toevoegen

- Gewas: voeg een regel toe aan `data/gewassen.json`. Het `id` is wat de wizard meestuurt.
- Product: voeg een regel toe aan `data/producten.json` met de juiste `rol` en de maten waarop de rekenkern zoekt (bijvoorbeeld `druppelaarafstand_m` en `druppelaardebiet_lu` voor tape, `diameter_inch` voor verdeelslang). Zet `maxLengte_m` als de fabrikant een maximale slanglengte opgeeft; die gaat dan voor de eigen berekening.

## Nog niet gecontroleerd

Alle getallen in `UITGANGSPUNTEN` en `data/gewassen.json` zijn vuistregels. De productgegevens komen van de Stadex-website en staan op `geverifieerd: false`. Een vakman moet ze nalopen voordat de calculator live gaat.
