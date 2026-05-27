import { Board } from './Board.js?v=26';
import { SoundEngine } from './SoundEngine.js?v=26';
import { KeyboardController } from './KeyboardController.js?v=26';
import { runKalshiRotation } from './KalshiFeed.js?v=26';

const params = new URLSearchParams(window.location.search);
const IS_SCREENSAVER = params.get('screensaver') === '1';
const selectedTheme = params.get('theme') === 'light' ? 'light' : 'dark';
const UNAVAILABLE_MESSAGE = [
  '',
  '',
  '',
  'KALSHI MARKETS',
  'UNAVAILABLE',
  '',
  'TRY AGAIN LATER'
];

function applyTheme(theme) {
  const normalizedTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
}

function filterParam(name) {
  const value = (params.get(name) || '').trim();
  return value === 'All Subcategories' || value === 'All Categories' ? '' : value;
}

applyTheme(selectedTheme);
window.__kalshiBoardApplyTheme = applyTheme;

if (IS_SCREENSAVER && !window.__kalshiBoardScheduler) {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();

  const scheduler = {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, {
        callback,
        delay: Math.max(0, delay),
        due: currentTime + Math.max(0, delay),
        repeat: false
      });
      return id;
    },

    clearTimeout(id) {
      timers.delete(id);
    },

    setInterval(callback, delay) {
      const interval = Math.max(1, delay);
      const id = nextId++;
      timers.set(id, {
        callback,
        delay: interval,
        due: currentTime + interval,
        repeat: true
      });
      return id;
    },

    clearInterval(id) {
      timers.delete(id);
    },

    tick(timestamp) {
      currentTime = Math.max(currentTime + 16.667, Number(timestamp) || 0);
      const dueTimers = [...timers.entries()]
        .filter(([, timer]) => timer.due <= currentTime)
        .sort((a, b) => a[1].due - b[1].due);

      for (const [id, timer] of dueTimers) {
        if (!timers.has(id)) continue;

        if (timer.repeat) {
          timer.due = currentTime + timer.delay;
        } else {
          timers.delete(id);
        }

        timer.callback();
      }
    }
  };

  window.__kalshiBoardScheduler = scheduler;
  window.__kalshiBoardNativeFrame = (timestamp) => scheduler.tick(timestamp);
}

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const soundEngine = new SoundEngine();
  applyTheme(selectedTheme);
  const board = new Board(boardContainer, soundEngine, {
    cols: params.get('cols'),
    rows: params.get('rows')
  });
  const marketFilters = {
    category: filterParam('category'),
    competition: filterParam('competition')
  };
  new KeyboardController(soundEngine);

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    soundEngine.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  runKalshiRotation(board, marketFilters).catch(error => {
    console.error(error);
    board.displayMessage(UNAVAILABLE_MESSAGE);
  });
});
