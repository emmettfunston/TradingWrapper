import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { AgentToolCall, Candle } from "@/lib/types";
import { toolSchemas, ToolName } from "@/lib/toolSchemas";
import { rsiDivergence, supportResistance, swingHighLow, volatility } from "@/lib/ta";

const requestSchema = z.object({
  message: z.string().min(1).max(1000),
  context: z.object({
    symbol: z.string(),
    timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
    candles: z
      .array(
        z.object({
          time: z.number(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number()
        })
      )
      .min(20)
      .max(800),
    indicators: z.array(z.any()),
    drawings: z.array(z.any()),
    annotations: z.array(z.any()),
    userSettings: z.record(z.string(), z.unknown()).optional()
  })
});

const bannedIntent = /(what should i buy|what should i sell|guaranteed profit|best trade|exact entry|signals to buy|signals to sell)/i;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "addIndicator",
      description: "Add an indicator to the local chart model.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["SMA", "EMA", "RSI"] },
          period: { type: "number" }
        },
        required: ["type", "period"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "removeIndicator",
      description: "Remove an indicator by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "addDrawing",
      description: "Add a drawing (HLINE, TRENDLINE, ZONE).",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["HLINE", "TRENDLINE", "ZONE"] },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                price: { type: "number" }
              },
              required: ["time", "price"],
              additionalProperties: false
            }
          },
          style: {
            type: "object",
            properties: {
              color: { type: "string" },
              lineWidth: { type: "number" },
              fillColor: { type: "string" }
            },
            additionalProperties: false
          }
        },
        required: ["type", "points"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "removeDrawing",
      description: "Remove drawing by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "annotate",
      description: "Add an annotation to chart.",
      parameters: {
        type: "object",
        properties: {
          time: { type: "number" },
          price: { type: "number" },
          text: { type: "string" }
        },
        required: ["time", "price", "text"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compute",
      description:
        "Run deterministic analysis functions before deciding drawings/annotations. Use this for supportResistance, swingHighLow, rsiDivergence, volatility.",
      parameters: {
        type: "object",
        properties: {
          fn: { type: "string", enum: ["supportResistance", "swingHighLow", "rsiDivergence", "volatility"] },
          params: { type: "object", additionalProperties: true }
        },
        required: ["fn"],
        additionalProperties: false
      }
    }
  }
];

function runCompute(fn: string, params: Record<string, unknown> | undefined, candles: Candle[]): unknown {
  if (fn === "supportResistance") {
    return supportResistance(candles, {
      window: Number(params?.window ?? 3),
      thresholdPct: Number(params?.thresholdPct ?? 0.002),
      maxLevels: Number(params?.maxLevels ?? 6)
    });
  }

  if (fn === "swingHighLow") {
    return swingHighLow(candles, Number(params?.window ?? 3));
  }

  if (fn === "rsiDivergence") {
    return rsiDivergence(candles, Number(params?.period ?? 14), Number(params?.window ?? 3));
  }

  if (fn === "volatility") {
    return volatility(candles, Number(params?.lookback ?? 100));
  }

  throw new Error(`Unsupported compute fn: ${fn}`);
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function validateToolCall(name: ToolName, args: Record<string, unknown>) {
  return toolSchemas[name].safeParse(args);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { reasoning: "", toolCalls: [], finalMessage: "Invalid request payload.", refused: false },
      { status: 400 }
    );
  }

  const { message, context } = parsed.data;

  if (bannedIntent.test(message)) {
    return NextResponse.json({
      reasoning: "I can’t provide buy/sell recommendations or guaranteed-profit strategies.",
      toolCalls: [],
      finalMessage:
        "I can help with educational chart analysis instead, such as support/resistance mapping, volatility summaries, and indicator overlays.",
      refused: true
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        reasoning: "",
        toolCalls: [],
        finalMessage: "OPENAI_API_KEY is not set. Add it to .env.local to enable the agent.",
        refused: false
      },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const system = [
    "You are an educational chart-analysis copilot.",
    "Never provide financial advice or trade recommendations.",
    "Only use the provided tools to propose chart edits.",
    "Use compute() to derive levels/signals deterministically before drawing when relevant.",
    "Keep outputs concise and practical."
  ].join(" ");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        `User intent: ${message}`,
        "Current chart context JSON:",
        JSON.stringify(context)
      ].join("\n")
    }
  ];

  const allCalls: AgentToolCall[] = [];
  const reasoningParts: string[] = [];
  let finalMessage = "";

  for (let i = 0; i < 4; i += 1) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages,
      tools,
      tool_choice: "auto"
    });

    const assistant = completion.choices[0]?.message;
    if (!assistant) break;

    if (assistant.content) {
      reasoningParts.push(assistant.content);
    }

    if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
      finalMessage = assistant.content || "Applied the analysis plan.";
      break;
    }

    messages.push({
      role: "assistant",
      content: assistant.content || "",
      tool_calls: assistant.tool_calls
    });

    for (const tc of assistant.tool_calls) {
      if (tc.type !== "function") {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: "Unsupported non-function tool call" })
        });
        continue;
      }

      const name = tc.function.name as ToolName;
      const args = parseArgs(tc.function.arguments);

      if (!(name in toolSchemas)) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
        });
        continue;
      }

      const validated = validateToolCall(name, args);
      if (!validated.success) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: validated.error.flatten() })
        });
        continue;
      }

      let result: unknown = { ok: true, queued: true };
      if (name === "compute") {
        const computeArgs = validated.data as { fn: string; params?: Record<string, unknown> };
        result = runCompute(computeArgs.fn, computeArgs.params, context.candles);
      }

      allCalls.push({ name, args: validated.data, result });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ ok: true, result })
      });
    }
  }

  if (!finalMessage) {
    finalMessage = allCalls.length
      ? `Prepared ${allCalls.length} tool call(s) for the chart model.`
      : "No chart changes were needed from the request.";
  }

  const reasoning =
    reasoningParts.join("\n").trim() ||
    "I analyzed the chart context and generated a structured plan using the available chart tools.";

  return NextResponse.json({
    reasoning,
    toolCalls: allCalls,
    finalMessage,
    refused: false
  });
}
