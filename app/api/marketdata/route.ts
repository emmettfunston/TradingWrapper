import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const getSchema = z.object({
  symbol: z.string().default("BTCUSDT"),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
  limit: z.coerce.number().int().min(50).max(1000).default(500)
});

const csvBodySchema = z.object({
  csv: z.string().min(10)
});

export async function GET(req: NextRequest) {
  const parsed = getSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { symbol, timeframe, limit } = parsed.data;

  const hosts = ["https://api.binance.com", "https://data-api.binance.vision"];
  let lastError = "Unknown market data error";

  for (const host of hosts) {
    const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastError = `Binance host ${host} failed: ${res.status}`;
        continue;
      }

      const raw = (await res.json()) as Array<[number, string, string, string, string, string]>;
      const candles = raw.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5])
      }));

      return NextResponse.json({ source: host.includes("vision") ? "binance-vision" : "binance", candles });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown market data error";
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = csvBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const lines = parsed.data.csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must include header + rows" }, { status: 400 });
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    time: headers.findIndex((h) => ["time", "timestamp", "date"].includes(h)),
    open: headers.findIndex((h) => h === "open"),
    high: headers.findIndex((h) => h === "high"),
    low: headers.findIndex((h) => h === "low"),
    close: headers.findIndex((h) => h === "close"),
    volume: headers.findIndex((h) => ["volume", "vol"].includes(h))
  };

  if (Object.values(idx).some((v) => v < 0)) {
    return NextResponse.json({ error: "CSV missing required columns: time, open, high, low, close, volume" }, { status: 400 });
  }

  const candles = lines
    .slice(1)
    .map((line) => line.split(","))
    .map((cols) => {
      const rawTime = cols[idx.time];
      const numeric = Number(rawTime);
      const timestamp = Number.isFinite(numeric)
        ? numeric > 1e12
          ? Math.floor(numeric / 1000)
          : Math.floor(numeric)
        : Math.floor(new Date(rawTime).getTime() / 1000);

      return {
        time: timestamp,
        open: Number(cols[idx.open]),
        high: Number(cols[idx.high]),
        low: Number(cols[idx.low]),
        close: Number(cols[idx.close]),
        volume: Number(cols[idx.volume])
      };
    })
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  return NextResponse.json({ source: "csv", candles });
}
