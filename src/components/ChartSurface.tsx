"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import { useChartStore } from "@/store/chartStore";
import { ema, rsi, sma } from "@/lib/ta";
import { Drawing } from "@/lib/types";

type Ohlcv = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const indicatorColors = ["#f59e0b", "#38bdf8", "#22c55e", "#f472b6", "#fb7185"];

function drawOverlays(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  candleSeries: ISeriesApi<"Candlestick">,
  drawings: Drawing[],
  annotations: Array<{ time: number; price: number; text: string }>
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const toX = (time: number): number | null => chart.timeScale().timeToCoordinate(time as Time);
  const toY = (price: number): number | null => candleSeries.priceToCoordinate(price);

  for (const drawing of drawings) {
    const color = drawing.style?.color ?? "#2dd4bf";
    const lineWidth = drawing.style?.lineWidth ?? 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.fillStyle = drawing.style?.fillColor ?? "rgba(45,212,191,0.14)";

    if (drawing.type === "HLINE" && drawing.points[0]) {
      const y = toY(drawing.points[0].price);
      if (y === null) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (drawing.type === "TRENDLINE" && drawing.points.length >= 2) {
      const a = drawing.points[0];
      const b = drawing.points[1];
      const x1 = toX(a.time);
      const y1 = toY(a.price);
      const x2 = toX(b.time);
      const y2 = toY(b.price);
      if ([x1, y1, x2, y2].some((v) => v === null)) continue;
      ctx.beginPath();
      ctx.moveTo(x1!, y1!);
      ctx.lineTo(x2!, y2!);
      ctx.stroke();
    }

    if (drawing.type === "ZONE" && drawing.points.length >= 2) {
      const a = drawing.points[0];
      const b = drawing.points[1];
      const x1 = toX(Math.min(a.time, b.time));
      const x2 = toX(Math.max(a.time, b.time));
      const y1 = toY(Math.max(a.price, b.price));
      const y2 = toY(Math.min(a.price, b.price));
      if ([x1, y1, x2, y2].some((v) => v === null)) continue;
      const w = Math.max(2, x2! - x1!);
      const h = Math.max(2, y2! - y1!);
      ctx.fillRect(x1!, y1!, w, h);
      ctx.strokeRect(x1!, y1!, w, h);
    }
  }

  for (const note of annotations) {
    const x = toX(note.time);
    const y = toY(note.price);
    if (x === null || y === null) continue;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px sans-serif";
    ctx.fillText(note.text, x + 6, y - 6);
  }
}

export function ChartSurface() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainChartRef = useRef<HTMLDivElement | null>(null);
  const rsiChartRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const candles = useChartStore((s) => s.candles);
  const indicators = useChartStore((s) => s.indicators);
  const drawings = useChartStore((s) => s.drawings);
  const annotations = useChartStore((s) => s.annotations);

  const [hover, setHover] = useState<{ time: number; o: number; h: number; l: number; c: number; v: number } | null>(null);

  const ohlcv = useMemo<Ohlcv[]>(
    () => candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    [candles]
  );

  useEffect(() => {
    if (!mainChartRef.current || !rsiChartRef.current || ohlcv.length === 0) return;

    const mainChart = createChart(mainChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#c9d8ee" },
      autoSize: true,
      rightPriceScale: { borderColor: "rgba(148,163,184,0.25)" },
      timeScale: { borderColor: "rgba(148,163,184,0.25)", timeVisible: true },
      grid: {
        horzLines: { color: "rgba(148,163,184,0.12)" },
        vertLines: { color: "rgba(148,163,184,0.12)" }
      },
      crosshair: { mode: 1 }
    });

    const rsiChart = createChart(rsiChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#c9d8ee" },
      autoSize: true,
      rightPriceScale: { borderColor: "rgba(148,163,184,0.25)", scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: "rgba(148,163,184,0.25)", timeVisible: true },
      grid: {
        horzLines: { color: "rgba(148,163,184,0.1)" },
        vertLines: { color: "rgba(148,163,184,0.1)" }
      }
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#f43f5e"
    });
    candleSeries.setData(ohlcv);

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#64748b"
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      ohlcv.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.38)" : "rgba(244,63,94,0.38)"
      }))
    );

    const closes = ohlcv.map((c) => c.close);

    const indicatorSeries: ISeriesApi<"Line">[] = [];
    let rsiLine: ISeriesApi<"Line"> | null = null;

    indicators.forEach((ind, idx) => {
      if (ind.type === "SMA") {
        const line = mainChart.addSeries(LineSeries, { color: ind.color ?? indicatorColors[idx % indicatorColors.length], lineWidth: 2 });
        const values = sma(closes, ind.period);
        line.setData(ohlcv.map((c, i) => ({ time: c.time, value: values[i] ?? NaN })).filter((d) => Number.isFinite(d.value)));
        indicatorSeries.push(line);
      }

      if (ind.type === "EMA") {
        const line = mainChart.addSeries(LineSeries, { color: ind.color ?? indicatorColors[idx % indicatorColors.length], lineWidth: 2 });
        const values = ema(closes, ind.period);
        line.setData(ohlcv.map((c, i) => ({ time: c.time, value: values[i] ?? NaN })).filter((d) => Number.isFinite(d.value)));
        indicatorSeries.push(line);
      }

      if (ind.type === "RSI") {
        rsiLine = rsiChart.addSeries(LineSeries, { color: ind.color ?? "#a78bfa", lineWidth: 2 });
        const values = rsi(closes, ind.period);
        rsiLine.setData(ohlcv.map((c, i) => ({ time: c.time, value: values[i] ?? NaN })).filter((d) => Number.isFinite(d.value)));
      }
    });

    if (!rsiLine) {
      rsiLine = rsiChart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2 });
      const values = rsi(closes, 14);
      rsiLine.setData(ohlcv.map((c, i) => ({ time: c.time, value: values[i] ?? NaN })).filter((d) => Number.isFinite(d.value)));
    }

    const upperBand = rsiChart.addSeries(LineSeries, { color: "rgba(148,163,184,0.5)", lineWidth: 1 });
    const lowerBand = rsiChart.addSeries(LineSeries, { color: "rgba(148,163,184,0.5)", lineWidth: 1 });
    upperBand.setData(ohlcv.map((c) => ({ time: c.time, value: 70 })));
    lowerBand.setData(ohlcv.map((c) => ({ time: c.time, value: 30 })));

    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        rsiChart.timeScale().setVisibleLogicalRange(range);
      }
    });

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeries);
      if (!data || !("open" in data)) return;
      setHover({
        time: Number(param.time),
        o: data.open,
        h: data.high,
        l: data.low,
        c: data.close,
        v: ohlcv.find((x) => x.time === param.time)?.volume ?? 0
      });
    });

    const overlay = overlayRef.current;
    if (overlay) {
      const resizeOverlay = () => {
        const bounds = mainChartRef.current?.getBoundingClientRect();
        if (!bounds || !overlay) return;
        overlay.width = bounds.width * window.devicePixelRatio;
        overlay.height = bounds.height * window.devicePixelRatio;
        overlay.style.width = `${bounds.width}px`;
        overlay.style.height = `${bounds.height}px`;
        const ctx = overlay.getContext("2d");
        if (ctx) ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        drawOverlays(overlay, mainChart, candleSeries, drawings, annotations);
      };

      resizeOverlay();
      const ro = new ResizeObserver(resizeOverlay);
      if (mainChartRef.current) ro.observe(mainChartRef.current);

      const redraw = () => drawOverlays(overlay, mainChart, candleSeries, drawings, annotations);
      mainChart.timeScale().subscribeVisibleTimeRangeChange(redraw);

      return () => {
        ro.disconnect();
        mainChart.timeScale().unsubscribeVisibleTimeRangeChange(redraw);
        indicatorSeries.forEach((s) => mainChart.removeSeries(s));
        mainChart.removeSeries(candleSeries);
        mainChart.removeSeries(volumeSeries);
        mainChart.remove();
        rsiChart.remove();
      };
    }

    return () => {
      indicatorSeries.forEach((s) => mainChart.removeSeries(s));
      mainChart.removeSeries(candleSeries);
      mainChart.removeSeries(volumeSeries);
      mainChart.remove();
      rsiChart.remove();
    };
  }, [ohlcv, indicators, drawings, annotations]);

  if (!candles.length) {
    return <div style={{ padding: 24 }}>Loading chart data...</div>;
  }

  return (
    <div ref={containerRef} className="chart-wrap">
      {hover ? (
        <div className="tooltip">
          <div>{new Date(hover.time * 1000).toLocaleString()}</div>
          <div>O: {hover.o.toFixed(2)} H: {hover.h.toFixed(2)} L: {hover.l.toFixed(2)} C: {hover.c.toFixed(2)}</div>
          <div>V: {hover.v.toFixed(2)}</div>
        </div>
      ) : null}
      <div ref={mainChartRef} style={{ position: "relative", height: "75%" }} />
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "75%", pointerEvents: "none", zIndex: 2 }}
      />
      <div ref={rsiChartRef} style={{ height: "25%", borderTop: "1px solid rgba(148,163,184,0.28)" }} />
    </div>
  );
}
