# plugin-tradingview

TradingView chart for [Jaspers Terminal](https://github.com/JaspersAI), an open source, extensible desktop terminal for financial research.

One view, `tradingview/chart`: TradingView's own advanced chart widget, with its data and tools. The assistant sets the symbol — a ticker, or an index, future, commodity, or coin named in words, like the S&P 500 — the bar size, range, chart type, up to five indicators, symbols to compare, and extended hours, and reads back the last price.

## Install

In Jaspers Terminal, open Settings > Plugins, paste

```
https://github.com/JaspersAI/plugin-tradingview
```

and press Install. The app downloads the latest release, shows where it came from, and asks before any of it runs. A plugin runs code on your computer with your permissions, so install plugins only from people you trust.

## Keys

None.

## Needs

Nothing else.

## Develop

```sh
git clone https://github.com/JaspersAI/plugin-tradingview.git ~/Jaspers/plugins/tradingview
cd ~/Jaspers/plugins/tradingview
npm install
npm run typecheck
npm test
```

A folder you put in `~/Jaspers/plugins` is a plugin of your own, which the app rebuilds whenever you save. If this plugin is installed, remove it in Settings > Plugins first: the clone goes where the installed copy lives. Types come from [`@jaspers-ai/sdk`](https://www.npmjs.com/package/@jaspers-ai/sdk), which the app provides at run time.

## Release

Bump `version` in `package.json`, commit, and push a tag:

```sh
npm version patch
git push --follow-tags
```

The Release workflow checks the plugin and attaches `tradingview-<version>.zip` to a GitHub release. Update in Settings > Plugins picks it up.

## License

[MIT](LICENSE)
