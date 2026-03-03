"use client";

import { useEffect } from "react";
import { AgentPanel } from "@/components/AgentPanel";
import { ChartSurface } from "@/components/ChartSurface";
import { Timeframe } from "@/lib/types";
import { useChartStore } from "@/store/chartStore";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Page() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const actionLog = useChartStore((s) => s.actionLog);
  const loading = useChartStore((s) => s.uiState.loading);
  const error = useChartStore((s) => s.uiState.error);
  const indicators = useChartStore((s) => s.indicators);
  const drawings = useChartStore((s) => s.drawings);

  const setSymbol = useChartStore((s) => s.setSymbol);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const setCandles = useChartStore((s) => s.setCandles);
  const addDrawing = useChartStore((s) => s.addDrawing);
  const setLoading = useChartStore((s) => s.setLoading);
  const setError = useChartStore((s) => s.setError);
  const log = useChartStore((s) => s.log);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const res = await fetch(`/api/marketdata?symbol=${symbol}&timeframe=${timeframe}&limit=500`);
        if (!res.ok) throw new Error("Failed to load market data");
        const data = await res.json();
        if (!canceled) {
          setCandles(data.candles ?? []);
          log("SYSTEM", `Loaded ${symbol} ${timeframe} candles (${data.candles?.length ?? 0})`);
        }
      } catch (err) {
        if (!canceled) {
          const msg = err instanceof Error ? err.message : "Data error";
          setError(msg);
          log("SYSTEM", msg);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [symbol, timeframe, setCandles, setLoading, setError, log]);

  function addQuickHline() {
    const candles = useChartStore.getState().candles;
    if (!candles.length) return;
    const last = candles[candles.length - 1];
    addDrawing({ type: "HLINE", points: [{ time: last.time, price: last.close }] });
    log("USER", "Added horizontal line at last close");
  }

  return (
    <main>
      <div className="app-shell">
        <section className="panel chart-panel">
          <div className="toolbar">
            <div className="brand-wrap">
              <div className="brand-title">TradingView-lite Wrapper</div>
              <div className="brand-subtitle">Educational chart analysis workspace</div>
            </div>

            <div className="toolbar-controls">
              <label className="field">
                <span className="kv">Symbol</span>
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="kv">Timeframe</span>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
                  {timeframes.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </label>

              <button className="ghost" onClick={addQuickHline}>
                Quick HLine
              </button>

              <span className="tag">Indicators: {indicators.map((i) => `${i.type}(${i.period})`).join(", ")}</span>
              <span className="tag">Drawings: {drawings.length}</span>
              {loading ? <span className="tag">Loading...</span> : null}
              {error ? <span className="tag danger">{error}</span> : null}
            </div>
          </div>

          <div className="disclaimer">
            Educational tooling only. No financial advice, investment recommendations, or trade execution.
          </div>

          <ChartSurface />
        </section>

        <aside className="sidebar">
          <AgentPanel />
          <div className="panel">
            <div className="panel-title">Action Log</div>
            <div className="log">
              {actionLog.map((item) => (
                <div key={item.id} className="log-item">
                  <div>
                    [{new Date(item.time).toLocaleTimeString()}] <strong>{item.source}</strong>: {item.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
