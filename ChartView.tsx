import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useBridge, useData, usePublish, type PanelRef } from "@jaspers-ai/sdk";
import {
  nextQuote,
  QUOTE_EVERY_MS,
  readQuote,
  readState,
  WIDGET_ORIGIN,
  widgetUrl,
  type Quote,
  type Scheme,
} from "./chart";
import "./styles.css";

// The view: TradingView's widget in a frame, at the address the panel's state makes, so changing the
// state loads another chart. The widget posts quotes to this page; the latest goes out with the state
// as the output, which is everything the orchestrator can know about what is drawn. The address also
// carries the app's light or dark, so a switch loads the chart again in the other.

/** Where the credit under the chart goes. */
const TRADINGVIEW = "https://www.tradingview.com/";

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
  const url = state.symbol ? widgetUrl(state, scheme) : null;
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef<Quote | null>(null);
  const shown = useRef<{ quote: Quote | null; at: number }>({
    quote: null,
    at: 0,
  });
  const [quote, setQuote] = useState<Quote | null>(null);

  // Another address is another chart, or the same one loaded again in the other scheme: either way
  // what the last page said about its price no longer holds.
  useEffect(() => {
    latest.current = null;
    shown.current = { quote: null, at: 0 };
    setQuote(null);
  }, [url]);

  useEffect(() => {
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
      const posted = readQuote(event.data);
      if (!posted) return;
      latest.current = posted;
      offer();
    }
    window.addEventListener("message", onMessage);
    // A price that moved inside the interval goes out once the interval has passed, quote or no quote.
    const timer = setInterval(offer, QUOTE_EVERY_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, []);

  usePublish(panel, quote ? { ...state, quote } : { ...state });

  return (
    <div className="tv-root">
      {url ? (
        // Keyed on the address: the widget reads its chart from the hash once, so a new one is a new page.
        <iframe
          key={url}
          ref={frame}
          className="tv-frame"
          src={url}
          title={`${state.symbol} chart`}
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
