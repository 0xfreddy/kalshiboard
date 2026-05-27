import { Tile } from './Tile.js?v=7';
import {
  GRID_COLS, GRID_ROWS, STAGGER_DELAY, TOTAL_TRANSITION
} from './constants.js?v=7';

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
    this.logoEl = null;

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

    this.logoEl = document.createElement('img');
    this.logoEl.className = 'market-logo';
    this.logoEl.alt = '';
    this.logoEl.hidden = true;
    this.boardEl.appendChild(this.logoEl);

    containerEl.appendChild(this.boardEl);
  }

  displayMessage(lines) {
    this.displayCells(this._formatToCells(lines), null);
  }

  displayCells(cells, logoUrl = null) {
    if (this.isTransitioning) {
      this._queuedLines = { cells, logoUrl };
      return;
    }
    this.isTransitioning = true;

    const newGrid = cells.map(row => row.map(cell => cell.char));
    const newToneGrid = cells.map(row => row.map(cell => cell.tone || ''));

    // Determine which tiles need to change
    let hasChanges = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const newTone = newToneGrid[r][c];
        const oldChar = this.currentGrid[r][c];
        const oldTone = this.currentToneGrid[r][c];

        if (newChar !== oldChar || newTone !== oldTone) {
          const delay = (r * this.cols + c) * STAGGER_DELAY;
          this.tiles[r][c].scrambleTo(newChar, delay, newTone);
          hasChanges = true;
        }
      }
    }

    // Play the single transition audio clip once
    if (hasChanges && this.soundEngine) {
      this.soundEngine.playTransition();
    }

    // Update grid state
    this.currentGrid = newGrid;
    this.currentToneGrid = newToneGrid;
    this.setLogo(logoUrl);

    // Clear transitioning flag after animation completes
    setTimeout(() => {
      this.isTransitioning = false;
      if (this._queuedLines) {
        const { cells: queuedCells, logoUrl: queuedLogoUrl } = this._queuedLines;
        this._queuedLines = null;
        this.displayCells(queuedCells, queuedLogoUrl);
      }
    }, TOTAL_TRANSITION + 200);
  }

  setLogo(logoUrl) {
    if (!this.logoEl) return;
    if (!logoUrl) {
      this.logoEl.hidden = true;
      this.logoEl.removeAttribute('src');
      return;
    }

    this.logoEl.src = logoUrl;
    this.logoEl.hidden = false;
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
