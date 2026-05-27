import { Board } from './Board.js?v=31';
import { SoundEngine } from './SoundEngine.js?v=31';
import { KeyboardController } from './KeyboardController.js?v=31';
import { runKalshiRotation } from './KalshiFeed.js?v=31';
import {
  BOARD_SIZE_PRESETS,
  CATEGORY_OPTIONS,
  THEME_OPTIONS,
  boardPresetForSize,
  categoryOptionForId,
  optionsFromParams,
  writeStoredOptions
} from './options.js?v=31';

const params = new URLSearchParams(window.location.search);
const IS_SCREENSAVER = params.get('screensaver') === '1';
const selectedOptions = optionsFromParams(params);
const selectedPreset = boardPresetForSize(selectedOptions.size);
const selectedTheme = selectedOptions.theme;
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

function populateSelect(select, options, selectedValue) {
  select.replaceChildren();

  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.title;
    select.appendChild(element);
  }

  select.value = selectedValue;
}

function populateCompetitionSelect(select, category, selectedCompetition) {
  const categoryOption = categoryOptionForId(category);
  populateSelect(select, [
    { id: '', title: 'All Subcategories' },
    ...categoryOption.competitions.map(competition => ({ id: competition, title: competition }))
  ], selectedCompetition);
}

function buildWebOptionsPanel() {
  if (IS_SCREENSAVER) return;

  const toggle = document.createElement('button');
  toggle.className = 'settings-toggle';
  toggle.type = 'button';
  toggle.title = 'Open options';
  toggle.setAttribute('aria-label', 'Open options');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'OPTIONS';

  const panel = document.createElement('aside');
  panel.className = 'settings-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="settings-panel__header">
      <h2>KalshiBoard Options</h2>
      <button class="settings-panel__close" type="button" aria-label="Close options">Close</button>
    </div>
    <label>
      <span>Board Size</span>
      <select data-setting="size"></select>
    </label>
    <label>
      <span>Background</span>
      <select data-setting="theme"></select>
    </label>
    <label>
      <span>Category</span>
      <select data-setting="category"></select>
    </label>
    <label>
      <span>Subcategory</span>
      <select data-setting="competition"></select>
    </label>
    <div class="settings-panel__actions">
      <button class="settings-panel__apply" type="button">Apply</button>
    </div>
  `;

  const sizeSelect = panel.querySelector('[data-setting="size"]');
  const themeSelect = panel.querySelector('[data-setting="theme"]');
  const categorySelect = panel.querySelector('[data-setting="category"]');
  const competitionSelect = panel.querySelector('[data-setting="competition"]');
  const closeButton = panel.querySelector('.settings-panel__close');
  const applyButton = panel.querySelector('.settings-panel__apply');

  populateSelect(sizeSelect, BOARD_SIZE_PRESETS, selectedOptions.size);
  populateSelect(themeSelect, THEME_OPTIONS, selectedOptions.theme);
  populateSelect(categorySelect, CATEGORY_OPTIONS, selectedOptions.category);
  populateCompetitionSelect(competitionSelect, selectedOptions.category, selectedOptions.competition);

  const setOpen = open => {
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  closeButton.addEventListener('click', () => setOpen(false));
  categorySelect.addEventListener('change', () => populateCompetitionSelect(competitionSelect, categorySelect.value, ''));
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  applyButton.addEventListener('click', () => {
    const options = {
      size: sizeSelect.value,
      theme: themeSelect.value,
      category: categorySelect.value,
      competition: competitionSelect.value
    };
    const preset = boardPresetForSize(options.size);
    writeStoredOptions(options);

    const nextParams = new URLSearchParams(window.location.search);
    nextParams.delete('screensaver');
    nextParams.set('size', preset.id);
    nextParams.set('cols', String(preset.cols));
    nextParams.set('rows', String(preset.rows));
    nextParams.set('theme', options.theme);

    if (options.category) {
      nextParams.set('category', options.category);
    } else {
      nextParams.delete('category');
    }

    if (options.competition) {
      nextParams.set('competition', options.competition);
    } else {
      nextParams.delete('competition');
    }

    window.location.search = nextParams.toString();
  });

  document.body.append(toggle, panel);
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
    cols: params.get('cols') || selectedPreset.cols,
    rows: params.get('rows') || selectedPreset.rows
  });
  const marketFilters = {
    category: filterParam('category') || selectedOptions.category,
    competition: filterParam('competition') || selectedOptions.competition
  };
  buildWebOptionsPanel();
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
