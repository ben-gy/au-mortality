// Types for the dependency-free pipeline parser so the test suite type-checks
// against it. parse.mjs stays plain JavaScript on purpose: CI runs it with bare
// node, without a build step or any dependency install.

declare module '*/parse.mjs' {
  export function decodeCp1252(buf: Buffer | string): string;
  export function parseCsv(text: string): string[][];
  export function parseRows(text: string): Record<string, string>[];
  export function num(v: unknown): number | null;
  export function splitCause(label: string): { name: string; icd: string };
  export function isLeafCause(row: { rank?: string }): boolean;
  export function stateOf(mortCode: string, level: string): string | null;
  export function asgsCode(mortCode: string): string;

  export interface ParsedRegion {
    code: string;
    level: string;
    name: string;
    state: string | null;
    d: Record<'P' | 'M' | 'F', ((number | null)[] | null)[]>;
  }

  export function buildRegions(rows: Record<string, string>[]): {
    years: number[];
    regions: ParsedRegion[];
    national: ParsedRegion;
  };

  export function buildCauses(
    rows: Record<string, string>[],
    validCodes?: Set<string>,
  ): {
    period: string;
    causes: { name: string; icd: string }[];
    rows: Record<string, Record<string, (number | null)[][]>>;
    totals: Record<string, Record<string, { all: number | null; allAsr: number | null; top20: number | null }>>;
  };

  export function validate(input: {
    regions: ParsedRegion[];
    national: ParsedRegion | null;
    causes: { rows: Record<string, unknown>; totals: Record<string, unknown> };
  }): string[];

  export const LEVELS: Record<string, string>;
  export const MEASURES: string[];
  export const SEXES: string[];
  export const NATIONAL_NAME: string;
  export const SUBTOTAL_CAUSES: Set<string>;
}
