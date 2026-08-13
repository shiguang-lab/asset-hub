export type ModelQuality = "economy" | "balanced" | "best";

export interface ModelPolicy {
  readonly quality: ModelQuality;
  readonly requireStructuredOutput: boolean;
}

export const defaultModelPolicy: ModelPolicy = {
  quality: "balanced",
  requireStructuredOutput: true,
};
