import { describe, it, expect, vi } from "vitest";
import type { MLCEngine } from "@mlc-ai/web-llm";
import { initLLMEngine, streamChatResponse } from "./llmEngine";
import * as capabilities from "./capabilities";

vi.mock("./capabilities", () => ({
  hasWebGPU: vi.fn(),
  hasSpeechRecognition: vi.fn(),
}));

describe("llmEngine", () => {
  it("throws error when WebGPU is not supported during initLLMEngine", async () => {
    vi.mocked(capabilities.hasWebGPU).mockReturnValue(false);

    await expect(initLLMEngine()).rejects.toThrow(
      "WebGPU is not supported in this browser environment."
    );
  });

  it("throws error when engine is not provided to streamChatResponse", async () => {
    await expect(
      streamChatResponse(null as unknown as MLCEngine, [], vi.fn())
    ).rejects.toThrow("MLCEngine instance is required for streaming chat.");
  });
});
