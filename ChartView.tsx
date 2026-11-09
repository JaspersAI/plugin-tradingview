import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useBridge, useData, usePublish, type PanelRef } from "@jaspers-ai/sdk";
import {
  applyWidgetUpdate,
  frameKey,
  isWidgetReady,
  nextQuote,
  QUOTE_EVERY_MS,
  readQuote,
  readState,
  readSymbolInfo,
  syncLiveChart,
  WIDGET_ORIGIN,
  widgetRequest,
  type LiveChart,
  type Quote,
  type Scheme,
  type State,
} from "./chart";
import "./styles.css";

// The view: TradingView's widget in a frame, at the address the panel's state makes, so changing the
// state loads another chart. The widget posts quotes and symbolInfo to this page; interactive symbol
// and interval changes in the widget persist back to panel.state without reloading the frame, and the
// latest state and quote go out as the output. The address also carries the app's light or dark, so a
// switch loads the chart again in the other.

/** How often the mounted widget is polled for interval/symbol changes when quotes are quiet. */
const SYMBOL_INFO_POLL_MS = 2_000;

/**
 * The panel's state arrives a round trip after the frame mounts. Until it does there is no chart to
 * load, and publishing the defaults would say the view shows a chart it does not.
 */
export function ChartView({ panel }: { panel: PanelRef }): ReactElement {
  const state = useData(
    `workspaces/${panel.workspaceId}/panels/${panel.id}/state`,
  );
  if (state === undefined) {
    return (
      <div className="tv-root">
        <p className="tv-empty">Loading…</p>
      </div>
    );
  }
  return <Chart panel={panel} raw={state} />;
}

function Chart({
  panel,
  raw,
}: {
  panel: PanelRef;
  raw: unknown;
}): ReactElement {
  const bridge = useBridge();
  const scheme = useColorScheme();
  const state = readState(raw);
  const liveRef = useRef<LiveChart | null>(null);
  const prevPropStateRef = useRef<State | null>(null);
  const live = syncLiveChart(
    liveRef.current,
    prevPropStateRef.current,
    state,
    scheme,
  );
  liveRef.current = live;
  prevPropStateRef.current = state;
  const url = live?.url ?? null;
  const key = live ? frameKey(live) : null;
  const activeState = live?.state ?? state;

  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const reqId = useRef(0);
  const latest = useRef<Quote | null>(null);
  const shown = useRef<{ quote: Quote | null; at: number }>({
    quote: null,
    at: 0,
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [, setVersion] = useState(0);

  // Another address is another chart, or the same one loaded again in the other scheme: either way
  // what the last page said about its price no longer holds.
  useEffect(() => {
    ready.current = false;
    latest.current = null;
    shown.current = { quote: null, at: 0 };
    setQuote(null);
  }, [key]);

  useEffect(() => {
    function askSymbolInfo(): void {
      if (!ready.current) return;
      frame.current?.contentWindow?.postMessage(
        widgetRequest("symbolInfo", ++reqId.current),
        WIDGET_ORIGIN,
      );
    }
    function syncFromWidget(update: {
      symbol?: string;
      interval?: LiveChart["state"]["interval"];
    }): void {
      if (!liveRef.current) return;
      const { live: nextLive, patch } = applyWidgetUpdate(
        liveRef.current,
        prevPropStateRef.current ?? liveRef.current.state,
        update,
      );
      liveRef.current = nextLive;
      if (!patch) return;
      setVersion((v) => v + 1);
      if (patch.symbol !== undefined) {
        void bridge.setState(panel, ["symbol"], patch.symbol);
      }
      if (patch.interval !== undefined) {
        void bridge.setState(panel, ["interval"], patch.interval);
      }
      if (patch.range !== undefined) {
        void bridge.setState(panel, ["range"], patch.range);
      }
    }
    function offer(): void {
      const now = Date.now();
      const next = nextQuote(
        shown.current.quote,
        shown.current.at,
        latest.current,
        now,
      );
      if (!next) return;
      shown.current = { quote: next, at: now };
      setQuote(next);
    }
    function onMessage(event: MessageEvent): void {
      // Only the widget in this view's own frame.
      if (
        event.origin !== WIDGET_ORIGIN ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (isWidgetReady(event.data)) {
        ready.current = true;
        askSymbolInfo();
        return;
      }
      const info = readSymbolInfo(event.data);
      if (info) {
        ready.current = true;
        syncFromWidget({ symbol: info.name, interval: info.interval });
        return;
      }
      const posted = readQuote(event.data);
      if (!posted) return;
      ready.current = true;
      latest.current = posted;
      syncFromWidget({ symbol: posted.name });
      askSymbolInfo();
      offer();
    }
    window.addEventListener("message", onMessage);
    // A price that moved inside the interval goes out once the interval has passed, quote or no quote.
    const quoteTimer = setInterval(offer, QUOTE_EVERY_MS);
    const infoTimer = setInterval(askSymbolInfo, SYMBOL_INFO_POLL_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(quoteTimer);
      clearInterval(infoTimer);
    };
  }, [bridge, panel]);

  usePublish(panel, quote ? { ...activeState, quote } : { ...activeState });

  return (
    <div className="tv-root">
      {url && key ? (
        // Keyed on the live chart revision and address: the widget reads its chart from the hash once, so a new one is a new page.
        <iframe
          key={key}
          ref={frame}
          className="tv-frame"
          src={url}
          title={`${activeState.symbol} chart`}
          onLoad={() => {
            frame.current?.contentWindow?.postMessage(
              widgetRequest("widgetReady", ++reqId.current),
              WIDGET_ORIGIN,
            );
          }}
        />
      ) : (
        <p className="tv-empty">No symbol set.</p>
      )}
    </div>
  );
}

// Which scheme the app shows. Settings > Appearance sets it in this frame too, through the OS, so the
// media query is the one place to ask.
const DARK = "(prefers-color-scheme: dark)";

function subscribeColorScheme(onChange: () => void): () => void {
  const query = matchMedia(DARK);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The app's light or dark, followed as it switches: the widget takes it as its theme, from the address. */
function useColorScheme(): Scheme {
  return useSyncExternalStore(subscribeColorScheme, () =>
    matchMedia(DARK).matches ? "dark" : "light",
  );
}
