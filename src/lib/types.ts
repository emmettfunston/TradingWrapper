export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorType = "SMA" | "EMA" | "RSI";

export type Indicator = {
  id: string;
  type: IndicatorType;
  period: number;
  color?: string;
};

export type DrawingType = "HLINE" | "TRENDLINE" | "ZONE";

export type DrawingPoint = {
  time: number;
  price: number;
};

export type Drawing = {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  style?: {
    color?: string;
    lineWidth?: number;
    fillColor?: string;
  };
};

export type Annotation = {
  id: string;
  time: number;
  price: number;
  text: string;
};

export type ActionLogItem = {
  id: string;
  time: number;
  source: "USER" | "AGENT" | "SYSTEM";
  message: string;
};

export type UiState = {
  loading: boolean;
  error?: string;
  selectedDrawingTool: DrawingType | null;
};

export type ChartModel = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  indicators: Indicator[];
  drawings: Drawing[];
  annotations: Annotation[];
  uiState: UiState;
  actionLog: ActionLogItem[];
};

export type ComputeFn = "supportResistance" | "swingHighLow" | "rsiDivergence" | "volatility";

export type AgentToolCall = {
  name: "addIndicator" | "removeIndicator" | "addDrawing" | "removeDrawing" | "annotate" | "compute";
  args: Record<string, unknown>;
  result?: unknown;
};

export type AgentRequestBody = {
  message: string;
  context: {
    symbol: string;
    timeframe: Timeframe;
    candles: Candle[];
    indicators: Indicator[];
    drawings: Drawing[];
    annotations: Annotation[];
    userSettings?: Record<string, unknown>;
  };
};

export type AgentResponseBody = {
  reasoning: string;
  toolCalls: AgentToolCall[];
  finalMessage: string;
  refused?: boolean;
};
