import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextQuote, QUOTE_EVERY_MS, type Quote, readQuote, readState, summarize, WIDGET_ORIGIN, widgetUrl } from './chart.ts'

// The plugin's pure half: the state a panel holds read the forgiving way, the widget's address,
// the quotes the widget posts, how often one is published, and the line the model's map carries.

/** A quoteUpdate exactly as the widget posted it to the view's page. */
const QUOTE_UPDATE = {
  id: 0,
  type: 'post',
  name: 'quoteUpdate',
  client_id: '',
  data: {
    change: 5.7,
    change_percent: 1.75,
    last_price: 332.27,
    original_name: 'BATS_DLY:AAPL',
    short_name: 'AAPL',
    exchange: 'Cboe One',
    description: 'Apple Inc.',
    volume: 50716865,
  },
  provider: 'TradingView',
}

const AAPL: Quote = { name: 'AAPL', exchange: 'Cboe One', description: 'Apple Inc.', last: 332.27, change: 5.7, changePercent: 1.75, volume: 50716865 }

test('state reads with its defaults, the symbol written the way TradingView writes it', () => {
  assert.deepEqual(readState({ symbol: ' nasdaq:aapl ' }), { symbol: 'NASDAQ:AAPL', interval: 'D', style: 'candles', studies: [] })
  assert.deepEqual(readState({ symbol: 'AMEX:SPY', interval: 'W', range: '3M', style: 'line', studies: ['rsi', 'macd'] }), {
    symbol: 'AMEX:SPY',
    interval: 'W',
    range: '3M',
    style: 'line',
    studies: ['rsi', 'macd'],
  })
})

test('state the widget would not understand falls back rather than reaching it', () => {
  assert.deepEqual(readState({ symbol: 'AAPL', interval: '2h', range: 'forever', style: 'renko', studies: ['rsi', 'ichimoku', 'rsi', 7] }), {
    symbol: 'AAPL',
    interval: 'D',
    style: 'candles',
    studies: ['rsi'],
  })
  assert.deepEqual(readState(undefined), { symbol: '', interval: 'D', style: 'candles', studies: [] })
})

test('a range set to null is cleared, and studies stop at the most a chart takes', () => {
  assert.deepEqual(readState({ symbol: 'AAPL', interval: '60', range: null }), { symbol: 'AAPL', interval: '60', style: 'candles', studies: [] })
  const six = readState({ symbol: 'AAPL', studies: ['rsi', 'macd', 'sma', 'ema', 'vwap', 'bollinger-bands'] }).studies
  assert.deepEqual(six, ['rsi', 'macd', 'sma', 'ema', 'vwap'])
})

test('the widget address is the advanced chart page with the chart in its hash', () => {
  const url = new URL(widgetUrl({ symbol: 'NASDAQ:AAPL', interval: 'D', style: 'candles', studies: [] }))
  assert.equal(url.origin, WIDGET_ORIGIN)
  assert.equal(url.pathname, '/embed-widget/advanced-chart/')
  assert.equal(url.search, '?locale=en')
  assert.deepEqual(JSON.parse(decodeURIComponent(url.hash.slice(1))), {
    symbol: 'NASDAQ:AAPL',
    interval: 'D',
    style: '1',
    studies: [],
    theme: 'light',
    autosize: true,
    allow_symbol_change: true,
    support_host: 'https://www.tradingview.com',
    'page-uri': '__NHTTP__',
  })
})

test('a range, a style, and studies go to the widget by the names it knows them by', () => {
  const url = new URL(widgetUrl({ symbol: 'AMEX:SPY', interval: 'W', range: '3M', style: 'heikin-ashi', studies: ['bollinger-bands', 'vwap'] }))
  const chart = JSON.parse(decodeURIComponent(url.hash.slice(1)))
  assert.equal(chart.range, '3M')
  assert.equal(chart.style, '8')
  assert.deepEqual(chart.studies, ['STD;Bollinger_Bands', 'STD;VWAP'])
})

test('a quoteUpdate reads as a quote, posted as an object or as JSON', () => {
  assert.deepEqual(readQuote(QUOTE_UPDATE), AAPL)
  assert.deepEqual(readQuote(JSON.stringify(QUOTE_UPDATE)), AAPL)
  assert.deepEqual(readQuote({ name: 'quoteUpdate', data: { short_name: 'MSFT', last_price: 495.84 } }), { name: 'MSFT', last: 495.84 })
})

test('anything else the widget posts is not a quote', () => {
  assert.equal(readQuote({ name: 'tv-widget-load', frameElementId: null }), null)
  assert.equal(readQuote('{not json'), null)
  assert.equal(readQuote({ name: 'quoteUpdate', data: { short_name: 'AAPL' } }), null)
  assert.equal(readQuote({ name: 'quoteUpdate', data: { short_name: 'AAPL', last_price: 'n/a' } }), null)
  assert.equal(readQuote({ name: 'quoteUpdate', data: { last_price: 332.27 } }), null)
  assert.equal(readQuote(null), null)
})

test('a new symbol publishes at once, and a moving price at most every interval', () => {
  const moved = { ...AAPL, last: 332.5 }
  assert.equal(nextQuote(null, 0, null, 1000), null)
  assert.deepEqual(nextQuote(null, 0, AAPL, 1000), AAPL)
  assert.equal(nextQuote(AAPL, 1000, moved, 1000 + QUOTE_EVERY_MS - 1), null)
  assert.deepEqual(nextQuote(AAPL, 1000, moved, 1000 + QUOTE_EVERY_MS), moved)
  assert.equal(nextQuote(AAPL, 1000, { ...AAPL }, 1000 + QUOTE_EVERY_MS), null)
  const msft = { name: 'MSFT', last: 495.84 }
  assert.deepEqual(nextQuote(AAPL, 1000, msft, 1001), msft)
})

test('the summary names the symbol, its price once there is one, and how it is drawn', () => {
  assert.equal(summarize({ symbol: 'nasdaq:aapl' }, {}), 'Chart: NASDAQ:AAPL, D, candles')
  assert.equal(summarize({ symbol: 'NASDAQ:AAPL', range: '3M', style: 'line', studies: ['rsi'] }, { quote: AAPL }), 'Chart: AAPL 332.27 +1.75%, 3M, line, rsi')
  assert.equal(summarize({ symbol: 'NASDAQ:MSFT' }, { quote: { name: 'MSFT', last: 495.84, changePercent: -0.194 } }), 'Chart: MSFT 495.84 -0.19%, D, candles')
  assert.equal(summarize({ symbol: 'NASDAQ:MSFT' }, { quote: { name: 'MSFT', last: 495.84 } }), 'Chart: MSFT 495.84, D, candles')
})
