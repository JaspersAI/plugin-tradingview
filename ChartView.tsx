import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import { useData, usePublish, type PanelRef } from "@jaspers-ai/sdk";
import {
  compactBar,
  frameLayout,
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
// carries the app's light or dark, so a switch loads the chart again in the other. In a narrow or
// short sub-pane, the widget's own toolbar, floating legend, and volume overlay are hidden in favor
// of a single-line header bar above the frame, and a sub-pane narrower than the widget's minimum
// chart width scales the frame down so the right price axis never clips.

/**
 * The panel's state arrives a round trip after the frame mounts. Until it does there is no chart to
 * load, and publishing the defaults would say the view shows a chart it does not.
 */
export function ChartView({ panel }: { panel: PanelRef }): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const size = usePaneSize(root);
  const state = useData(
    `workspaces/${panel.workspaceId}/panels/${panel.id}/state`,
  );
  return (
    <div ref={root} className="tv-root">
      {state === undefined ? (
        <p className="tv-empty">Loading…</p>
      ) : (
        <Chart panel={panel} raw={state} size={size} />
      )}
    </div>
  );
}

function Chart({
  panel,
  raw,
  size,
}: {
  panel: PanelRef;
  raw: unknown;
  size: { width: number; height: number };
}): ReactElement {
  const layout = frameLayout(size.width, size.height);
  const scheme = useColorScheme();
  const state = readState(raw);
  const baseUrl = state.symbol ? widgetUrl(state, scheme, false) : null;
  const url = state.symbol ? widgetUrl(state, scheme, layout.compact) : null;
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef<Quote | null>(null);
  const shown = useRef<{ quote: Quote | null; at: number }>({
    quote: null,
    at: 0,
  });
  const [quote, setQuote] = useState<Quote | null>(null);

  // Another chart or scheme means what the last page said about its price no longer holds.
  useEffect(() => {
    latest.current = null;
    shown.current = { quote: null, at: 0 };
    setQuote(null);
  }, [baseUrl]);

  // Reloading the same chart between full and compact keeps its quote only if the widget was still on state.symbol.
  const expectedSymbol = compactBar(state, null).symbol;
  useEffect(() => {
    if (shown.current.quote && shown.current.quote.name !== expectedSymbol) {
      latest.current = null;
      shown.current = { quote: null, at: 0 };
      setQuote(null);
    } else if (shown.current.quote) {
      shown.current = { quote: shown.current.quote, at: 0 };
    }
  }, [url, expectedSymbol]);

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

  const bar = layout.compact && state.symbol ? compactBar(state, quote) : null;
  const frameStyle: CSSProperties | undefined =
    layout.scale < 1 && layout.width && layout.height
      ? {
          width: `${layout.width}px`,
          height: `${layout.height}px`,
          transform: `scale(${layout.scale})`,
        }
      : undefined;

  return url ? (
    <>
      {bar && (
        <div className="tv-bar">
          <span className="tv-bar-title">
            <span className="tv-bar-symbol">{bar.symbol}</span>
            <span className="tv-bar-period">{bar.period}</span>
          </span>
          {bar.price !== undefined && (
            <span className="tv-bar-quote">
              <span className="tv-bar-price">{bar.price}</span>
              {bar.change && (
                <span className={`tv-bar-change tv-bar-${bar.tone ?? "flat"}`}>
                  {bar.change}
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <div className="tv-stage">
        {/* Keyed on the address: the widget reads its chart from the hash once, so a new one is a new page. */}
        <iframe
          key={url}
          ref={frame}
          className="tv-frame"
          style={frameStyle}
          src={url}
          title={`${state.symbol} chart`}
        />
      </div>
    </>
  ) : (
    <p className="tv-empty">No symbol set.</p>
  );
}

/** The pixel size of the view's own root element, followed as its tile or sub-pane resizes. */
function usePaneSize(ref: RefObject<HTMLDivElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: innerWidth,
    height: innerHeight,
  }));

  useEffect(() => {
    const update = (width: number, height: number): void => {
      const w = Math.round(width);
      const h = Math.round(height);
      if (w <= 0 || h <= 0) return;
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };
    const element = ref.current;
    if (element) update(element.clientWidth, element.clientHeight);
    const observer =
      element && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) update(box.width, box.height);
          })
        : null;
    if (element && observer) observer.observe(element);
    const onResize = (): void => update(window.innerWidth, window.innerHeight);
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== window.parent) return;
      const data = event.data as {
        method?: unknown;
        params?: { width?: unknown; height?: unknown };
      } | null;
      if (
        data?.method === "resize" &&
        typeof data.params?.width === "number" &&
        typeof data.params?.height === "number"
      ) {
        update(data.params.width, data.params.height);
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("message", onMessage);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("message", onMessage);
    };
  }, [ref]);

  return size;
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
