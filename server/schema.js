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
    pilotTrialId: z.string().nullable().default(null),
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
const tastingScores = {
  liking: z.number().min(1).max(5).nullable().default(null),
  targetMatch: z.number().min(1).max(5).nullable().default(null),
  score: z.number().finite().min(0).max(100).nullable().default(null),
  aroma: z.number().min(0).max(10).nullable().default(null),
  acidity: z.number().min(0).max(10).nullable().default(null),
  sweetness: z.number().min(0).max(10).nullable().default(null),
  body: z.number().min(0).max(10).nullable().default(null),
  finish: z.number().min(0).max(10).nullable().default(null),
};
export const tastingVoteSchema = z.object({ taster: text, ...tastingScores });
export const cuppingSchema = z
  .object({
    roastId: text,
    taster: z.string().trim().max(200).default(""),
    tastedAt: z.string().datetime({ offset: true }),
    brewId: z.string().nullable().default(null),
    protocolVersion: z
      .literal("dialed-personal-v1")
      .default("dialed-personal-v1"),
    blindCode: z.string().max(100).default(""),
    descriptors: z.string().max(2000).default(""),
    ...tastingScores,
    votes: z.array(tastingVoteSchema).min(1).max(20).optional(),
    notes,
  })
  .superRefine((data, ctx) => {
    if (!data.votes && !data.taster)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taster"],
        message: "Enter a taster",
      });
    if (data.votes) {
      const names = data.votes.map((v) => v.taster.toLocaleLowerCase());
      if (new Set(names).size !== names.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["votes"],
          message: "Each taster needs a unique name",
        });
    }
  })
  .transform((data) => {
    if (!data.votes) return data;
    const averages = Object.fromEntries(
      Object.keys(tastingScores).map((key) => {
        const values = data.votes.map((v) => v[key]).filter((v) => v !== null);
        return [
          key,
          values.length
            ? Math.round(
                (values.reduce((sum, v) => sum + v, 0) / values.length) * 100,
              ) / 100
            : null,
        ];
      }),
    );
    return {
      ...data,
      ...averages,
      taster: data.votes.map((v) => v.taster).join(", "),
    };
  });
export const experimentSchema = z.object({
  referenceIds: z
    .array(z.string().min(1).max(200))
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate references")
    .default([]),
  name: text,
  hypothesis: z.string().trim().min(1).max(5000),
  variable: text,
  status: z.enum(["planned", "active", "complete"]).default("planned"),
  conclusion: notes,
});
