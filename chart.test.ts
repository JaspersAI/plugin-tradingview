import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyWidgetUpdate,
  isWidgetReady,
  MAX_COMPARE,
  nextQuote,
  QUOTE_EVERY_MS,
  type Quote,
  readQuote,
  readState,
  readSymbolInfo,
  resolveSymbol,
  resolveTimezone,
  type State,
  summarize,
  syncLiveChart,
  TIMEZONES,
  WIDGET_ORIGIN,
  widgetRequest,
  widgetUrl,
} from './chart.ts'
import { INSTRUCTIONS } from './instructions.ts'

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

test('an index, a future, or a commodity the user names in words resolves to the symbol TradingView charts', () => {
  assert.equal(resolveSymbol('S&P 500'), 'SP:SPX')
  assert.equal(resolveSymbol(' sp500 '), 'SP:SPX')
  assert.equal(resolveSymbol('spx'), 'SP:SPX')
  assert.equal(resolveSymbol('NASDAQ 100'), 'NASDAQ:NDX')
  assert.equal(resolveSymbol('dow'), 'DJ:DJI')
  assert.equal(resolveSymbol('D.J.I.A.'), 'DJ:DJI')
  assert.equal(resolveSymbol('Russell 2000'), 'TVC:RUT')
  assert.equal(resolveSymbol('vix'), 'CBOE:VIX')
  assert.equal(resolveSymbol('US 10Y'), 'TVC:US10Y')
  assert.equal(resolveSymbol('gold'), 'TVC:GOLD')
  assert.equal(resolveSymbol('WTI'), 'TVC:USOIL')
  assert.equal(resolveSymbol('ES1!'), 'CME_MINI:ES1!')
  assert.equal(resolveSymbol('nq'), 'CME_MINI:NQ1!')
  assert.equal(resolveSymbol('Bitcoin'), 'BINANCE:BTCUSDT')
})

test('a symbol that names its exchange, or is no alias at all, is left as the widget takes it', () => {
  assert.equal(resolveSymbol('NYSE:GOLD'), 'NYSE:GOLD')
  assert.equal(resolveSymbol(' sp:spx '), 'SP:SPX')
  assert.equal(resolveSymbol('aapl'), 'AAPL')
  assert.equal(resolveSymbol('BRK.B'), 'BRK.B')
  assert.equal(resolveSymbol(''), '')
  assert.equal(resolveSymbol(7), '')
})

test('the symbols to compare are resolved too, deduped, and stop at the most a pane takes', () => {
  assert.deepEqual(readState({ symbol: 'spx', compare: ['gold', 'oil'] }).compare, ['TVC:GOLD', 'TVC:USOIL'])
  // The main symbol, by either name, is already the chart.
  assert.equal(readState({ symbol: 'spx', compare: ['S&P 500', 'SP:SPX'] }).compare, undefined)
  assert.deepEqual(readState({ symbol: 'AAPL', compare: ['msft', 'MSFT', 7, ' '] }).compare, ['MSFT'])
  const many = readState({ symbol: 'AAPL', compare: ['MSFT', 'NVDA', 'AMZN', 'GOOGL'] }).compare
  assert.deepEqual(many, ['MSFT', 'NVDA', 'AMZN'])
  assert.equal(many?.length, MAX_COMPARE)
  assert.equal(readState({ symbol: 'AAPL', compare: null }).compare, undefined)
})

test('extended hours is on only when it is asked for', () => {
  assert.equal(readState({ symbol: 'AAPL', extendedHours: true }).extendedHours, true)
  assert.equal(readState({ symbol: 'AAPL', extendedHours: 'yes' }).extendedHours, undefined)
  assert.equal(readState({ symbol: 'AAPL', extendedHours: false }).extendedHours, undefined)
  assert.equal(readState({ symbol: 'AAPL' }).extendedHours, undefined)
})

