// What the orchestrator is told while a chart element is focused: how to drive the widget by state,
// and what it cannot tell you, since TradingView draws it on a page the app cannot read.

export const INSTRUCTIONS = [
  "A TradingView chart: TradingView's own widget, drawn with TradingView's data. state.symbol is EXCHANGE:TICKER (NASDAQ:AAPL, NYSE:JPM, AMEX:SPY, BINANCE:BTCUSDT, FX:EURUSD, TVC:DXY); a bare US ticker works too.",
  'state.interval is the bar size: 1, 3, 5, 15, 30, 60, 120, 180, or 240 minutes, D, W, or M. state.range is how much history shows: 1D, 5D, 1M, 3M, 6M, YTD, 12M, 60M, or ALL. With a range set the widget picks the bar size for it, so when the user names a bar size, set interval and set range to null.',
  'state.style is candles, bars, line, area, heikin-ashi, or hollow-candles. state.studies adds up to five indicators: rsi, macd, sma, ema, bollinger-bands, vwap.',
  "To show another symbol or change how it is drawn, set the focused chart's state; place a second chart only when the user wants two at once.",
  'output.quote is the last price TradingView reported for the symbol on screen (name, exchange, last, change, changePercent, volume), refreshed at most every 15 seconds; read it when the user asks what the chart shows. The bars, the indicator values, and anything drawn on the chart cannot be read.',
  'The user can pick another symbol in the chart itself, and state does not hear about it: when output.quote.name is not the ticker in state.symbol, the chart is showing output.quote.name, so set symbol to it along with any other change, or the chart goes back to state.symbol.',
].join('\n')
