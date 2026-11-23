import type { Einkaufsplanung, Kochtagebuch } from './app';

export type EnrichedKochtagebuch = Kochtagebuch & {
  gerichtName: string;
};

export type EnrichedEinkaufsplanung = Einkaufsplanung & {
  gerichteName: string;
};
