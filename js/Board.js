import { Tile } from './Tile.js?v=18';
import {
  GRID_COLS, GRID_ROWS, STAGGER_DELAY, TOTAL_TRANSITION
} from './constants.js?v=18';

function scheduleTimeout(callback, delay) {
  return window.__kalshiBoardScheduler?.setTimeout(callback, delay) ?? setTimeout(callback, delay);
}

export class Board {
  constructor(containerEl, soundEngine) {
    this.cols = GRID_COLS;
    this.rows = GRID_ROWS;
    this.soundEngine = soundEngine;
    this.isTransitioning = false;
    this.tiles = [];
    this.currentGrid = [];
    this.currentToneGrid = [];
    this._queuedLines = null;
    this._hasRenderedFrame = false;
    this._synchronousFirstFrame = new URLSearchParams(window.location.search).get('screensaver') === '1';

    // Build board DOM
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';
    this.boardEl.style.setProperty('--grid-cols', this.cols);
    this.boardEl.style.setProperty('--grid-rows', this.rows);

    // Tile grid
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tile-grid';

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const charRow = [];
      const toneRow = [];
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c);
        tile.setChar(' ');
        this.gridEl.appendChild(tile.el);
        row.push(tile);
        charRow.push(' ');
        toneRow.push('');
      }
      this.tiles.push(row);
      this.currentGrid.push(charRow);
      this.currentToneGrid.push(toneRow);
    }

    this.boardEl.appendChild(this.gridEl);

    containerEl.appendChild(this.boardEl);
  }

  displayMessage(lines) {
    this.displayCells(this._formatToCells(lines));
  }

  displayCells(cells) {
    if (this.isTransitioning) {
      this._queuedLines = { cells };
      return;
    }
    this.isTransitioning = true;

    const newGrid = cells.map(row => row.map(cell => cell.char));
    const newToneGrid = cells.map(row => row.map(cell => cell.tone || ''));
    const renderSynchronously = this._synchronousFirstFrame && !this._hasRenderedFrame;

    // Determine which tiles need to change
    let hasChanges = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const newTone = newToneGrid[r][c];
        const oldChar = this.currentGrid[r][c];
        const oldTone = this.currentToneGrid[r][c];

        if (newChar !== oldChar || newTone !== oldTone) {
          if (renderSynchronously) {
            this.tiles[r][c].applyImmediately(newChar, newTone);
          } else {
            const delay = (r * this.cols + c) * STAGGER_DELAY;
            this.tiles[r][c].scrambleTo(newChar, delay, newTone);
          }
          hasChanges = true;
        }
      }
    }

    // Play the single transition audio clip once
    if (hasChanges && this.soundEngine && !renderSynchronously) {
      this.soundEngine.playTransition();
    }

    // Update grid state
    this.currentGrid = newGrid;
    this.currentToneGrid = newToneGrid;
    this._hasRenderedFrame = true;

    if (renderSynchronously) {
      this.isTransitioning = false;
      return;
    }

    // Clear transitioning flag after animation completes
    scheduleTimeout(() => {
      this.isTransitioning = false;
      if (this._queuedLines) {
        const { cells: queuedCells } = this._queuedLines;
        this._queuedLines = null;
        this.displayCells(queuedCells);
      }
    }, TOTAL_TRANSITION + 200);
  }

  _formatToCells(lines) {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      const line = (lines[r] || '').toUpperCase();
      const padTotal = this.cols - line.length;
      const padLeft = Math.max(0, Math.floor(padTotal / 2));
      const padded = ' '.repeat(padLeft) + line + ' '.repeat(Math.max(0, this.cols - padLeft - line.length));
      grid.push(padded.split('').map(char => ({ char, tone: '' })));
    }
    return grid;
  }
}
