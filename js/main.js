import { Board } from './Board.js?v=15';
import { SoundEngine } from './SoundEngine.js?v=15';
import { KeyboardController } from './KeyboardController.js?v=15';
import { GRID_COLS, GRID_ROWS } from './constants.js?v=15';
import { runKalshiRotation } from './KalshiFeed.js?v=15';

const STORAGE_KEY = 'kalshiboard.message';
const SAMPLE_MESSAGE = 'TOP VOLUME\nKALSHI MARKETS\nLIVE ODDS\nAUTO ROTATION';
const UNAVAILABLE_MESSAGE = [
  '',
  '',
  '',
  'KALSHI MARKETS',
  'UNAVAILABLE',
  '',
  'TRY AGAIN LATER'
];

function normalizeBoardText(value) {
  const cleaned = value
    .replace(/[^\w\s.,\-!?'\/:%&+]/g, ' ')
    .replace(/_/g, ' ')
    .toUpperCase();

  const sourceLines = cleaned
    .split(/\n/)
    .flatMap(line => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [''];

      const lines = [];
      let current = '';

      words.forEach(word => {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= GRID_COLS) {
          current = next;
          return;
        }

        if (current) lines.push(current);

        if (word.length <= GRID_COLS) {
          current = word;
          return;
        }

        for (let i = 0; i < word.length; i += GRID_COLS) {
          lines.push(word.slice(i, i + GRID_COLS));
        }
        current = '';
      });

      if (current) lines.push(current);
      return lines;
    })
    .slice(0, GRID_ROWS);

  while (sourceLines.length < GRID_ROWS) {
    sourceLines.unshift('');
    if (sourceLines.length < GRID_ROWS) sourceLines.push('');
  }

  return sourceLines.slice(0, GRID_ROWS);
}

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const settingsPanel = document.getElementById('settings-panel');
  const panelToggle = document.getElementById('panel-toggle');
  const closePanelBtn = document.getElementById('close-panel-btn');
  const settingsForm = document.getElementById('settings-form');
  const messageInput = document.getElementById('message-input');
  const sampleBtn = document.getElementById('sample-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const volumeBtn = document.getElementById('volume-btn');
  const soundEngine = new SoundEngine();
  const board = new Board(boardContainer, soundEngine);
  new KeyboardController(soundEngine);

  const savedMessage = localStorage.getItem(STORAGE_KEY);
  if (savedMessage) {
    messageInput.value = savedMessage;
  }

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

  const setPanelOpen = (open) => {
    settingsPanel.classList.toggle('is-closed', !open);
    panelToggle.classList.toggle('is-visible', !open);
    panelToggle.setAttribute('aria-expanded', String(open));
  };

  setPanelOpen(false);

  const applyMessage = (value) => {
    localStorage.setItem(STORAGE_KEY, value);
    board.displayMessage(normalizeBoardText(value));
  };

  runKalshiRotation(board).catch(error => {
    console.error(error);
    board.displayMessage(UNAVAILABLE_MESSAGE);
  });

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    initAudio();
    applyMessage(messageInput.value);
  });

  messageInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      initAudio();
      applyMessage(messageInput.value);
    }
  });

  sampleBtn.addEventListener('click', () => {
    initAudio();
    messageInput.value = SAMPLE_MESSAGE;
    applyMessage(messageInput.value);
  });

  panelToggle.addEventListener('click', () => setPanelOpen(true));
  closePanelBtn.addEventListener('click', () => setPanelOpen(false));

  fullscreenBtn.addEventListener('click', () => {
    initAudio();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      initAudio();
      const muted = soundEngine.toggleMute();
      volumeBtn.classList.toggle('is-muted', muted);
    });
  }
});
