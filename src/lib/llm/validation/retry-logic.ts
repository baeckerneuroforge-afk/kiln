import type { LlmMessage } from "../types";

export function buildValidationRetryMessages(
  messages: LlmMessage[],
  invalidOutput: string,
  validationError: string,
): LlmMessage[] {
  return [
    ...messages,
    { role: "assistant", content: invalidOutput },
    {
      role: "user",
      content: [
        "Validation failed.",
        `Error: ${validationError}`,
        "Retry and return only valid JSON that satisfies the requested schema.",
      ].join("\n"),
    },
  ];
}

export class LlmValidationError extends Error {
  readonly attempts: number;

  constructor(message: string, attempts: number) {
    super(message);
    this.name = "LlmValidationError";
    this.attempts = attempts;
  }
}
