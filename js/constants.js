export const GRID_COLS = 30;
export const GRID_ROWS = 10;
export const MIN_GRID_COLS = 18;
export const MAX_GRID_COLS = 30;
export const MIN_GRID_ROWS = 6;
export const MAX_GRID_ROWS = 10;

export const SCRAMBLE_DURATION = 800;
export const FLIP_DURATION = 300;
export const STAGGER_DELAY = 25;
export const transitionDuration = (cols = GRID_COLS, rows = GRID_ROWS) =>
  (cols * rows * STAGGER_DELAY) + SCRAMBLE_DURATION + FLIP_DURATION + 500;
export const TOTAL_TRANSITION = transitionDuration();

export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?\'/: ';
