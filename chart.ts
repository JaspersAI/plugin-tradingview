// The plugin's pure half: what a chart panel holds, the address of TradingView's widget for it, and
// the quotes the widget posts back. The widget is TradingView's page in a frame, so the view never
// sees the bars; what it can say about the chart is what it asked for and the quote it was told.

/** Where the widget's page is served from, and the only origin whose messages the view reads. */
export const WIDGET_ORIGIN = 'https://www.tradingview-widget.com'

/** Bar sizes: minutes, then a day, a week, a month. */
export const INTERVALS = ['1', '3', '5', '15', '30', '60', '120', '180', '240', 'D', 'W', 'M'] as const

/** How much history shows. The widget picks the bar size for a range itself. */
export const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '12M', '60M', 'ALL'] as const

/**
 * What people call the indices, futures, and macro symbols, against the symbol TradingView charts
 * them under: 'S&P 500', 'SPX', and 'Dow' reach no chart on their own, since the widget wants an
 * exchange. Keys are the name with everything but letters and digits dropped, so case, spaces, '&',
 * and dots do not matter. Every symbol here was checked against TradingView's own symbol search.
 */
const SYMBOL_ALIASES: Record<string, string> = {
  // Indices.
  SP: 'SP:SPX',
  SP500: 'SP:SPX',
  SPX: 'SP:SPX',
  SPX500: 'SP:SPX',
  NDX: 'NASDAQ:NDX',
  NAS100: 'NASDAQ:NDX',
  NASDAQ100: 'NASDAQ:NDX',
  IXIC: 'NASDAQ:IXIC',
  NASDAQCOMPOSITE: 'NASDAQ:IXIC',
  DJI: 'DJ:DJI',
  DJIA: 'DJ:DJI',
  DOW: 'DJ:DJI',
  DOWJONES: 'DJ:DJI',
  RUT: 'TVC:RUT',
  RUSSELL: 'TVC:RUT',
  RUSSELL2000: 'TVC:RUT',
  VIX: 'CBOE:VIX',
  DXY: 'TVC:DXY',
  DOLLARINDEX: 'TVC:DXY',
  // Treasury yields.
  US10Y: 'TVC:US10Y',
  US10YR: 'TVC:US10Y',
  UST10Y: 'TVC:US10Y',
  US2Y: 'TVC:US02Y',
  US02Y: 'TVC:US02Y',
  UST2Y: 'TVC:US02Y',
  // Commodities. A company named for the metal keeps its own chart: NYSE:GOLD carries a prefix.
  GOLD: 'TVC:GOLD',
  XAU: 'TVC:GOLD',
  SILVER: 'TVC:SILVER',
  XAG: 'TVC:SILVER',
  OIL: 'TVC:USOIL',
  USOIL: 'TVC:USOIL',
  WTI: 'TVC:USOIL',
  CRUDE: 'TVC:USOIL',
  CRUDEOIL: 'TVC:USOIL',
  // Futures, as the continuous front-month contract.
  ES: 'CME_MINI:ES1!',
  ES1: 'CME_MINI:ES1!',
  SPFUTURES: 'CME_MINI:ES1!',
  SP500FUTURES: 'CME_MINI:ES1!',
  NQ: 'CME_MINI:NQ1!',
  NQ1: 'CME_MINI:NQ1!',
  NASDAQFUTURES: 'CME_MINI:NQ1!',
  // Crypto, on the venue with the deepest book the widget carries.
  BTC: 'BINANCE:BTCUSDT',
  BTCUSD: 'BINANCE:BTCUSDT',
  BITCOIN: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  ETHEREUM: 'BINANCE:ETHUSDT',
}

/** Chart types by name, and the number TradingView knows each by. */
const STYLE_CODES = { candles: '1', bars: '0', line: '2', area: '3', 'heikin-ashi': '8', 'hollow-candles': '9' } as const

