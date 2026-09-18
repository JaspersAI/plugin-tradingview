# CLAUDE.md

The `tradingview` plugin for Jaspers Terminal, written against `@jaspers-ai/sdk`. The app loads it from a folder in `~/Jaspers/plugins/tradingview` (a clone of this repo, or an installed release) and rebuilds it on save. How plugins work, the SDK, and the app's side are in the terminal repo's CLAUDE.md.

## Commands

Node 24.

- `npm install`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Node's test runner over the `*.test.ts` files, which strips the types itself
- `npm run package` — `build/tradingview-<version>.zip`, what a release attaches; the Release workflow runs it on a `v*` tag

Style: square, no rounded corners. Colours are the app's theme variables with the light value as fallback (`var(--jaspers-border, #e5e5e5)`, `var(--jaspers-muted-foreground, #737373)`), so a view follows the app's light and dark; a colour of the plugin's own gets its dark value under `@media (prefers-color-scheme: dark)`.

## The plugin

### The TradingView plugin

This repo holds TradingView's advanced chart widget as one view, `tradingview/chart`, with no sources and no backend. TradingView draws the chart, with its own data, on `https://www.tradingview-widget.com`, the plugin's one `frames` entry, in a frame inside the view.

- `chart.ts` is the pure half, tested in `chart.test.ts`: `readState` (the state with its defaults, since main stores state as written), `widgetUrl` (the address TradingView's embed script builds: `locale` in the query, the chart as JSON in the hash, with the `page-uri: "__NHTTP__"` the script sends for a page that is not http, and the app's scheme as `theme`), `readQuote`, `nextQuote`, and `summarize`. Styles and studies go by name (`heikin-ashi`, `bollinger-bands`) and map to TradingView's codes (`8`, `STD;Bollinger_Bands`); the six studies are the ones seen drawing in the widget.
- `ChartView.tsx` gates on the state like `ScreenerView`, keys the frame on the address (the widget reads its hash once), and publishes the state plus `quote`. The theme is the app's light or dark, read from `matchMedia('(prefers-color-scheme: dark)')` and kept out of state; a switch is a new address, so the widget loads again, back at `state.symbol`. The widget posts `quoteUpdate` messages (`short_name`, `last_price`, `change`, `change_percent`, `exchange`, `description`, `volume`) to the page, read only from the widget's origin and its own frame's window. A new symbol goes out at once, a moving price at most every 15 s (`QUOTE_EVERY_MS`), since every publish pushes the whole tree. The quote follows a symbol the user picks in the widget's own search and state does not, so the instructions have the model carry `output.quote.name` into `symbol` when it sets anything else; the name has no exchange, so a crypto or non-US symbol can land on another listing. A symbol added to compare posts no quotes (seen in the app), so only the main symbol is ever published. "Chart by TradingView" under the frame opens tradingview.com through `openLink`, since the widget's own links need popups the sandbox refuses.
- The orchestrator drives it by state: `place_view { view: 'tradingview/chart', state: { symbol: 'NASDAQ:AAPL' } }`, then `set panels/e1/state { symbol: 'AMEX:SPY', range: '6M', style: 'line', studies: ['rsi'] }`. With `range` set the widget picks the bar size itself (3M shows 1h bars, 5D 5m), so `range` takes `null`, which clears it with a one-key `set`. The bars, the indicator values, and anything drawn cannot be read: the widget is another origin.
