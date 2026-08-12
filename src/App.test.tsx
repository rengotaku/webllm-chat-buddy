import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MLCEngine } from "@mlc-ai/web-llm";
import App, { SELECTED_MODEL_ID_STORAGE_KEY } from "./App";
import * as capabilities from "./lib/capabilities";
import * as llmEngine from "./lib/llmEngine";
import * as voiceInput from "./lib/voiceInput";
import { MODEL_CATALOG, getDefaultModelId } from "./lib/modelCatalog";

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
  const mockEngine = {
    unload: vi.fn().mockResolvedValue(undefined),
  } as unknown as MLCEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
        screen.getByText(
          "GPU memory exhausted より軽いモデルを選んでください。 ページを再読み込みしてください。"
        )
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
          "モデルの読み込みに失敗しました。 より軽いモデルを選んでください。 ページを再読み込みしてください。"
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

  describe("Case M3-1: モデル変更でエンジンが選択モデルで再初期化される", () => {
    it("初期化完了後に select で別モデルを選ぶと新しいモデルIDで初期化関数が再度呼ばれる", async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("textbox")).not.toBeDisabled();
      });

      expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(1);

      const otherModel = MODEL_CATALOG.find(
        (m) => m.id !== vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId
      );
      expect(otherModel).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, otherModel!.id);

      await waitFor(() => {
        expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(2);
      });

      expect(llmEngine.initLLMEngine).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelId: otherModel!.id })
      );
    });
  });

  describe("Case M3-2: 初期化中に別モデルへ切り替えたとき、後から完了した古い初期化結果が採用されない", () => {
    it("モデルAの初期化中にモデルBへ切り替え、Aが後から解決してもBのエンジンが採用される", async () => {
      const user = userEvent.setup();

      const engineA = { id: "engine-A" } as unknown as MLCEngine;
      const engineB = { id: "engine-B" } as unknown as MLCEngine;

      let resolveFirstInit: ((engine: MLCEngine) => void) | undefined;
      let resolveSecondInit: ((engine: MLCEngine) => void) | undefined;
      let initCallCount = 0;

      vi.mocked(llmEngine.initLLMEngine).mockImplementation(() => {
        initCallCount += 1;
        if (initCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirstInit = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveSecondInit = resolve;
        });
      });

      render(<App />);

      // Wait for the first (deferred) init to be kicked off.
      await waitFor(() => {
        expect(resolveFirstInit).toBeDefined();
      });

      const firstModelId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== firstModelId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, modelB!.id);

      // Switching models kicks off a second (also deferred) init for model B.
      await waitFor(() => {
        expect(resolveSecondInit).toBeDefined();
      });

      // The stale model-A init resolves *after* model B's init has started.
      await act(async () => {
        resolveFirstInit?.(engineA);
      });

      // Model A's late result must not have completed the loading state.
      expect(screen.getByRole("textbox")).toBeDisabled();

      // Now model B's init resolves; it is the one that should become active.
      await act(async () => {
        resolveSecondInit?.(engineB);
      });

      await waitFor(() => {
        expect(screen.getByRole("textbox")).not.toBeDisabled();
      });

      expect(select).toHaveValue(modelB!.id);

      // Confirm the *active* engine is B (not the late-resolving A) by
      // checking which engine instance is used for chat streaming.
      vi.mocked(llmEngine.streamChatResponse).mockResolvedValue("ok");

      const input = screen.getByRole("textbox");
      await user.type(input, "テスト");
      const submitButton = screen
        .getAllByRole("button")
        .find((btn) => btn.getAttribute("type") === "submit");
      await user.click(submitButton!);

      await waitFor(() => {
        expect(llmEngine.streamChatResponse).toHaveBeenCalledWith(
          engineB,
          expect.anything(),
          expect.anything()
        );
      });
    });
  });

  describe("Case M4-1: A→B→Aの切替で、1回目Aの完了が最新のA初期化を上書きしない", () => {
    it("1回目Aの完了時点では入力欄は無効のままで、3回目Aの完了後に3回目のエンジンが採用される", async () => {
      const user = userEvent.setup();

      const engineA1 = {
        id: "engine-A-1st",
        unload: vi.fn().mockResolvedValue(undefined),
      } as unknown as MLCEngine;
      const engineA3 = {
        id: "engine-A-3rd",
        unload: vi.fn().mockResolvedValue(undefined),
      } as unknown as MLCEngine;

      const deferredResolvers: Array<(engine: MLCEngine) => void> = [];
      vi.mocked(llmEngine.initLLMEngine).mockImplementation(() => {
        return new Promise<MLCEngine>((resolve) => {
          deferredResolvers.push(resolve);
        });
      });

      render(<App />);

      // (a) Startup kicks off model A's init (call #1).
      await waitFor(() => {
        expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(1);
      });

      const modelAId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== modelAId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });

      // (b) Switch to B -> call #2.
      await user.selectOptions(select, modelB!.id);
      await waitFor(() => {
        expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(2);
      });

      // (c) Switch back to A -> call #3.
      await user.selectOptions(select, modelAId!);
      await waitFor(() => {
        expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(3);
      });

      // (d) Resolve the 1st (now stale) A init.
      await act(async () => {
        deferredResolvers[0](engineA1);
      });

      // The latest (3rd) init has not completed yet: input must stay disabled.
      expect(screen.getByRole("textbox")).toBeDisabled();

      // Resolve the 3rd (latest) A init.
      await act(async () => {
        deferredResolvers[2](engineA3);
      });

      await waitFor(() => {
        expect(screen.getByRole("textbox")).not.toBeDisabled();
      });

      // Confirm the *active* engine is the 3rd run's instance (not the
      // late-resolving 1st run) by checking which engine is used to stream.
      vi.mocked(llmEngine.streamChatResponse).mockResolvedValue("ok");
      const input = screen.getByRole("textbox");
      await user.type(input, "テスト");
      const submitButton = screen
        .getAllByRole("button")
        .find((btn) => btn.getAttribute("type") === "submit");
      await user.click(submitButton!);

      await waitFor(() => {
        expect(llmEngine.streamChatResponse).toHaveBeenCalledWith(
          engineA3,
          expect.anything(),
          expect.anything()
        );
      });
    });
  });

  describe("Case M4-2: 破棄される初期化結果のエンジンも解放される", () => {
    it("モデルAの初期化開始後にBへ切替え、Aが後から解決すると破棄されたAのエンジンが解放される", async () => {
      const user = userEvent.setup();

      const engineA = {
        id: "engine-A",
        unload: vi.fn().mockResolvedValue(undefined),
      } as unknown as MLCEngine;
      const engineB = {
        id: "engine-B",
        unload: vi.fn().mockResolvedValue(undefined),
      } as unknown as MLCEngine;

      let resolveA: ((engine: MLCEngine) => void) | undefined;
      let resolveB: ((engine: MLCEngine) => void) | undefined;
      let initCallCount = 0;

      vi.mocked(llmEngine.initLLMEngine).mockImplementation(() => {
        initCallCount += 1;
        if (initCallCount === 1) {
          return new Promise<MLCEngine>((resolve) => {
            resolveA = resolve;
          });
        }
        return new Promise<MLCEngine>((resolve) => {
          resolveB = resolve;
        });
      });

      render(<App />);

      await waitFor(() => {
        expect(resolveA).toBeDefined();
      });

      const modelAId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== modelAId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, modelB!.id);

      await waitFor(() => {
        expect(resolveB).toBeDefined();
      });

      // A resolves late, after B's init has already started: A is discarded.
      await act(async () => {
        resolveA?.(engineA);
      });

      await waitFor(() => {
        expect(engineA.unload).toHaveBeenCalledTimes(1);
      });

      // Sanity: this discard path must not touch B's own engine.
      expect(engineB.unload).not.toHaveBeenCalled();
    });
  });

  describe("Case M4-3: 前エンジンの解放完了後に次の初期化が始まる", () => {
    it("モデル切替時、前エンジンのunload()が解決するまで次のinitLLMEngineが呼ばれない", async () => {
      const user = userEvent.setup();

      let resolveUnload: (() => void) | undefined;
      const engineA = {
        id: "engine-A",
        unload: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveUnload = resolve;
            })
        ),
      } as unknown as MLCEngine;
      const engineB = {
        id: "engine-B",
        unload: vi.fn().mockResolvedValue(undefined),
      } as unknown as MLCEngine;

      vi.mocked(llmEngine.initLLMEngine)
        .mockResolvedValueOnce(engineA)
        .mockResolvedValueOnce(engineB);

      render(<App />);

      // Wait for model A's load to complete.
      await waitFor(() => {
        expect(screen.getByRole("textbox")).not.toBeDisabled();
      });
      expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(1);

      const modelAId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== modelAId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, modelB!.id);

      // unload() has been invoked but has not resolved yet.
      await waitFor(() => {
        expect(engineA.unload).toHaveBeenCalledTimes(1);
      });

      // While unload() is still pending, initLLMEngine must not be called for B.
      expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(1);

      // Resolve unload(); only now should the next init proceed.
      await act(async () => {
        resolveUnload?.();
      });

      await waitFor(() => {
        expect(llmEngine.initLLMEngine).toHaveBeenCalledTimes(2);
      });
      expect(llmEngine.initLLMEngine).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelId: modelB!.id })
      );
    });
  });

  describe("Case M4-4: localStorageの未知モデルIDは既定値へフォールバックする", () => {
    it("localStorageに存在しないモデルIDが保存されている場合、既定モデルIDにフォールバックする", async () => {
      localStorage.setItem(
        SELECTED_MODEL_ID_STORAGE_KEY,
        JSON.stringify("nonexistent-model-id")
      );

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("textbox")).not.toBeDisabled();
      });

      const select = screen.getByRole("combobox", { name: "モデル" });
      expect(select).toHaveValue(getDefaultModelId());

      expect(llmEngine.initLLMEngine).not.toHaveBeenCalledWith(
        expect.objectContaining({ modelId: "nonexistent-model-id" })
      );
      expect(llmEngine.initLLMEngine).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: getDefaultModelId() })
      );
    });
  });

  // 追加テスト: M3-2 と同型の非同期競合が、resolve 時の結果採用だけでなく
  // onProgress コールバックと catch(初期化失敗) 経路でも起き得るため、
  // それぞれ独立に検証する。理由は報告の「追加したテスト」を参照。
  describe("追加: 旧モデルの非同期結果が新モデル選択後の状態を汚染しない", () => {
    it("旧モデルの進捗コールバックが新モデル選択後の進捗表示を上書きしない", async () => {
      const user = userEvent.setup();

      let firstOnProgress: ((progress: number, text: string) => void) | undefined;
      let initCallCount = 0;

      vi.mocked(llmEngine.initLLMEngine).mockImplementation((options) => {
        initCallCount += 1;
        if (initCallCount === 1) {
          firstOnProgress = options?.onProgress;
          return new Promise<MLCEngine>(() => {
            // never resolves: model A's init stays pending
          });
        }
        return new Promise<MLCEngine>(() => {
          // never resolves: model B's init also stays pending
        });
      });

      render(<App />);

      await waitFor(() => {
        expect(firstOnProgress).toBeDefined();
      });

      const firstModelId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== firstModelId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, modelB!.id);

      // Stale progress callback from model A's still-pending init fires late.
      act(() => {
        firstOnProgress?.(0.9, "旧モデルの進捗テキスト");
      });

      expect(screen.queryByText("旧モデルの進捗テキスト")).not.toBeInTheDocument();
    });

    it("旧モデルの初期化失敗が新モデルの初期化中の状態を上書きしない", async () => {
      const user = userEvent.setup();

      let rejectFirst: ((err: Error) => void) | undefined;
      let initCallCount = 0;

      vi.mocked(llmEngine.initLLMEngine).mockImplementation(() => {
        initCallCount += 1;
        if (initCallCount === 1) {
          return new Promise<MLCEngine>((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return new Promise<MLCEngine>(() => {
          // model B's init stays pending (still loading)
        });
      });

      render(<App />);

      await waitFor(() => {
        expect(rejectFirst).toBeDefined();
      });

      const firstModelId = vi.mocked(llmEngine.initLLMEngine).mock.calls[0][0]?.modelId;
      const modelB = MODEL_CATALOG.find((m) => m.id !== firstModelId);
      expect(modelB).toBeDefined();

      const select = screen.getByRole("combobox", { name: "モデル" });
      await user.selectOptions(select, modelB!.id);

      // Stale rejection from model A's init arrives after switching to B.
      await act(async () => {
        rejectFirst?.(new Error("model A failed"));
        await Promise.resolve();
      });

      // Model B's init is still pending: no error should surface, and the
      // UI should remain in the loading state (not silently "ready").
      expect(screen.queryByText(/モデルの読み込みエラー/)).not.toBeInTheDocument();
      expect(screen.getByRole("textbox")).toBeDisabled();
    });
  });
});
