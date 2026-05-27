import { CHARSET, SCRAMBLE_DURATION, FLIP_DURATION } from './constants.js?v=30';

const pendingCharUpdates = new Map();
let pendingCharFrame = null;

function scheduler() {
  return window.__kalshiBoardScheduler || null;
}

function scheduleTimeout(callback, delay) {
  return scheduler()?.setTimeout(callback, delay) ?? setTimeout(callback, delay);
}

function cancelTimeout(id) {
  const activeScheduler = scheduler();
  if (activeScheduler) {
    activeScheduler.clearTimeout(id);
  } else {
    clearTimeout(id);
  }
}

function scheduleFrame(callback) {
  if (scheduler()) {
    return scheduleTimeout(callback, 16);
  }

  return requestAnimationFrame(callback);
}

function flushCharUpdates() {
  const updates = [...pendingCharUpdates.entries()];
  pendingCharUpdates.clear();
  pendingCharFrame = null;

  for (const [span, char] of updates) {
    if (span.dataset.char === char) continue;
    span.textContent = char;
    span.dataset.char = char;
  }
}

function queueSpanChar(span, char) {
  pendingCharUpdates.set(span, char);

  if (pendingCharFrame === null) {
    pendingCharFrame = scheduleFrame(flushCharUpdates);
  }
}

export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.isAnimating = false;
    this._animationToken = 0;
    this._delayTimer = null;
    this._scrambleTimer = null;
    this._settleTimer = null;

    // Build DOM
    this.el = document.createElement('div');
    this.el.className = 'tile';

    this.innerEl = document.createElement('div');
    this.innerEl.className = 'tile-inner';

    this.frontEl = document.createElement('div');
    this.frontEl.className = 'tile-front';
    this.frontSpan = document.createElement('span');
    this.frontEl.appendChild(this.frontSpan);

    this.backEl = document.createElement('div');
    this.backEl.className = 'tile-back';
    this.backSpan = document.createElement('span');
    this.backEl.appendChild(this.backSpan);

    this.innerEl.appendChild(this.frontEl);
    this.innerEl.appendChild(this.backEl);
    this.el.appendChild(this.innerEl);
  }

  _setSpanChar(span, char) {
    const visibleChar = char === ' ' ? '' : char;
    queueSpanChar(span, visibleChar);
  }

  setChar(char, tone = '') {
    this._clearTimers();
    this.currentChar = char;
    this._setSpanChar(this.frontSpan, char);
    this._setSpanChar(this.backSpan, ' ');
    this.frontEl.style.background = '';
    this.setTone(tone);
  }

  setTone(tone = '') {
    this.el.dataset.tone = tone;
  }

  scrambleTo(targetChar, delay, tone = '') {
    if (targetChar === this.currentChar && tone === (this.el.dataset.tone || '')) return;

    this._clearTimers();
    this.isAnimating = true;
    const animationToken = ++this._animationToken;

    this._delayTimer = scheduleTimeout(() => {
      if (animationToken !== this._animationToken) return;
      this._delayTimer = null;
      this.el.classList.add('scrambling');
      let scrambleCount = 0;
      const maxScrambles = 6 + Math.floor(Math.random() * 3);
      const scrambleInterval = Math.max(64, Math.floor(SCRAMBLE_DURATION / maxScrambles));
      const scrambleFrames = Array.from({ length: maxScrambles }, () =>
        CHARSET[Math.floor(Math.random() * CHARSET.length)]
      );

      const runScrambleStep = () => {
        if (animationToken !== this._animationToken) {
          this._clearTimers();
          return;
        }

        this._setSpanChar(this.frontSpan, scrambleFrames[scrambleCount]);
        scrambleCount++;

        if (scrambleCount >= maxScrambles) {
          this._scrambleTimer = null;

          // Set the final character directly (skip 3D flip for reliability)
          // Use a brief opacity flash to simulate the flip settle
          this._setSpanChar(this.frontSpan, targetChar);

          // Quick flash effect: brief scale transform
          this.innerEl.style.transition = `transform ${FLIP_DURATION}ms ease-in-out`;
          this.innerEl.style.transform = 'perspective(400px) rotateX(-8deg)';

          this._settleTimer = scheduleTimeout(() => {
            if (animationToken !== this._animationToken) return;
            this._settleTimer = null;
            this.innerEl.style.transform = '';
            this._settleTimer = scheduleTimeout(() => {
              if (animationToken !== this._animationToken) return;
              this._settleTimer = null;
              this.innerEl.style.transition = '';
              this.setTone(tone);
              this.el.classList.remove('scrambling');
              this.currentChar = targetChar;
              this.isAnimating = false;
            }, FLIP_DURATION);
          }, FLIP_DURATION / 2);
          return;
        }

        this._scrambleTimer = scheduleTimeout(runScrambleStep, scrambleInterval);
      };

      this._scrambleTimer = scheduleTimeout(runScrambleStep, 0);
    }, delay);
  }

  applyImmediately(targetChar, tone = '') {
    this._clearTimers();
    this.currentChar = targetChar;
    this._setSpanChar(this.frontSpan, targetChar);
    this._setSpanChar(this.backSpan, ' ');
    this.frontEl.style.background = '';
    this.frontSpan.style.color = '';
    this.setTone(tone);
  }

  _clearTimers() {
    this._animationToken++;

    if (this._delayTimer) {
      cancelTimeout(this._delayTimer);
      this._delayTimer = null;
    }

    if (this._scrambleTimer) {
      cancelTimeout(this._scrambleTimer);
      this._scrambleTimer = null;
    }

    if (this._settleTimer) {
      cancelTimeout(this._settleTimer);
      this._settleTimer = null;
    }

    this.el.classList.remove('scrambling');
    this.frontEl.style.background = '';
    this.frontSpan.style.color = '';
    this.innerEl.style.transform = '';
    this.innerEl.style.transition = '';
    this.isAnimating = false;
  }
}
