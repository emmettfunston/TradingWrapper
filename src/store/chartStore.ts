import { create } from "zustand";
import { AgentToolCall, Annotation, Candle, ChartModel, Drawing, Indicator, Timeframe } from "@/lib/types";
import { makeId } from "@/lib/id";

type ChartStore = ChartModel & {
  setSymbol: (symbol: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setCandles: (candles: Candle[]) => void;
  addIndicator: (indicator: Omit<Indicator, "id">) => string;
  removeIndicator: (id: string) => void;
  addDrawing: (drawing: Omit<Drawing, "id">) => string;
  removeDrawing: (id: string) => void;
  annotate: (annotation: Omit<Annotation, "id">) => string;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  setSelectedDrawingTool: (tool: Drawing["type"] | null) => void;
  log: (source: "USER" | "AGENT" | "SYSTEM", message: string) => void;
  applyToolCalls: (calls: AgentToolCall[]) => void;
};

const defaultIndicators: Indicator[] = [
  { id: "ind_sma20", type: "SMA", period: 20, color: "#f59e0b" },
  { id: "ind_rsi14", type: "RSI", period: 14, color: "#8b5cf6" }
];

export const useChartStore = create<ChartStore>((set, get) => ({
  symbol: "BTCUSDT",
  timeframe: "1h",
  candles: [],
  indicators: defaultIndicators,
  drawings: [],
  annotations: [],
  uiState: {
    loading: false,
    selectedDrawingTool: null
  },
  actionLog: [],

  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setCandles: (candles) => set({ candles }),
  addIndicator: (indicator) => {
    const id = makeId("ind");
    set((state) => ({ indicators: [...state.indicators, { ...indicator, id }] }));
    return id;
  },
  removeIndicator: (id) => set((state) => ({ indicators: state.indicators.filter((i) => i.id !== id) })),
  addDrawing: (drawing) => {
    const id = makeId("draw");
    set((state) => ({ drawings: [...state.drawings, { ...drawing, id }] }));
    return id;
  },
  removeDrawing: (id) => set((state) => ({ drawings: state.drawings.filter((d) => d.id !== id) })),
  annotate: (annotation) => {
    const id = makeId("note");
    set((state) => ({ annotations: [...state.annotations, { ...annotation, id }] }));
    return id;
  },
  setLoading: (loading) => set((state) => ({ uiState: { ...state.uiState, loading } })),
  setError: (error) => set((state) => ({ uiState: { ...state.uiState, error } })),
  setSelectedDrawingTool: (tool) => set((state) => ({ uiState: { ...state.uiState, selectedDrawingTool: tool } })),
  log: (source, message) =>
    set((state) => ({
      actionLog: [{ id: makeId("log"), time: Date.now(), source, message }, ...state.actionLog].slice(0, 150)
    })),

  applyToolCalls: (calls) => {
    for (const call of calls) {
      if (call.name === "addIndicator") {
        const args = call.args as { type?: Indicator["type"]; period?: number };
        if (args.type && typeof args.period === "number") {
          get().addIndicator({ type: args.type, period: args.period });
          get().log("AGENT", `Added ${args.type}(${args.period})`);
        }
      }

      if (call.name === "removeIndicator") {
        const args = call.args as { id?: string };
        if (args.id) {
          get().removeIndicator(args.id);
          get().log("AGENT", `Removed indicator ${args.id}`);
        }
      }

      if (call.name === "addDrawing") {
        const args = call.args as Omit<Drawing, "id">;
        if (args.type && Array.isArray(args.points)) {
          get().addDrawing({ type: args.type, points: args.points, style: args.style });
          get().log("AGENT", `Added drawing ${args.type}`);
        }
      }

      if (call.name === "removeDrawing") {
        const args = call.args as { id?: string };
        if (args.id) {
          get().removeDrawing(args.id);
          get().log("AGENT", `Removed drawing ${args.id}`);
        }
      }

      if (call.name === "annotate") {
        const args = call.args as Omit<Annotation, "id">;
        if (typeof args.time === "number" && typeof args.price === "number" && typeof args.text === "string") {
          get().annotate(args);
          get().log("AGENT", `Annotated: ${args.text}`);
        }
      }

      if (call.name === "compute") {
        const args = call.args as { fn?: string };
        get().log("AGENT", `Computed ${args.fn ?? "analysis"}`);
      }
    }
  }
}));
