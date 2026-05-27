import { GRID_COLS, GRID_ROWS } from './constants.js?v=30';

const API_BASE = '/api/kalshi';
const MARKET_LIMIT = 500;
const MAX_MARKET_PAGES = 1;
const ROTATION_LIMIT = 12;
const EVENT_SUMMARY_BATCH_SIZE = 12;
const HOLD_MS = 3000;
const REFRESH_AFTER_MS = 5 * 60 * 1000;
const EMPTY_FILTER_RETRY_MS = 60 * 1000;
const ACTIVE_MARKET_STATUSES = new Set(['active', 'open']);
const NO_FILTER_MARKETS_MESSAGE = [
  '',
  '',
  '',
  'NO MARKETS',
  '',
  'FOR FILTER',
  ''
];

function wait(ms) {
  return new Promise(resolve => {
    const scheduler = window.__kalshiBoardScheduler;
    if (scheduler) {
      scheduler.setTimeout(resolve, ms);
      return;
    }

    setTimeout(resolve, ms);
  });
}

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function toCents(value) {
  return Math.round(toNumber(value) * 100);
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/[^\w\s.,\-!?'/:&+%]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function marketTitle(market) {
  return sanitizeText(market.display_title);
}

function wrapTitle(text, cols, maxLines = 2) {
  const words = sanitizeText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= cols) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word.length <= cols ? word : word.slice(0, cols);

    if (lines.length >= maxLines) {
      return lines.slice(0, maxLines);
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

function blankGrid(cols, rows) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ char: ' ', tone: '' }))
  );
}

function writeCentered(grid, row, text, cols, tone = '') {
  if (!grid[row]) return;

  const clean = sanitizeText(text).slice(0, cols);
  const start = Math.max(0, Math.floor((cols - clean.length) / 2));

  for (let index = 0; index < clean.length; index++) {
    grid[row][start + index] = { char: clean[index], tone };
  }
}

function writeMarketBar(grid, row, yesProbability, cols) {
  if (!grid[row]) return;

  const segments = Math.min(20, Math.max(8, cols - 4));
  const startCol = Math.max(0, Math.floor((cols - segments) / 2));
  const yesSegments = Math.max(0, Math.min(segments, Math.round(yesProbability * segments)));

  for (let index = 0; index < segments; index++) {
    const isYes = index < yesSegments;
    grid[row][startCol + index] = {
      char: ' ',
      tone: isYes ? 'yes' : 'no'
    };
  }
}

function midpointCents(bid, ask, fallback) {
  const bidCents = toCents(bid);
  const askCents = toCents(ask);

  if (bidCents > 0 && askCents > 0) {
    return Math.round((bidCents + askCents) / 2);
  }

  if (askCents > 0) return askCents;
  if (bidCents > 0) return bidCents;
  return toCents(fallback);
}

function hasTradableYesNoPrice(market) {
  return [
    market.yes_bid_dollars,
    market.yes_ask_dollars,
    market.no_bid_dollars,
    market.no_ask_dollars,
    market.last_price_dollars
  ].some(value => toNumber(value) > 0);
}

function isActiveBinaryMarket(market) {
  const status = String(market.status || '').toLowerCase();
  return market.market_type === 'binary'
    && (!status || ACTIVE_MARKET_STATUSES.has(status))
    && hasTradableYesNoPrice(market);
}

function compareMarketVolume(a, b) {
  const by24h = toNumber(b.volume_24h_fp) - toNumber(a.volume_24h_fp);
  if (by24h !== 0) return by24h;
  return toNumber(b.volume_fp) - toNumber(a.volume_fp);
}

function hasVolume(market) {
  return toNumber(market.volume_fp) > 0 || toNumber(market.volume_24h_fp) > 0;
}

export function isDisplayableBinaryMarket(market) {
  return isActiveBinaryMarket(market) && hasVolume(market) && Boolean(sanitizeText(market.title));
}

function hasEventTitle(market) {
  return Boolean(sanitizeText(market.display_title));
}

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

export function marketMatchesFilters(market, filters = {}) {
  const category = normalizeFilterValue(filters.category);
  const competition = normalizeFilterValue(filters.competition);
  const tags = Array.isArray(market.series_tags) ? market.series_tags.map(normalizeFilterValue) : [];

  if (category && normalizeFilterValue(market.category) !== category) {
    return false;
  }

  if (
    competition
    && normalizeFilterValue(market.competition) !== competition
    && !tags.includes(competition)
  ) {
    return false;
  }

  return true;
}

function marketCategoryLabel(market) {
  return sanitizeText(market.category);
}

