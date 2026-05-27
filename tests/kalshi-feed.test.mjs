import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarketFrame, isDisplayableBinaryMarket } from '../js/KalshiFeed.js';

const baseMarket = {
  event_ticker: 'KXTEST-26MAY',
  market_type: 'binary',
  status: 'active',
  ticker: 'KXTEST-26MAY',
  title: 'Will the test market resolve to yes?',
  yes_sub_title: 'YES',
  yes_bid_dollars: '0.4100',
  yes_ask_dollars: '0.4300',
  no_bid_dollars: '0.5700',
  no_ask_dollars: '0.5900',
  last_price_dollars: '0.4200',
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

test('renders the full market title instead of a short yes subtitle', () => {
  const frame = buildMarketFrame({
    ...baseMarket,
    title: 'Will congress pass the budget?',
    yes_sub_title: 'PASS'
  }, { cols: 30, rows: 10 });
  const renderedText = frame.cells
    .map(row => row.map(cell => cell.char).join('').trim())
    .filter(Boolean)
    .join(' ');

  assert.match(renderedText, /WILL CONGRESS PASS THE BUDGET/);
  assert.doesNotMatch(renderedText, /^PASS$/);
});
