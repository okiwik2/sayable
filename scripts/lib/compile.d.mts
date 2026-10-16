// Types for the data build script, so tests can call it.
export interface CompileResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataset: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signPack: any;
  errors: string[];
  warnings: string[];
}
export function compile(opts?: { requireAssets?: boolean; keepMissingSymbols?: boolean }): CompileResult;
export function syllableToNumber(syl: string): { plain: string; num: string };
export function joinWord(syllables: string[]): string;
