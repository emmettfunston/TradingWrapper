"use client";

import { FormEvent, useMemo, useState } from "react";
import { AgentResponseBody } from "@/lib/types";
import { useChartStore } from "@/store/chartStore";

type ChatMsg = { role: "user" | "agent" | "error"; text: string };

export function AgentPanel() {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);

  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const candles = useChartStore((s) => s.candles);
  const indicators = useChartStore((s) => s.indicators);
  const drawings = useChartStore((s) => s.drawings);
  const annotations = useChartStore((s) => s.annotations);

  const model = useMemo(
    () => ({
      symbol,
      timeframe,
      candles: candles.slice(-300),
      indicators,
      drawings,
      annotations
    }),
    [symbol, timeframe, candles, indicators, drawings, annotations]
  );

  const applyToolCalls = useChartStore((s) => s.applyToolCalls);
  const log = useChartStore((s) => s.log);

  const placeholders = useMemo(
    () => [
      "mark support and resistance near current range",
      "add EMA(50) and annotate last swing high",
      "summarize volatility of last 100 candles"
    ],
    []
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setBusy(true);
    setChat((prev) => [{ role: "user", text: message }, ...prev]);
    log("USER", message);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: model })
      });

      const data = (await res.json()) as AgentResponseBody;
      if (!res.ok) throw new Error(data.finalMessage || "Agent error");

      if (data.toolCalls.length) {
        applyToolCalls(data.toolCalls);
      }

      const summary = `${data.reasoning}\n\n${data.finalMessage}`.trim();
      setChat((prev) => [{ role: data.refused ? "error" : "agent", text: summary }, ...prev]);
      log("AGENT", data.finalMessage || "Agent finished");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unknown error";
      setChat((prev) => [{ role: "error", text }, ...prev]);
      log("SYSTEM", `Agent error: ${text}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel chat">
      <div className="panel-title">AI Chart Agent</div>
      <div className="chat-log">
        {chat.map((m, i) => (
          <div key={`${m.role}_${i}`} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={onSubmit}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholders[0]} />
        <div className="chat-actions">
          <span className="kv">Educational analysis only. No trading recommendations.</span>
          <button className="primary" disabled={busy} type="submit">
            {busy ? "Running..." : "Run Agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
