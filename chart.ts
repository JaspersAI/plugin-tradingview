// The plugin's pure half: what a chart panel holds, the address of TradingView's widget for it, and
// the quotes the widget posts back. The widget is TradingView's page in a frame, so the view never
// sees the bars; what it can say about the chart is what it asked for and the quote it was told.

/** Where the widget's page is served from, and the only origin whose messages the view reads. */
export const WIDGET_ORIGIN = 'https://www.tradingview-widget.com'

/** Bar sizes: minutes, then a day, a week, a month. */
export const INTERVALS = ['1', '3', '5', '15', '30', '60', '120', '180', '240', 'D', 'W', 'M'] as const

/** How much history shows. The widget picks the bar size for a range itself. */
export const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '12M', '60M', 'ALL'] as const

/** Chart types by name, and the number TradingView knows each by. */
const STYLE_CODES = { candles: '1', bars: '0', line: '2', area: '3', 'heikin-ashi': '8', 'hollow-candles': '9' } as const

/** Indicators by name, and TradingView's id for each: the ones seen drawing in the widget. */
const STUDY_IDS = {
  rsi: 'STD;RSI',
  macd: 'STD;MACD',
  sma: 'STD;SMA',
  ema: 'STD;EMA',
  'bollinger-bands': 'STD;Bollinger_Bands',
  vwap: 'STD;VWAP',
} as const

export type Interval = (typeof INTERVALS)[number]
export type Range = (typeof RANGES)[number]
export type Style = keyof typeof STYLE_CODES
export type Study = keyof typeof STUDY_IDS

export const STYLES = Object.keys(STYLE_CODES) as [Style, ...Style[]]
export const STUDIES = Object.keys(STUDY_IDS) as [Study, ...Study[]]

/** More indicators than this and the chart is all panes. */
export const MAX_STUDIES = 5

/** How often a price that keeps moving is published: every publish is a push of the whole app state. */
export const QUOTE_EVERY_MS = 15_000

export interface State {
  /** EXCHANGE:TICKER, like NASDAQ:AAPL. Empty until one is set. */
  symbol: string
  interval: Interval
  range?: Range
  style: Style
  studies: Study[]
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
  return {
    symbol: typeof state['symbol'] === 'string' ? state['symbol'].trim().toUpperCase() : '',
    interval: INTERVALS.find((i) => i === state['interval']) ?? 'D',
    ...(range ? { range } : {}),
    style: typeof style === 'string' && Object.hasOwn(STYLE_CODES, style) ? (style as Style) : 'candles',
    studies: studies.slice(0, MAX_STUDIES),
  }
}

/**
 * The widget's page for a chart, built the way TradingView's embed script builds it: the locale in
 * the query, and the chart as JSON in the hash, so changing the chart is loading another address.
 */
export function widgetUrl(state: State): string {
  const chart = {
    symbol: state.symbol,
    interval: state.interval,
    ...(state.range ? { range: state.range } : {}),
    style: STYLE_CODES[state.style],
    studies: state.studies.map((study) => STUDY_IDS[study]),
    theme: 'light',
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
  return [`Chart: ${head}`, chart.range ?? chart.interval, chart.style, ...chart.studies].join(', ')
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
