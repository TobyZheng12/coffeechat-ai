import type { AITaskKind, AITaskMap } from "./tasks";

export interface AIProvider {
  /** Shown in the UI next to generated content, e.g. "Claude Opus 5.5". */
  readonly label: string;
  /** True when no external model is called (offline demo templates). */
  readonly offline: boolean;
  run<K extends AITaskKind>(kind: K, input: AITaskMap[K]["input"]): Promise<AITaskMap[K]["output"]>;
  /** Reads the text in a screenshot. Only available with a real model. */
  transcribeImage?(base64: string, mediaType: "image/png" | "image/jpeg" | "image/webp"): Promise<string>;
}

export type AIErrorCode =
  | "not_configured"
  | "rate_limited"
  | "usage_limit"
  | "refused"
  | "truncated"
  | "invalid_output"
  | "unavailable";

/** Errors with messages that are safe and useful to show to the user. */
export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}