test('a timezone TradingView offers, or a common name for one, resolves to the widget id', () => {
  assert.equal(TIMEZONES.length, 98)
  for (const tz of TIMEZONES) {
    assert.equal(resolveTimezone(tz), tz)
  }
  assert.equal(resolveTimezone('America/New_York'), 'America/New_York')
  assert.equal(resolveTimezone(' america/new_york '), 'America/New_York')
  assert.equal(resolveTimezone('America/New York'), 'America/New_York')
  assert.equal(resolveTimezone('Europe/London'), 'Europe/London')
  assert.equal(resolveTimezone('Asia/Tokyo'), 'Asia/Tokyo')
  assert.equal(resolveTimezone('Etc/UTC'), 'Etc/UTC')
  assert.equal(resolveTimezone('UTC'), 'Etc/UTC')
  assert.equal(resolveTimezone('gmt'), 'Etc/UTC')
  assert.equal(resolveTimezone('EST'), 'America/New_York')
  assert.equal(resolveTimezone('EDT'), 'America/New_York')
  assert.equal(resolveTimezone('ET'), 'America/New_York')
  assert.equal(resolveTimezone('US/Eastern'), 'America/New_York')
  assert.equal(resolveTimezone('America/Detroit'), 'America/New_York')
  assert.equal(resolveTimezone('America/Indianapolis'), 'America/New_York')
  assert.equal(resolveTimezone('CST'), 'America/Chicago')
  assert.equal(resolveTimezone('CDT'), 'America/Chicago')
  assert.equal(resolveTimezone('CT'), 'America/Chicago')
  assert.equal(resolveTimezone('US/Central'), 'America/Chicago')
  assert.equal(resolveTimezone('MST'), 'US/Mountain')
  assert.equal(resolveTimezone('MDT'), 'US/Mountain')
  assert.equal(resolveTimezone('MT'), 'US/Mountain')
  assert.equal(resolveTimezone('America/Denver'), 'US/Mountain')
  assert.equal(resolveTimezone('PST'), 'America/Los_Angeles')
  assert.equal(resolveTimezone('PDT'), 'America/Los_Angeles')
  assert.equal(resolveTimezone('PT'), 'America/Los_Angeles')
  assert.equal(resolveTimezone('US/Pacific'), 'America/Los_Angeles')
  assert.equal(resolveTimezone('Europe/Frankfurt'), 'Europe/Berlin')
  assert.equal(resolveTimezone('Asia/Beijing'), 'Asia/Shanghai')
  assert.equal(resolveTimezone('Australia/Melbourne'), 'Australia/Sydney')
  assert.equal(resolveTimezone('Asia/Calcutta'), 'Asia/Kolkata')
  assert.equal(resolveTimezone('Japan'), 'Asia/Tokyo')
  assert.equal(readState({ symbol: 'AAPL', timezone: 'America/New_York' }).timezone, 'America/New_York')
  assert.equal(readState({ symbol: 'AAPL', timezone: 'est' }).timezone, 'America/New_York')
})

