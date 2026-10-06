import gewassen from '../data/gewassen.json';
import producten from '../data/producten.json';
import type { Gewas, Product, RekenData } from './types';

export { bereken, InvoerFout, UITGANGSPUNTEN } from './rekenkern';
export type * from './types';

/** De meegeleverde gewas- en producttabel. In WordPress komen de producten later uit WooCommerce. */
export const standaardData: RekenData = {
  gewassen: gewassen as Gewas[],
  producten: producten as Product[],
};
