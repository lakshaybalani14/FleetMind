import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export interface AlertExplanationInput {
  readonly gasLevel: number;
  readonly temperature: number;
  readonly reasons: readonly string[];
  readonly firmwareFlagged: boolean;
}

const modelId = process.env.BEDROCK_MODEL_ID;
const enabled = process.env.BEDROCK_EXPLANATIONS_ENABLED === "true" && Boolean(modelId);
const bedrock = enabled
  ? new BedrockRuntimeClient({ region: process.env.AWS_REGION, maxAttempts: 1 })
  : undefined;

export function fallbackAlertExplanation(input: AlertExplanationInput): string {
  const trigger = input.reasons.length > 0
    ? input.reasons.join("; ")
    : input.firmwareFlagged
      ? "the device marked this reading unusual"
      : "an alert condition was reported";
  return `This reading triggered because ${trigger}. The MQ-2 value is a relative prototype reading, not a measurement of a specific gas or a certified safety alarm.`;
}

export async function explainAlertWithBedrock(input: AlertExplanationInput): Promise<string | undefined> {
  if (!enabled || !bedrock || !modelId) return undefined;
  try {
    const response = await bedrock.send(new ConverseCommand({
      modelId,
      system: [{ text: [
        "Explain an existing sensor threshold alert in one short, plain-language sentence.",
        "Only describe the supplied readings and rule that already triggered.",
        "Do not make a diagnosis, identify a gas, change the alert decision, or recommend actuator actions.",
        "State that MQ-2 is a relative prototype reading and not a certified safety alarm.",
      ].join(" ") }],
      messages: [{
        role: "user",
        content: [{ text: JSON.stringify({
          gasLevel: input.gasLevel,
          temperatureC: input.temperature,
          thresholdReasons: input.reasons,
          firmwareFlagged: input.firmwareFlagged,
        }) }],
      }],
      inferenceConfig: { maxTokens: 96, temperature: 0.1 },
    }), { abortSignal: AbortSignal.timeout(2500) });

    const explanation = response.output?.message?.content
      ?.flatMap((block) => block.text ? [block.text] : [])
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!explanation || explanation.length > 400) return undefined;
    return explanation;
  } catch (error) {
    console.warn("Bedrock alert explanation unavailable; keeping rule-based fallback", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return undefined;
  }
}