test('an unset, exchange, cleared, or unknown timezone leaves the chart on the exchange timezone', () => {
  assert.equal(resolveTimezone(undefined), undefined)
  assert.equal(resolveTimezone(null), undefined)
  assert.equal(resolveTimezone(''), undefined)
  assert.equal(resolveTimezone('   '), undefined)
  assert.equal(resolveTimezone('exchange'), undefined)
  assert.equal(resolveTimezone('EXCHANGE'), undefined)
  assert.equal(resolveTimezone('Mars/Olympus'), undefined)
  assert.equal(resolveTimezone(7), undefined)
  assert.equal(readState({ symbol: 'AAPL' }).timezone, undefined)
  assert.equal(readState({ symbol: 'AAPL', timezone: null }).timezone, undefined)
  assert.equal(readState({ symbol: 'AAPL', timezone: '' }).timezone, undefined)
  assert.equal(readState({ symbol: 'AAPL', timezone: 'exchange' }).timezone, undefined)
  assert.equal(readState({ symbol: 'AAPL', timezone: 'Mars/Olympus' }).timezone, undefined)
  assert.equal(readState({ symbol: 'AAPL', timezone: 7 }).timezone, undefined)
  const ny = widgetUrl(readState({ symbol: 'NASDAQ:AAPL', timezone: 'America/New_York' }), 'dark')
  const exchange = widgetUrl(readState({ symbol: 'NASDAQ:AAPL', timezone: 'exchange' }), 'dark')
  const invalid = widgetUrl(readState({ symbol: 'NASDAQ:AAPL', timezone: 'Mars/Olympus' }), 'dark')
  assert.notEqual(ny, exchange)
  assert.equal(invalid, exchange)
  assert.equal(JSON.parse(decodeURIComponent(new URL(ny).hash.slice(1))).timezone, 'America/New_York')
  assert.equal(JSON.parse(decodeURIComponent(new URL(exchange).hash.slice(1))).timezone, 'exchange')
})

test('the widget address is the advanced chart page with the chart in its hash', () => {
  const url = new URL(widgetUrl({ symbol: 'NASDAQ:AAPL', interval: 'D', style: 'candles', studies: [] }, 'light'))
  assert.equal(url.origin, WIDGET_ORIGIN)
  assert.equal(url.pathname, '/embed-widget/advanced-chart/')
  assert.equal(url.search, '?locale=en')
  assert.deepEqual(JSON.parse(decodeURIComponent(url.hash.slice(1))), {
    symbol: 'NASDAQ:AAPL',
    interval: 'D',
    style: '1',
    studies: [],
    timezone: 'exchange',
    theme: 'light',
    autosize: true,
    allow_symbol_change: true,
    support_host: 'https://www.tradingview.com',
    'page-uri': '__NHTTP__',
  })
})

test('the widget draws in the scheme it is given, so light and dark are two addresses for one chart', () => {
  const aapl: State = { symbol: 'NASDAQ:AAPL', interval: 'D', style: 'candles', studies: [] }
  const light = widgetUrl(aapl, 'light')
  const dark = widgetUrl(aapl, 'dark')
  assert.notEqual(dark, light)
  const chart = (url: string) => JSON.parse(decodeURIComponent(new URL(url).hash.slice(1)))
  assert.equal(chart(dark).theme, 'dark')
  assert.deepEqual({ ...chart(dark), theme: 'light' }, chart(light))
})

test('a range, a style, and studies go to the widget by the names it knows them by', () => {
  const url = new URL(widgetUrl({ symbol: 'AMEX:SPY', interval: 'W', range: '3M', style: 'heikin-ashi', studies: ['bollinger-bands', 'vwap'] }, 'light'))
  const chart = JSON.parse(decodeURIComponent(url.hash.slice(1)))
  assert.equal(chart.range, '3M')
  assert.equal(chart.style, '8')
  assert.deepEqual(chart.studies, ['STD;Bollinger_Bands', 'STD;VWAP'])
})

test('symbols to compare go to the widget as overlays in the price pane, and extended hours as its session', () => {
  const state: State = { symbol: 'SP:SPX', interval: 'D', style: 'candles', studies: [], compare: ['TVC:GOLD'], extendedHours: true }
  const chart = JSON.parse(decodeURIComponent(new URL(widgetUrl(state, 'dark')).hash.slice(1)))
  assert.deepEqual(chart.compareSymbols, [{ symbol: 'TVC:GOLD', position: 'SameScale' }])
  assert.equal(chart.extended_hours, true)
  const plain = JSON.parse(decodeURIComponent(new URL(widgetUrl({ ...state, compare: [], extendedHours: false }, 'dark')).hash.slice(1)))
  assert.equal('compareSymbols' in plain, false)
  assert.equal('extended_hours' in plain, false)
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
  assert.equal(summarize({ symbol: 'S&P 500', compare: ['gold'], extendedHours: true }, {}), 'Chart: SP:SPX, D, candles, vs TVC:GOLD, extended hours')
  assert.equal(summarize({ symbol: 'NASDAQ:AAPL', interval: '5', timezone: 'America/New_York' }, {}), 'Chart: NASDAQ:AAPL, 5, candles, America/New_York')
  assert.equal(summarize({ symbol: 'NASDAQ:AAPL', timezone: 'exchange' }, {}), 'Chart: NASDAQ:AAPL, D, candles')
})

