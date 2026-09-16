import { definePlugin, defineView } from '@jaspers-ai/sdk'
import { z } from 'zod'
import { ChartView } from './ChartView'
import { INTERVALS, MAX_STUDIES, RANGES, STUDIES, STYLES, summarize, WIDGET_ORIGIN } from './chart'
import { INSTRUCTIONS } from './instructions'

// TradingView's advanced chart widget as a view. TradingView draws it, with its own data, on its
// own page in a frame, so there are no sources and no backend here: the state says which chart, and
// the output is that and the quote the widget posts back. frames is what lets the view frame it.

const StateSchema = z.object({
  symbol: z.string().min(1).describe('EXCHANGE:TICKER, like NASDAQ:AAPL, AMEX:SPY, BINANCE:BTCUSDT, FX:EURUSD. A bare US ticker works too.'),
  interval: z.enum(INTERVALS).default('D').describe('Bar size: 1 to 240 minutes, D, W, or M.'),
  range: z.enum(RANGES).nullable().optional().describe('How much history shows. When set, the widget picks the bar size for it; null clears it.'),
  style: z.enum(STYLES).default('candles'),
  studies: z.array(z.enum(STUDIES)).max(MAX_STUDIES).default([]),
})

const QuoteSchema = z.object({
  name: z.string(),
  exchange: z.string().optional(),
  description: z.string().optional(),
  last: z.number(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  volume: z.number().optional(),
})

const OutputSchema = z.object({
  symbol: z.string(),
  interval: z.enum(INTERVALS),
  range: z.enum(RANGES).optional(),
  style: z.enum(STYLES),
  studies: z.array(z.enum(STUDIES)),
  quote: QuoteSchema.optional(),
})

export default definePlugin({
  id: 'tradingview',
  frames: [WIDGET_ORIGIN],
  views: {
    chart: defineView(ChartView, {
      title: 'Chart',
      state: StateSchema,
      output: OutputSchema,
      instructions: INSTRUCTIONS,
      summarize,
    }),
  },
})
