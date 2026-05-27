import { CHARSET, SCRAMBLE_COLORS, SCRAMBLE_DURATION, FLIP_DURATION } from './constants.js?v=16';

export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.isAnimating = false;
    this._animationToken = 0;
    this._delayTimer = null;
    this._scrambleTimer = null;

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
    span.textContent = visibleChar;
    span.dataset.char = visibleChar;
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

    this._delayTimer = setTimeout(() => {
      if (animationToken !== this._animationToken) return;
      this._delayTimer = null;
      this.el.classList.add('scrambling');
      let scrambleCount = 0;
      const maxScrambles = 10 + Math.floor(Math.random() * 4);
      const scrambleInterval = 70;

      this._scrambleTimer = setInterval(() => {
        if (animationToken !== this._animationToken) {
          this._clearTimers();
          return;
        }

        // Random character
        const randChar = CHARSET[Math.floor(Math.random() * CHARSET.length)];
        this._setSpanChar(this.frontSpan, randChar);

        // Cycle background color
        const color = SCRAMBLE_COLORS[scrambleCount % SCRAMBLE_COLORS.length];
        this.frontEl.style.background = color;

        // Briefly change text color for contrast on light backgrounds
        if (color === '#FFFFFF' || color === '#FFCC00') {
          this.frontSpan.style.color = '#111';
        } else {
          this.frontSpan.style.color = '';
        }

        scrambleCount++;

        if (scrambleCount >= maxScrambles) {
          clearInterval(this._scrambleTimer);
          this._scrambleTimer = null;

          // Reset colors
          this.frontEl.style.background = '';
          this.frontSpan.style.color = '';

          // Set the final character directly (skip 3D flip for reliability)
          // Use a brief opacity flash to simulate the flip settle
          this._setSpanChar(this.frontSpan, targetChar);

          // Quick flash effect: brief scale transform
          this.innerEl.style.transition = `transform ${FLIP_DURATION}ms ease-in-out`;
          this.innerEl.style.transform = 'perspective(400px) rotateX(-8deg)';

          setTimeout(() => {
            if (animationToken !== this._animationToken) return;
            this.innerEl.style.transform = '';
            setTimeout(() => {
              if (animationToken !== this._animationToken) return;
              this.innerEl.style.transition = '';
              this.setTone(tone);
              this.el.classList.remove('scrambling');
              this.currentChar = targetChar;
              this.isAnimating = false;
            }, FLIP_DURATION);
          }, FLIP_DURATION / 2);
        }
      }, scrambleInterval);
    }, delay);
  }

  _clearTimers() {
    this._animationToken++;

    if (this._delayTimer) {
      clearTimeout(this._delayTimer);
      this._delayTimer = null;
    }

    if (this._scrambleTimer) {
      clearInterval(this._scrambleTimer);
      this._scrambleTimer = null;
    }

    this.el.classList.remove('scrambling');
    this.frontEl.style.background = '';
    this.frontSpan.style.color = '';
    this.innerEl.style.transform = '';
    this.innerEl.style.transition = '';
    this.isAnimating = false;
  }
}
