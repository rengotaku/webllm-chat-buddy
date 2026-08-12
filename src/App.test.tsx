import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MLCEngine } from "@mlc-ai/web-llm";
import App from "./App";
import * as capabilities from "./lib/capabilities";
import * as llmEngine from "./lib/llmEngine";
import * as voiceInput from "./lib/voiceInput";

vi.mock("./lib/capabilities", () => ({
  hasWebGPU: vi.fn(),
  hasSpeechRecognition: vi.fn(),
}));

vi.mock("./lib/llmEngine", () => ({
  initLLMEngine: vi.fn(),
  streamChatResponse: vi.fn(),
  DEFAULT_MODEL_ID: "mock-model",
}));

vi.mock("./lib/voiceInput", async () => {
  const actual =
    await vi.importActual<typeof import("./lib/voiceInput")>("./lib/voiceInput");
  return {
    ...actual,
    startListening: vi.fn(),
  };
});

describe("App", () => {
  const mockEngine = {} as unknown as MLCEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(capabilities.hasWebGPU).mockReturnValue(true);
    vi.mocked(capabilities.hasSpeechRecognition).mockReturnValue(true);
    vi.mocked(llmEngine.initLLMEngine).mockResolvedValue(mockEngine);
  });

  it("WebGPU非対応時に代替メッセージが表示されチャット機能が無効化されること", () => {
    vi.mocked(capabilities.hasWebGPU).mockReturnValue(false);

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
    vi.mocked(capabilities.hasSpeechRecognition).mockReturnValue(false);

    render(<App />);

    const micButton = screen.getByTitle(
      "このブラウザは音声認識機能(Speech Recognition API)に対応していません"
    );
    expect(micButton).toBeDisabled();
  });

  it("エンジン初期化失敗時にエラーメッセージが表示され送信操作が無効化されること", async () => {
    vi.mocked(llmEngine.initLLMEngine).mockRejectedValue(
      new Error("GPU memory exhausted")
    );

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("GPU memory exhausted ページを再読み込みしてください。")
      ).toBeInTheDocument();
    });

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();

    const sendButton = screen.getByRole("button", { name: "" });
    expect(sendButton).toBeDisabled();
  });

  it("メッセージ送信によりストリーミングでアシスタント応答が逐次表示されること", async () => {
    const user = userEvent.setup();
    vi.mocked(llmEngine.streamChatResponse).mockImplementation(
      async (_engine, _messages, onToken) => {
        onToken("こんにちは");
        onToken("！");
        return "こんにちは！";
      }
    );

    render(<App />);

    // Wait for engine to initialize
    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });

    const input = screen.getByRole("textbox");
    await user.type(input, "テスト質問");

    const form = input.closest("form");
    expect(form).not.toBeNull();

    const submitButton = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("type") === "submit");
    expect(submitButton).toBeDefined();

    await user.click(submitButton!);

    // Verify user message and assistant streaming response
    await waitFor(() => {
      expect(screen.getByText("テスト質問")).toBeInTheDocument();
      expect(screen.getByText("こんにちは！")).toBeInTheDocument();
    });

    expect(llmEngine.streamChatResponse).toHaveBeenCalledTimes(1);
  });

  it("マイクボタンのクリックで音声認識が開始・停止すること", async () => {
    const user = userEvent.setup();
    const mockStop = vi.fn();
    let capturedOnTranscript: ((text: string) => void) | undefined;
    let capturedOptions: voiceInput.VoiceInputOptions | undefined;

    vi.mocked(voiceInput.startListening).mockImplementation((onTranscript, options) => {
      capturedOnTranscript = onTranscript;
      capturedOptions = options;
      return { stop: mockStop };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });

    const micButton = screen.getByTitle("音声認識を開始");
    expect(micButton).toBeInTheDocument();

    // Start listening
    await user.click(micButton);
    expect(voiceInput.startListening).toHaveBeenCalledTimes(1);

    // Simulate transcript
    act(() => {
      if (capturedOnTranscript) {
        capturedOnTranscript("音声入力テスト");
      }
    });

    expect(screen.getByRole("textbox")).toHaveValue("音声入力テスト");

    // Toggle stop mic
    await user.click(screen.getByTitle("音声認識を停止"));
    expect(mockStop).toHaveBeenCalledTimes(1);

    // Simulate onEnd callback
    act(() => {
      if (capturedOptions?.onEnd) {
        capturedOptions.onEnd();
      }
    });

    await waitFor(() => {
      expect(screen.getByTitle("音声認識を開始")).toBeInTheDocument();
    });
  });

  it("React.StrictMode下でもエンジン初期化が二重実行されないこと", async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });

    expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(1);
  });

  it("Errorインスタンスでない値で初期化が失敗した場合にフォールバックメッセージが表示されること", async () => {
    vi.mocked(llmEngine.initLLMEngine).mockRejectedValue("");

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "モデルの読み込みに失敗しました。ページを再読み込みしてください。 ページを再読み込みしてください。"
        )
      ).toBeInTheDocument();
    });
  });

  it("音声認識中にメッセージを送信すると音声認識が自動停止すること", async () => {
    const user = userEvent.setup();
    const mockStop = vi.fn();
    vi.mocked(voiceInput.startListening).mockImplementation(() => ({
      stop: mockStop,
    }));

    let resolveStream: ((value: string) => void) | undefined;
    vi.mocked(llmEngine.streamChatResponse).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });

    const micButton = screen.getByTitle("音声認識を開始");
    await user.click(micButton);
    expect(voiceInput.startListening).toHaveBeenCalledTimes(1);

    const input = screen.getByRole("textbox");
    await user.type(input, "音声認識中の送信テスト");

    const submitButton = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("type") === "submit");
    await user.click(submitButton!);

    // Sending a message while listening should stop the active listener automatically
    expect(mockStop).toHaveBeenCalledTimes(1);

    // Assistant message has no content yet: "Thinking..." indicator should be shown
    await waitFor(() => {
      expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });

    resolveStream?.("完了");
  });
});
