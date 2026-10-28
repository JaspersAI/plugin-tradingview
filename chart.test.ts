import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMPACT_BAR_HEIGHT,
  COMPACT_HEIGHT,
  COMPACT_WIDTH,
  compactBar,
  frameLayout,
  isCompact,
  MAX_COMPARE,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_WIDTH,
  nextQuote,
  QUOTE_EVERY_MS,
  type Quote,
  readQuote,
  readState,
  resolveSymbol,
  resolveTimezone,
  type State,
  summarize,
  TIMEZONES,
  WIDGET_ORIGIN,
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

test('a narrow or short pane is compact, and a full-sized or unmeasured one is not', () => {
  assert.equal(isCompact(225, 170), true)
  assert.equal(isCompact(COMPACT_WIDTH - 1, 400), true)
  assert.equal(isCompact(680, COMPACT_HEIGHT - 1), true)
  assert.equal(isCompact(COMPACT_WIDTH, COMPACT_HEIGHT), false)
  assert.equal(isCompact(680, 450), false)
  assert.equal(isCompact(0, 0), false)
  assert.equal(isCompact(-10, 200), false)
  assert.equal(isCompact(Number.NaN, 200), false)
})

test('a compact chart hides the widget top toolbar, floating legend, and volume study', () => {
  const state: State = { symbol: 'NASDAQ:CORT', interval: 'D', style: 'candles', studies: [] }
  const full = JSON.parse(decodeURIComponent(new URL(widgetUrl(state, 'light', false)).hash.slice(1)))
  assert.equal('hide_top_toolbar' in full, false)
  assert.equal('hide_legend' in full, false)
  assert.equal('hide_volume' in full, false)

  const compact = JSON.parse(decodeURIComponent(new URL(widgetUrl(state, 'light', true)).hash.slice(1)))
  assert.equal(compact.hide_top_toolbar, true)
  assert.equal(compact.hide_legend, true)
  assert.equal(compact.hide_volume, true)
})

test('a compact sub-pane narrower than the widget minimum scales its frame so the right axis never clips', () => {
  assert.deepEqual(frameLayout(680, 450), { compact: false, scale: 1 })
  assert.deepEqual(frameLayout(0, 0), { compact: false, scale: 1 })
  // Narrow enough to be compact (< 380 px), but at least MIN_FRAME_WIDTH × MIN_FRAME_HEIGHT after the bar.
  assert.deepEqual(frameLayout(340, 260), { compact: true, scale: 1 })

  // Three side-by-side charts in a half-width 3-row tile (~225 × 172 px).
  const sub = frameLayout(225, 172)
  assert.equal(sub.compact, true)
  assert.ok(sub.scale < 1)
  assert.equal(sub.width, MIN_FRAME_WIDTH)
  assert.equal(sub.height, Math.round((172 - COMPACT_BAR_HEIGHT) / sub.scale))
  assert.ok((sub.width ?? 0) >= MIN_FRAME_WIDTH)
  assert.ok((sub.height ?? 0) >= MIN_FRAME_HEIGHT)
})

test('the compact bar shows the short symbol, active period, and latest quote with its sign', () => {
  const state = readState({ symbol: 'NASDAQ:CORT', interval: 'D' })
  assert.deepEqual(compactBar(state, null), { symbol: 'CORT', period: 'D' })
  assert.deepEqual(
    compactBar(readState({ symbol: 'KNSA', range: '12M' }), {
      name: 'KNSA',
      last: 89.2,
      change: 16.22,
      changePercent: 22.234,
    }),
    {
      symbol: 'KNSA',
      period: '12M',
      price: '89.2',
      change: '+22.23%',
      tone: 'up',
    },
  )
  assert.deepEqual(
    compactBar(readState({ symbol: 'NASDAQ:MSFT' }), {
      name: 'MSFT',
      last: 495.84,
      changePercent: -0.194,
    }),
    {
      symbol: 'MSFT',
      period: 'D',
      price: '495.84',
      change: '-0.19%',
      tone: 'down',
    },
  )
  assert.deepEqual(
    compactBar(readState({ symbol: 'MIRM' }), {
      name: 'MIRM',
      last: 85.56,
      changePercent: 0,
    }),
    {
      symbol: 'MIRM',
      period: 'D',
      price: '85.56',
      change: '0.00%',
      tone: 'flat',
    },
  )
})