test('the instructions tell the assistant how to set and clear state.timezone', () => {
  assert.match(INSTRUCTIONS, /state\.timezone/)
  assert.match(INSTRUCTIONS, /America\/New_York/)
  assert.match(INSTRUCTIONS, /exchange/)
})

test('widgetReady and symbolInfo messages are requested and read in TradingView postMessage format', () => {
  assert.deepEqual(JSON.parse(widgetRequest('widgetReady', 1)), {
    id: 1,
    type: 'get',
    name: 'widgetReady',
    client_id: 'jaspers',
    data: null,
    provider: 'TradingView',
  })
  assert.deepEqual(JSON.parse(widgetRequest('symbolInfo', 2)), {
    id: 2,
    type: 'get',
    name: 'symbolInfo',
    client_id: 'jaspers',
    data: null,
    provider: 'TradingView',
  })
  assert.equal(isWidgetReady(JSON.stringify({ id: 1, type: 'on', name: 'widgetReady', provider: 'TradingView' })), true)
  assert.equal(isWidgetReady({ id: 1, type: 'on', name: 'widgetReady', provider: 'TradingView' }), true)
  assert.equal(isWidgetReady(QUOTE_UPDATE), false)

  const infoMsg = {
    id: 2,
    type: 'on',
    name: 'symbolInfo',
    client_id: 'jaspers',
    data: { name: 'NVDA', exchange: 'NASDAQ', description: 'NVIDIA Corp', interval: '15' },
    provider: 'TradingView',
  }
  assert.deepEqual(readSymbolInfo(infoMsg), {
    name: 'NVDA',
    exchange: 'NASDAQ',
    description: 'NVIDIA Corp',
    interval: '15',
  })
  assert.deepEqual(readSymbolInfo(JSON.stringify(infoMsg)), {
    name: 'NVDA',
    exchange: 'NASDAQ',
    description: 'NVIDIA Corp',
    interval: '15',
  })
  assert.equal(readSymbolInfo(QUOTE_UPDATE), null)
})