/**
 * Indicators by name, and TradingView's id for each. The ids are the widget's own: its bundle carries
 * a table from the old `RSI@tv-basicstudies` names to these, and only ids found there are listed, so
 * an indicator the widget would silently drop is not offered. Ichimoku and Supertrend are missing
 * from that table, so they are left out rather than guessed at.
 */
const STUDY_IDS = {
  rsi: 'STD;RSI',
  macd: 'STD;MACD',
  sma: 'STD;SMA',
  ema: 'STD;EMA',
  'bollinger-bands': 'STD;Bollinger_Bands',
  vwap: 'STD;VWAP',
  stochastic: 'STD;Stochastic',
  'stochastic-rsi': 'STD;Stochastic_RSI',
  atr: 'STD;Average_True_Range',
  // TradingView draws ADX with the +DI and -DI lines, under the directional movement id.
  adx: 'STD;DMI',
  obv: 'STD;On_Balance_Volume',
  cci: 'STD;CCI',
  'keltner-channels': 'STD;Keltner_Channels',
  'donchian-channels': 'STD;Donchian_Channels',
  'parabolic-sar': 'STD;PSAR',
} as const

export type Interval = (typeof INTERVALS)[number]
export type Range = (typeof RANGES)[number]
export type Style = keyof typeof STYLE_CODES
export type Study = keyof typeof STUDY_IDS

export const STYLES = Object.keys(STYLE_CODES) as [Style, ...Style[]]
export const STUDIES = Object.keys(STUDY_IDS) as [Study, ...Study[]]

/**
 * The widget takes five indicators and drops the rest: its embed slices the studies it was given to
 * five unless the page is a TradingView customer's. Volume is not one of them, since the widget
 * draws it under the price by itself.
 */
export const MAX_STUDIES = 5

/** Symbols drawn over the main one. More than this and one pane is a thicket. */
export const MAX_COMPARE = 3

/** How often a price that keeps moving is published: every publish is a push of the whole app state. */
export const QUOTE_EVERY_MS = 15_000

export interface State {
  /** EXCHANGE:TICKER, like NASDAQ:AAPL, once resolved. Empty until one is set. */
  symbol: string
  interval: Interval
  range?: Range
  style: Style
  studies: Study[]
  /** Symbols drawn over the main one for comparison. Absent when there are none. */
  compare?: string[]
  /** Pre- and post-market bars, where the exchange has them. Absent means regular hours. */
  extendedHours?: boolean
}

/** The latest quote the widget posted: the symbol it is showing and its price. */
export interface Quote {
  name: string
  exchange?: string
  description?: string
  last: number
  change?: number
  changePercent?: number
  volume?: number
}

export interface Output extends State {
  quote?: Quote
}

/** The app's light or dark, which the widget draws in. The view reads it from its page; a panel's state never holds it. */
export type Scheme = 'light' | 'dark'

/**
 * The panel's state with its defaults, read the forgiving way: main checks what is written against
 * the schema, but stores it as written, so a key that was never set is simply not there.
 */
export function readState(raw: unknown): State {
  const state = record(raw) ?? {}
  const range = RANGES.find((r) => r === state['range'])
  const studies: Study[] = []
  for (const study of Array.isArray(state['studies']) ? state['studies'] : []) {
    if (typeof study === 'string' && Object.hasOwn(STUDY_IDS, study) && !studies.includes(study as Study)) studies.push(study as Study)
  }
  const style = state['style']
  const symbol = resolveSymbol(state['symbol'])
  const compare: string[] = []
  for (const written of Array.isArray(state['compare']) ? state['compare'] : []) {
    const other = resolveSymbol(written)
    // The main symbol drawn over itself is a line on a line.
    if (other !== '' && other !== symbol && !compare.includes(other)) compare.push(other)
  }
  return {
    symbol,
    interval: INTERVALS.find((i) => i === state['interval']) ?? 'D',
    ...(range ? { range } : {}),
    style: typeof style === 'string' && Object.hasOwn(STYLE_CODES, style) ? (style as Style) : 'candles',
    studies: studies.slice(0, MAX_STUDIES),
    ...(compare.length ? { compare: compare.slice(0, MAX_COMPARE) } : {}),
    ...(state['extendedHours'] === true ? { extendedHours: true } : {}),
  }
}

