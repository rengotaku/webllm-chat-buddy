import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import type { InitProgressReport } from "@mlc-ai/web-llm";
import { hasWebGPU } from "./capabilities";

export const DEFAULT_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

export type ProgressCallback = (progress: number, text: string) => void;
export type TokenCallback = (token: string) => void;

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMEngineOptions {
  modelId?: string;
  onProgress?: ProgressCallback;
}

/**
 * Initializes and creates an MLCEngine instance for browser LLM inference.
 * Throws an error if WebGPU is not supported.
 */
export async function initLLMEngine(options: LLMEngineOptions = {}): Promise<MLCEngine> {
  if (!hasWebGPU()) {
    throw new Error("WebGPU is not supported in this browser environment.");
  }

  /* v8 ignore start - WebGPU実機および大容量モデルロードを伴うため単体テスト対象外 */
  const modelId = options.modelId || DEFAULT_MODEL_ID;

  const engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report: InitProgressReport) => {
      if (options.onProgress) {
        // report.progress is a float between 0 and 1
        options.onProgress(report.progress, report.text);
      }
    },
  });

  return engine;
  /* v8 ignore stop */
}

/**
 * Streams chat response from the MLCEngine.
 * Invokes onToken for each generated token chunk.
 */
export async function streamChatResponse(
  engine: MLCEngine,
  messages: LLMMessage[],
  onToken: TokenCallback
): Promise<string> {
  if (!engine) {
    throw new Error("MLCEngine instance is required for streaming chat.");
  }

  /* v8 ignore start - WebGPU実機でのLLM生成ストリーミングを伴うため単体テスト対象外 */
  const completion = await engine.chat.completions.create({
    messages,
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta?.content || "";
    if (delta) {
      fullResponse += delta;
      onToken(delta);
    }
  }

  return fullResponse;
  /* v8 ignore stop */
}
