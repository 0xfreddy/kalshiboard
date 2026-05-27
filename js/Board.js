import { Tile } from './Tile.js?v=26';
import {
  GRID_COLS, GRID_ROWS, MAX_GRID_COLS, MAX_GRID_ROWS, MIN_GRID_COLS, MIN_GRID_ROWS, STAGGER_DELAY, transitionDuration
} from './constants.js?v=26';

function scheduleTimeout(callback, delay) {
  return window.__kalshiBoardScheduler?.setTimeout(callback, delay) ?? setTimeout(callback, delay);
}

function clampDimension(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export class Board {
  constructor(containerEl, soundEngine, options = {}) {
    this.cols = clampDimension(options.cols, GRID_COLS, MIN_GRID_COLS, MAX_GRID_COLS);
    this.rows = clampDimension(options.rows, GRID_ROWS, MIN_GRID_ROWS, MAX_GRID_ROWS);
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
    this._syncTileSize = this._syncTileSize.bind(this);

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
    this._syncTileSize();
    window.addEventListener('resize', this._syncTileSize);
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
    }, transitionDuration(this.cols, this.rows) + 200);
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

  transitionDuration() {
    return transitionDuration(this.cols, this.rows);
  }

  _syncTileSize() {
    const style = getComputedStyle(this.boardEl);
    const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    const paddingY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const gap = Number.parseFloat(style.getPropertyValue('--tile-gap')) || 0;
    const availableWidth = this.boardEl.clientWidth - paddingX - ((this.cols - 1) * gap);
    const availableHeight = this.boardEl.clientHeight - paddingY - ((this.rows - 1) * gap);
    const tileSize = Math.max(1, Math.min(availableWidth / this.cols, availableHeight / this.rows));
    this.boardEl.style.setProperty('--tile-size', `${tileSize}px`);
  }
}
