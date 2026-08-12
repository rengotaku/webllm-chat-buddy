import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import * as capabilities from "./lib/capabilities";

vi.mock("./lib/capabilities", () => ({
  hasWebGPU: vi.fn(),
  hasSpeechRecognition: vi.fn(),
}));

vi.mock("./lib/llmEngine", () => ({
  initLLMEngine: vi.fn().mockImplementation(() => new Promise(() => {})),
  streamChatResponse: vi.fn(),
  DEFAULT_MODEL_ID: "mock-model",
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("WebGPU非対応時に代替メッセージが表示されチャット機能が無効化されること", () => {
    vi.mocked(capabilities.hasWebGPU).mockReturnValue(false);
    vi.mocked(capabilities.hasSpeechRecognition).mockReturnValue(true);

    render(<App />);

    expect(
      screen.getByText(
        "このブラウザはWebGPUに対応していません。WebGPU対応のブラウザ（Chrome, Edge, Safari Preview等）をご利用ください。"
      )
    ).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("Web Speech API非対応時にマイクボタンがdisabledになること", () => {
    vi.mocked(capabilities.hasWebGPU).mockReturnValue(true);
    vi.mocked(capabilities.hasSpeechRecognition).mockReturnValue(false);

    render(<App />);

    const micButton = screen.getByTitle(
      "このブラウザは音声認識機能(Speech Recognition API)に対応していません"
    );
    expect(micButton).toBeDisabled();
  });
});
