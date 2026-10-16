// The built-in vocabulary, compiled from data/ by `npm run data`.
import raw from './generated/vocabulary.json';
import type { Dataset, SignPack } from '../domain/types';

export const dataset = raw as unknown as Dataset;

let signPack: Promise<SignPack> | null = null;

/** NZSL sign data is loaded on first use so it never delays the main screen. */
export function loadSignPack(): Promise<SignPack> {
  signPack ??= import('./generated/signs-nzsl.json').then((m) => m.default as unknown as SignPack);
  return signPack;
}
