import { GRID_COLS, GRID_ROWS, TOTAL_TRANSITION } from './constants.js?v=7';

const API_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const MARKET_LIMIT = 1000;
const ROTATION_LIMIT = 12;
const HOLD_MS = 3000;
const REFRESH_AFTER_MS = 5 * 60 * 1000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function compactTitle(market) {
  const subtitle = sanitizeText(market.yes_sub_title || market.subtitle);
  const title = sanitizeText(market.title);

  if (subtitle && subtitle.length <= GRID_COLS && subtitle !== 'YES') {
    return subtitle;
  }

  return title.length <= GRID_COLS ? title : title.slice(0, GRID_COLS);
}

function blankGrid() {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({ char: ' ', tone: '' }))
  );
}

function writeCentered(grid, row, text, tone = '') {
  const clean = sanitizeText(text).slice(0, GRID_COLS);
  const start = Math.max(0, Math.floor((GRID_COLS - clean.length) / 2));

  for (let index = 0; index < clean.length; index++) {
    grid[row][start + index] = { char: clean[index], tone };
  }
}

function writeMarketBar(grid, row, yesProbability) {
  const segments = 20;
  const startCol = 1;
  const yesSegments = Math.max(0, Math.min(segments, Math.round(yesProbability * segments)));

  for (let index = 0; index < segments; index++) {
    const isYes = index < yesSegments;
    grid[row][startCol + index] = {
      char: isYes ? 'Y' : 'N',
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

function formatVolume(value) {
  const volume = toNumber(value);
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return String(Math.round(volume));
}

function marketLogoUrl(market, metadata) {
  const marketDetail = metadata?.market_details?.find(detail => detail.market_ticker === market.ticker);
  return marketDetail?.image_url || metadata?.image_url || metadata?.featured_image_url || null;
}

export function buildMarketFrame(market, metadata) {
  const grid = blankGrid();
  const yesCents = midpointCents(market.yes_bid_dollars, market.yes_ask_dollars, market.last_price_dollars);
  const noCents = Math.max(0, Math.min(100, 100 - yesCents));
  const yesProbability = yesCents / 100;
  const volume = formatVolume(market.volume_fp);
  const volume24h = formatVolume(market.volume_24h_fp);

  writeCentered(grid, 4, compactTitle(market));
  writeCentered(grid, 5, `YES ${yesCents}C   NO ${noCents}C`);
  writeMarketBar(grid, 6, yesProbability);
  writeCentered(grid, 7, `VOL ${volume} / 24H ${volume24h}`);

  return {
    cells: grid,
    logoUrl: marketLogoUrl(market, metadata)
  };
}

export async function fetchTopMarkets() {
  const url = `${API_BASE}/markets?limit=${MARKET_LIMIT}&status=open&mve_filter=exclude`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Kalshi markets request failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.markets || [])
    .filter(market => toNumber(market.volume_fp) > 0 || toNumber(market.volume_24h_fp) > 0)
    .sort((a, b) => {
      const by24h = toNumber(b.volume_24h_fp) - toNumber(a.volume_24h_fp);
      if (by24h !== 0) return by24h;
      return toNumber(b.volume_fp) - toNumber(a.volume_fp);
    })
    .slice(0, ROTATION_LIMIT);
}

export async function fetchEventMetadata(eventTicker) {
  const response = await fetch(`${API_BASE}/events/${eventTicker}/metadata`);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function runKalshiRotation(board) {
  const metadataCache = new Map();
  let markets = [];
  let lastRefresh = 0;

  while (true) {
    if (!markets.length || Date.now() - lastRefresh > REFRESH_AFTER_MS) {
      board.displayMessage(['', '', '', '', 'LOADING KALSHI', '', 'TOP VOLUME MARKETS']);
      markets = await fetchTopMarkets();
      lastRefresh = Date.now();
    }

    for (const market of markets) {
      if (!metadataCache.has(market.event_ticker)) {
        metadataCache.set(market.event_ticker, await fetchEventMetadata(market.event_ticker));
      }

      const frame = buildMarketFrame(market, metadataCache.get(market.event_ticker));
      board.displayCells(frame.cells, frame.logoUrl);
      await wait(TOTAL_TRANSITION + HOLD_MS + 200);
    }
  }
}
