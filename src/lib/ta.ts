import { Candle } from "@/lib/types";

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;

  for (let i = period; i < values.length; i += 1) {
    const prev = out[i - 1] ?? values[i - 1];
    out[i] = values[i] * k + prev * (1 - k);
  }
  return out;
}

export function rsi(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export type Pivot = {
  index: number;
  time: number;
  price: number;
  kind: "HIGH" | "LOW";
};

export function swingHighLow(candles: Candle[], window = 3): Pivot[] {
  const pivots: Pivot[] = [];
  if (candles.length < window * 2 + 1) return pivots;

  for (let i = window; i < candles.length - window; i += 1) {
    const center = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= center.high) isHigh = false;
      if (candles[j].low <= center.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) pivots.push({ index: i, time: center.time, price: center.high, kind: "HIGH" });
    if (isLow) pivots.push({ index: i, time: center.time, price: center.low, kind: "LOW" });
  }

  return pivots;
}

export function supportResistance(
  candles: Candle[],
  opts?: { window?: number; thresholdPct?: number; maxLevels?: number }
): Array<{ level: number; touches: number; kind: "SUPPORT" | "RESISTANCE" }> {
  const window = opts?.window ?? 3;
  const thresholdPct = opts?.thresholdPct ?? 0.002;
  const maxLevels = opts?.maxLevels ?? 8;
  const pivots = swingHighLow(candles, window);

  const groups: Array<{ level: number; touches: number; kind: "SUPPORT" | "RESISTANCE" }> = [];

  for (const p of pivots) {
    const kind = p.kind === "LOW" ? "SUPPORT" : "RESISTANCE";
    const found = groups.find(
      (g) => g.kind === kind && Math.abs(g.level - p.price) / Math.max(p.price, 1e-9) <= thresholdPct
    );

    if (found) {
      found.level = (found.level * found.touches + p.price) / (found.touches + 1);
      found.touches += 1;
    } else {
      groups.push({ level: p.price, touches: 1, kind });
    }
  }

  return groups.sort((a, b) => b.touches - a.touches).slice(0, maxLevels);
}

export function volatility(candles: Candle[], lookback = 100): { atrLike: number; stdevReturns: number } {
  const data = candles.slice(-lookback);
  if (data.length < 2) return { atrLike: 0, stdevReturns: 0 };

  const trs: number[] = [];
  const rets: number[] = [];
  for (let i = 1; i < data.length; i += 1) {
    const prev = data[i - 1];
    const cur = data[i];
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    trs.push(tr);
    rets.push((cur.close - prev.close) / prev.close);
  }

  const atrLike = trs.reduce((a, b) => a + b, 0) / trs.length;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;

  return { atrLike, stdevReturns: Math.sqrt(variance) };
}

export function rsiDivergence(
  candles: Candle[],
  period = 14,
  window = 3
): Array<{ type: "BULLISH" | "BEARISH"; atTime: number; detail: string }> {
  const closes = candles.map((c) => c.close);
  const rsiValues = rsi(closes, period);
  const pivots = swingHighLow(candles, window);

  const highs = pivots.filter((p) => p.kind === "HIGH");
  const lows = pivots.filter((p) => p.kind === "LOW");
  const out: Array<{ type: "BULLISH" | "BEARISH"; atTime: number; detail: string }> = [];

  if (highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    const rsiA = rsiValues[a.index] ?? null;
    const rsiB = rsiValues[b.index] ?? null;
    if (rsiA !== null && rsiB !== null && b.price > a.price && rsiB < rsiA) {
      out.push({
        type: "BEARISH",
        atTime: b.time,
        detail: "Price made higher high while RSI made lower high"
      });
    }
  }

  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    const rsiA = rsiValues[a.index] ?? null;
    const rsiB = rsiValues[b.index] ?? null;
    if (rsiA !== null && rsiB !== null && b.price < a.price && rsiB > rsiA) {
      out.push({
        type: "BULLISH",
        atTime: b.time,
        detail: "Price made lower low while RSI made higher low"
      });
    }
  }

  return out;
}
