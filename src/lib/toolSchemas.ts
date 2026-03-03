import { z } from "zod";

export const addIndicatorSchema = z.object({
  type: z.enum(["SMA", "EMA", "RSI"]),
  period: z.number().int().min(2).max(400)
});

export const removeIndicatorSchema = z.object({
  id: z.string().min(1)
});

export const pointSchema = z.object({
  time: z.number().int(),
  price: z.number()
});

export const addDrawingSchema = z.object({
  type: z.enum(["HLINE", "TRENDLINE", "ZONE"]),
  points: z.array(pointSchema).min(1).max(4),
  style: z
    .object({
      color: z.string().optional(),
      lineWidth: z.number().int().min(1).max(8).optional(),
      fillColor: z.string().optional()
    })
    .optional()
});

export const removeDrawingSchema = z.object({
  id: z.string().min(1)
});

export const annotateSchema = z.object({
  time: z.number().int(),
  price: z.number(),
  text: z.string().min(1).max(240)
});

export const computeSchema = z.object({
  fn: z.enum(["supportResistance", "swingHighLow", "rsiDivergence", "volatility"]),
  params: z.record(z.string(), z.unknown()).optional()
});

export const toolSchemas = {
  addIndicator: addIndicatorSchema,
  removeIndicator: removeIndicatorSchema,
  addDrawing: addDrawingSchema,
  removeDrawing: removeDrawingSchema,
  annotate: annotateSchema,
  compute: computeSchema
} as const;

export type ToolName = keyof typeof toolSchemas;