test('interactive symbol and interval changes in the widget persist to state without reloading the iframe', () => {
  const initial = readState({ symbol: 'NASDAQ:FLWS', interval: 'D' })
  let live = syncLiveChart(null, null, initial, 'dark')
  assert.ok(live)
  const initialUrl = live.url

  // Initial quote for the loaded symbol (FLWS) does not patch state or change the URL.
  const firstQuote = applyWidgetUpdate(live, initial, { symbol: 'FLWS' })
  assert.equal(firstQuote.patch, null)
  assert.equal(firstQuote.live.url, initialUrl)
  assert.equal(firstQuote.live.state.symbol, 'NASDAQ:FLWS')

  // Initial symbolInfo for the loaded symbol records the widget interval without patching state.
  const firstInfo = applyWidgetUpdate(firstQuote.live, initial, { symbol: 'FLWS', interval: 'D' })
  assert.equal(firstInfo.patch, null)
  assert.equal(firstInfo.live.url, initialUrl)

  // User changes symbol to NVDA in the widget header bar.
  const symbolChanged = applyWidgetUpdate(firstInfo.live, initial, { symbol: 'NVDA' })
  assert.deepEqual(symbolChanged.patch, { symbol: 'NVDA' })
  assert.equal(symbolChanged.live.url, initialUrl)
  assert.equal(symbolChanged.live.state.symbol, 'NVDA')

  // Re-render while panel.state write is still in flight keeps the live chart and URL intact.
  live = syncLiveChart(symbolChanged.live, initial, initial, 'dark')
  assert.ok(live)
  assert.equal(live.url, initialUrl)
  assert.equal(live.state.symbol, 'NVDA')

  // Once panel.state updates to symbol: 'NVDA', the iframe still keeps its URL without reloading.
  const afterSymbolState = readState({ symbol: 'NVDA', interval: 'D' })
  live = syncLiveChart(live, initial, afterSymbolState, 'dark')
  assert.ok(live)
  assert.equal(live.url, initialUrl)
  assert.equal(live.state.symbol, 'NVDA')

  // User changes interval to '15' in the widget toolbar.
  const intervalChanged = applyWidgetUpdate(live, afterSymbolState, { symbol: 'NVDA', interval: '15' })
  assert.deepEqual(intervalChanged.patch, { interval: '15' })
  assert.equal(intervalChanged.live.url, initialUrl)
  assert.equal(intervalChanged.live.state.interval, '15')

  const afterIntervalState = readState({ symbol: 'NVDA', interval: '15' })
  live = syncLiveChart(intervalChanged.live, afterSymbolState, afterIntervalState, 'dark')
  assert.ok(live)
  assert.equal(live.url, initialUrl)
  assert.equal(live.state.interval, '15')

  // If the component unmounts and remounts from the persisted panel.state, it mounts with NVDA and 15.
  const remounted = syncLiveChart(null, null, afterIntervalState, 'dark')
  assert.ok(remounted)
  assert.equal(remounted.state.symbol, 'NVDA')
  assert.equal(remounted.state.interval, '15')
})

test('changing interval in the widget when a range was set clears range, while initial range bar-size is ignored', () => {
  const initial = readState({ symbol: 'NASDAQ:FLWS', interval: 'D', range: '3M' })
  const live = syncLiveChart(null, null, initial, 'dark')
  assert.ok(live)

  // Widget picks 60m bars for a 3M range on initial load: this is not a user edit.
  const initialInfo = applyWidgetUpdate(live, initial, { symbol: 'FLWS', interval: '60' })
  assert.equal(initialInfo.patch, null)
  assert.equal(initialInfo.live.state.range, '3M')

  // User then picks 5m bars in the toolbar: interval updates to '5' and range is cleared with null.
  const edited = applyWidgetUpdate(initialInfo.live, initial, { symbol: 'FLWS', interval: '5' })
  assert.deepEqual(edited.patch, { interval: '5', range: null })
  assert.equal(edited.live.state.interval, '5')
  assert.equal(edited.live.state.range, undefined)
})

test('external state changes or scheme switches load a new widget address using the persisted symbol', () => {
  const initial = readState({ symbol: 'NASDAQ:FLWS', interval: 'D' })
  let live = syncLiveChart(null, null, initial, 'dark')
  assert.ok(live)
  const initialUrl = live.url

  // User switches symbol to AAPL in the widget, and state persists it.
  live = applyWidgetUpdate(live, initial, { symbol: 'AAPL' }).live
  const afterUser = readState({ symbol: 'AAPL', interval: 'D' })
  live = syncLiveChart(live, initial, afterUser, 'dark')
  assert.ok(live)
  assert.equal(live.url, initialUrl)

  // Assistant adds RSI study: iframe reloads at AAPL with RSI, not back at FLWS.
  const withStudy = readState({ symbol: 'AAPL', interval: 'D', studies: ['rsi'] })
  live = syncLiveChart(live, afterUser, withStudy, 'dark')
  assert.ok(live)
  assert.notEqual(live.url, initialUrl)
  assert.equal(live.state.symbol, 'AAPL')
  assert.deepEqual(live.state.studies, ['rsi'])
})
