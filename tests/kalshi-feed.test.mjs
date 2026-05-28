import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarketFrame, isDisplayableBinaryMarket, marketMatchesFilters } from '../js/KalshiFeed.js';

const baseMarket = {
  event_ticker: 'KXTEST-26MAY',
  market_type: 'binary',
  status: 'active',
  ticker: 'KXTEST-26MAY',
  display_title: 'Test market',
  category: 'Sports',
  competition: 'Pro Baseball',
  series_tags: ['Baseball'],
  event_title: 'Test market: Example category',
  market_category: 'Example category',
  title: 'Will the test market resolve to yes?',
  yes_sub_title: 'YES',
  yes_bid_dollars: '0.4100',
  yes_ask_dollars: '0.4300',
  no_bid_dollars: '0.5700',
  no_ask_dollars: '0.5900',
  last_price_dollars: '0.4200',
  expected_expiration_time: '2026-05-29T12:00:00Z',
  volume_fp: '100.00',
  volume_24h_fp: '50.00'
};

test('accepts an active binary market with volume and a title', () => {
  assert.equal(isDisplayableBinaryMarket(baseMarket), true);
});

test('rejects non-binary markets', () => {
  const multivariateMarket = {
    ...baseMarket,
    market_type: 'scalar'
  };

  assert.equal(isDisplayableBinaryMarket(multivariateMarket), false);
});

test('rejects binary markets without volume', () => {
  const noVolumeMarket = {
    ...baseMarket,
    volume_fp: '0.00',
    volume_24h_fp: '0.00'
  };

  assert.equal(isDisplayableBinaryMarket(noVolumeMarket), false);
});

test('renders the display title instead of the event category or contract option title', () => {
  const frame = buildMarketFrame({
    ...baseMarket,
    display_title: 'Congress budget vote',
    event_title: 'Congress budget vote',
    market_category: 'Passage',
    title: 'Will congress pass the budget?',
    yes_sub_title: 'PASS'
  }, { cols: 30, rows: 10 });
  const renderedText = frame.cells
    .map(row => row.map(cell => cell.char).join('').trim())
    .filter(Boolean)
    .join(' ');

  assert.match(renderedText, /CONGRESS BUDGET VOTE/);
  assert.doesNotMatch(renderedText, /WILL CONGRESS PASS THE BUDGET/);
  assert.doesNotMatch(renderedText, /PASSAGE/);
  assert.doesNotMatch(renderedText, /^PASS$/);
});

test('renders category metadata instead of volume stats', () => {
  const frame = buildMarketFrame(baseMarket, { cols: 30, rows: 10 });
  const renderedText = frame.cells
    .map(row => row.map(cell => cell.char).join('').trim())
    .filter(Boolean)
    .join(' ');

  assert.match(renderedText, /SPORTS/);
  assert.doesNotMatch(renderedText, /PRO BASEBALL/);
  assert.doesNotMatch(renderedText, /EXAMPLE/);
  assert.doesNotMatch(renderedText, /VOL/);
  assert.doesNotMatch(renderedText, /24H/);
});

test('renders the market expiration date below the title', () => {
  const frame = buildMarketFrame(baseMarket, { cols: 30, rows: 10 });
  const rows = frame.cells
    .map(row => row.map(cell => cell.char).join('').trim())
    .filter(Boolean);

  assert.deepEqual(rows.slice(0, 2), ['TEST MARKET', '29/05']);
});

test('falls back to expiration time when expected expiration is missing', () => {
  const frame = buildMarketFrame({
    ...baseMarket,
    expected_expiration_time: '',
    expiration_time: '2026-06-03T00:00:00Z'
  }, { cols: 30, rows: 10 });
  const rows = frame.cells
    .map(row => row.map(cell => cell.char).join('').trim())
    .filter(Boolean);

  assert.equal(rows[1], '03/06');
});

test('matches category and competition filters independently', () => {
  assert.equal(marketMatchesFilters(baseMarket, { category: 'Sports' }), true);
  assert.equal(marketMatchesFilters(baseMarket, { category: 'Sports', competition: 'Pro Baseball' }), true);
  assert.equal(marketMatchesFilters(baseMarket, { category: 'Sports', competition: 'Baseball' }), true);
  assert.equal(marketMatchesFilters(baseMarket, { category: 'Sports', competition: 'CS2' }), false);
  assert.equal(marketMatchesFilters(baseMarket, { category: 'Politics' }), false);
});
