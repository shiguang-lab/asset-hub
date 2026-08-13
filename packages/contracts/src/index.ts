import { z } from "zod";

export const serviceHealthSchema = z.object({
  service: z.string().min(1),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
