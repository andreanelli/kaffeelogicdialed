import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const notes = z.string().max(10000).default("");
export const point = z.object({
  time: z.number().finite().min(0).max(3600),
  temperature: z.number().finite().min(0).max(350),
  fan: z.number().finite().min(0).max(30000).optional(),
});
export const curve = z
  .array(point)
  .min(2)
  .max(5000)
  .refine(
    (p) => p.every((v, i) => !i || v.time > p[i - 1].time),
    "Curve times must be strictly increasing",
  );
export const beanSchema = z.object({
  name: text,
  origin: text,
  process: text,
  variety: z.string().max(200).default(""),
  stock: z.number().finite().min(0).max(1000000).nullable(),
  notes,
});
export const profileSchema = z.object({
  name: text,
  description: notes,
  level: z.number().finite().min(0.1).max(5.9),
  points: curve,
  changeNote: z.string().trim().min(1).max(1000),
});
export const roastSchema = z
  .object({
    name: text,
    beanId: text,
    profileVersionId: text,
    experimentId: z.string().nullable().default(null),
    roastedAt: z.string().datetime({ offset: true }),
    greenWeight: z.number().finite().positive().max(1000),
    roastedWeight: z.number().finite().positive().max(1000),
    duration: z.number().finite().positive().max(3600),
    firstCrack: z.number().finite().positive().nullable().default(null),
    level: z.number().finite().min(0.1).max(5.9),
    notes,
    points: curve.nullable().default(null),
    fileId: z.string().nullable().default(null),
  })
  .refine(
    (r) => r.roastedWeight <= r.greenWeight,
    "Roasted weight cannot exceed green weight",
  )
  .refine(
    (r) => r.firstCrack === null || r.firstCrack < r.duration,
    "First crack must precede roast end",
  )
  .refine(
    (r) => !r.points || r.points.at(-1).time <= r.duration,
    "Curve cannot extend beyond roast duration",
  );
export const cuppingSchema = z.object({
  roastId: text,
  taster: text,
  tastedAt: z.string().datetime({ offset: true }),
  score: z.number().finite().min(0).max(100),
  aroma: z.number().min(0).max(10),
  acidity: z.number().min(0).max(10),
  sweetness: z.number().min(0).max(10),
  body: z.number().min(0).max(10),
  finish: z.number().min(0).max(10),
  notes,
});
export const experimentSchema = z.object({
  name: text,
  hypothesis: z.string().trim().min(1).max(5000),
  variable: text,
  status: z.enum(["planned", "active", "complete"]).default("planned"),
  conclusion: notes,
});