function formatExpirationDate(market) {
  const rawDate = market.expected_expiration_time || market.expiration_time || market.close_time;
  const date = rawDate ? new Date(rawDate) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function displayTitleFromEvent(event) {
  const title = String(event?.title || '').trim();
  const scope = String(event?.product_metadata?.competition_scope || '').trim();

  if (title && scope && title.endsWith(`: ${scope}`)) {
    return title.slice(0, -scope.length - 2).trim();
  }

  return title;
}

async function fetchEventSummary(eventTicker) {
  const response = await fetch(`${API_BASE}/events/${encodeURIComponent(eventTicker)}`);

  if (!response.ok) {
    throw new Error(`Kalshi event request failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    category: data.event?.category || '',
    competition: data.event?.product_metadata?.competition || '',
    display_title: displayTitleFromEvent(data.event),
    event_title: data.event?.title || '',
    market_category: data.event?.product_metadata?.competition_scope || '',
    series_ticker: data.event?.series_ticker || ''
  };
}

async function fetchSeriesSummary(seriesTicker) {
  const response = await fetch(`${API_BASE}/series/${encodeURIComponent(seriesTicker)}`);

  if (!response.ok) {
    throw new Error(`Kalshi series request failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    series_tags: Array.isArray(data.series?.tags) ? data.series.tags : []
  };
}

async function addEventSummaries(markets, filters = {}) {
  const eventSummaryCache = new Map();
  const seriesSummaryCache = new Map();
  const needsSeriesTags = Boolean(normalizeFilterValue(filters.competition));

  return Promise.all(markets.map(async market => {
    if (!market.event_ticker) {
      return market;
    }

    if (!eventSummaryCache.has(market.event_ticker)) {
      eventSummaryCache.set(market.event_ticker, fetchEventSummary(market.event_ticker).catch(() => null));
    }

    const summary = await eventSummaryCache.get(market.event_ticker);
    let seriesSummary = null;

    if (needsSeriesTags && summary?.series_ticker) {
      if (!seriesSummaryCache.has(summary.series_ticker)) {
        seriesSummaryCache.set(summary.series_ticker, fetchSeriesSummary(summary.series_ticker).catch(() => null));
      }

      seriesSummary = await seriesSummaryCache.get(summary.series_ticker);
    }

    return {
      ...market,
      category: summary?.category || '',
      competition: summary?.competition || '',
      display_title: summary?.display_title || '',
      event_title: summary?.event_title || '',
      market_category: summary?.market_category || '',
      series_tags: seriesSummary?.series_tags || [],
      series_ticker: summary?.series_ticker || market.series_ticker || ''
    };
  }));
}

async function collectDisplayMarkets(candidates, filters) {
  const accepted = [];

  for (let index = 0; index < candidates.length && accepted.length < ROTATION_LIMIT; index += EVENT_SUMMARY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + EVENT_SUMMARY_BATCH_SIZE);
    const marketsWithEventTitles = await addEventSummaries(batch, filters);

    for (const market of marketsWithEventTitles) {
      if (hasEventTitle(market) && marketMatchesFilters(market, filters)) {
        accepted.push(market);
      }

      if (accepted.length >= ROTATION_LIMIT) {
        break;
      }
    }
  }

  return accepted;
}

export function buildMarketFrame(market, options = {}) {
  const cols = options.cols || GRID_COLS;
  const rows = options.rows || GRID_ROWS;
  const grid = blankGrid(cols, rows);
  const yesCents = midpointCents(market.yes_bid_dollars, market.yes_ask_dollars, market.last_price_dollars);
  const noCents = Math.max(0, Math.min(100, 100 - yesCents));
  const yesProbability = yesCents / 100;
  const categoryLabel = marketCategoryLabel(market);
  const expirationDate = formatExpirationDate(market);

  const layout = rows <= 6
    ? { titleStart: 0, expirationRow: 2, priceRow: 3, barRow: 4, volumeRow: 5 }
    : { titleStart: 1, expirationRow: 3, priceRow: Math.floor(rows * 0.45), barRow: Math.floor(rows * 0.55), volumeRow: rows - 2 };

  wrapTitle(marketTitle(market), cols).forEach((line, index) => {
    writeCentered(grid, layout.titleStart + index, line, cols);
  });
  writeCentered(grid, layout.expirationRow, expirationDate, cols);
  writeCentered(grid, layout.priceRow, `YES ${yesCents}C   NO ${noCents}C`, cols);
  writeMarketBar(grid, layout.barRow, yesProbability, cols);
  writeCentered(grid, layout.volumeRow, categoryLabel, cols);

  return { cells: grid };
}

export async function fetchTopMarkets(filters = {}) {
  const markets = [];
  let cursor = '';

  for (let page = 0; page < MAX_MARKET_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(MARKET_LIMIT),
      status: 'open',
      mve_filter: 'exclude'
    });

    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`${API_BASE}/markets?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Kalshi markets request failed: ${response.status}`);
    }

    const data = await response.json();
    markets.push(...(data.markets || []));
    cursor = data.cursor || '';

    if (!cursor) break;
  }

  const candidates = markets
    .filter(isDisplayableBinaryMarket)
    .sort(compareMarketVolume);

  return collectDisplayMarkets(candidates, filters);
}

export async function runKalshiRotation(board, filters = {}) {
  let markets = [];
  let lastRefresh = 0;

  while (true) {
    if (!markets.length || Date.now() - lastRefresh > REFRESH_AFTER_MS) {
      board.displayMessage(['', '', '', '', 'LOADING KALSHI', '', 'TOP VOLUME MARKETS']);
      markets = await fetchTopMarkets(filters);
      if (!markets.length) {
        board.displayMessage(NO_FILTER_MARKETS_MESSAGE);
        await wait(EMPTY_FILTER_RETRY_MS);
        continue;
      }
      lastRefresh = Date.now();
    }

    for (const market of markets) {
      const frame = buildMarketFrame(market, { cols: board.cols, rows: board.rows });
      board.displayCells(frame.cells);
      await wait(board.transitionDuration() + HOLD_MS + 200);
    }
  }
}