/**
 * The symbol TradingView charts for what was written: an alias as the symbol it stands for, anything
 * else as written, in the case the widget uses. A symbol that already names its exchange is never
 * rewritten, so NYSE:GOLD stays Barrick while 'gold' is the metal.
 */
export function resolveSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const written = raw.trim().toUpperCase()
  if (written === '' || written.includes(':')) return written
  return SYMBOL_ALIASES[written.replace(/[^A-Z0-9]/g, '')] ?? written
}

/**
 * The widget's page for a chart, built the way TradingView's embed script builds it: the locale in
 * the query, and the chart as JSON in the hash, so changing the chart is loading another address.
 * Its theme is the app's scheme, in the hash like the rest, so light and dark are two addresses.
 */
export function widgetUrl(state: State, scheme: Scheme): string {
  const chart = {
    symbol: state.symbol,
    interval: state.interval,
    ...(state.range ? { range: state.range } : {}),
    style: STYLE_CODES[state.style],
    studies: state.studies.map((study) => STUDY_IDS[study]),
    // The widget's compare only acts on SameScale, NewPriceScale, and NewPane; an overlay in the
    // price pane is what comparing two symbols on one chart means here.
    ...(state.compare?.length
      ? { compareSymbols: state.compare.map((symbol) => ({ symbol, position: 'SameScale' })) }
      : {}),
    ...(state.extendedHours ? { extended_hours: true } : {}),
    theme: scheme,
    autosize: true,
    allow_symbol_change: true,
    support_host: 'https://www.tradingview.com',
    // What the embed script sends for a page that is not http(s). The chart opens its data connection with it.
    'page-uri': '__NHTTP__',
  }
  return `${WIDGET_ORIGIN}/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(chart))}`
}

/** A quoteUpdate the widget posted, as a quote; anything else it posts is null. */
export function readQuote(message: unknown): Quote | null {
  const post = record(typeof message === 'string' ? parseJson(message) : message)
  const data = post?.['name'] === 'quoteUpdate' ? record(post['data']) : null
  if (!data) return null
  const name = text(data['short_name'])
  const last = finite(data['last_price'])
  if (name === undefined || last === undefined) return null
  return defined({
    name,
    exchange: text(data['exchange']),
    description: text(data['description']),
    last,
    change: finite(data['change']),
    changePercent: finite(data['change_percent']),
    volume: finite(data['volume']),
  })
}

/**
 * The quote to publish now, or null to leave the published one. A symbol the chart has just started
 * showing goes out at once; the same symbol's moving price waits out the interval.
 */
export function nextQuote(shown: Quote | null, shownAt: number, latest: Quote | null, now: number): Quote | null {
  if (!latest) return null
  if (!shown || latest.name !== shown.name) return latest
  if (now - shownAt < QUOTE_EVERY_MS) return null
  return JSON.stringify(latest) === JSON.stringify(shown) ? null : latest
}

/** The line the model's map carries for a chart. */
export function summarize(state: unknown, output: unknown): string {
  const chart = readState(state)
  const quote = record(record(output)?.['quote']) as Quote | null
  const head = quote ? [quote.name, String(quote.last), percent(quote.changePercent)].filter(Boolean).join(' ') : chart.symbol
  return [
    `Chart: ${head}`,
    chart.range ?? chart.interval,
    chart.style,
    ...chart.studies,
    ...(chart.compare ? [`vs ${chart.compare.join(' ')}`] : []),
    ...(chart.extendedHours ? ['extended hours'] : []),
  ].join(', ')
}

function percent(value: number | undefined): string {
  return value === undefined ? '' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The same object without its undefined keys, so what is published says only what is known. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}
