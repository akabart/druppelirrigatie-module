# Druppelirrigatie-module

Calculator waarmee een boer zonder kennis van druppelirrigatie uitrekent wat hij nodig heeft voor een agrarisch druppelirrigatiesysteem, met prijs of offerte. Het plan staat in het projectdocument "Plan: Druppelirrigatie calculator".

Dit is fase 1: de rekenkern. Die staat los van WordPress, zodat hij zonder website te testen is. De wizard, de testpagina en de WordPress-plugin komen in latere fases.

## Wat er staat

| Pad | Inhoud |
| --- | --- |
| `src/rekenkern.ts` | De berekening van invoer naar ontwerp, stuklijst, prijs en bandbreedte. Bovenin staan alle vaste uitgangspunten (`UITGANGSPUNTEN`) bij elkaar. |
| `src/hydraulica.ts` | Snelheid, drukverlies (Hazen-Williams, Blasius), maximale tapelengte, leidingmaten. |
| `src/types.ts` | Wat de boer invult (`Invoer`) en wat eruit komt (`Resultaat`). |
| `data/gewassen.json` | Standaardwaarden per gewas: bedbreedte, tapes per bed, druppelaarafstand per grondsoort, afgifte, gewasfactor. |
| `data/producten.json` | Producten met dezelfde velden die later de WooCommerce-producten krijgen. `prijs: null` betekent prijs op aanvraag. |
| `test/` | Rekenvoorbeelden als automatische tests. |

## Gebruiken

```sh
npm install
npm test          # alle rekenvoorbeelden
npm run typecheck
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

## Een gewas of product toevoegen

- Gewas: voeg een regel toe aan `data/gewassen.json`. Het `id` is wat de wizard meestuurt.
- Product: voeg een regel toe aan `data/producten.json` met de juiste `rol` en de maten waarop de rekenkern zoekt (bijvoorbeeld `druppelaarafstand_m` en `druppelaardebiet_lu` voor tape, `diameter_inch` voor verdeelslang). Zet `maxLengte_m` als de fabrikant een maximale slanglengte opgeeft; die gaat dan voor de eigen berekening.

## Nog niet gecontroleerd

Alle getallen in `UITGANGSPUNTEN` en `data/gewassen.json` zijn vuistregels. De productgegevens komen van de Stadex-website en staan op `geverifieerd: false`. Een vakman moet ze nalopen voordat de calculator live gaat.
