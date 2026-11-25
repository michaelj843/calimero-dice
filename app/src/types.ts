// The app's wire types (see the ABI table in ../README.md). `u64`s travel as decimal strings.

export interface Roll {
  id: string;
  by: string;
  sides: number;
  faces: number[];
  total: string;
  /** ms since the epoch */
  at: string;
}

export const MIN_SIDES = 2;
export const MAX_SIDES = 1000;
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;
