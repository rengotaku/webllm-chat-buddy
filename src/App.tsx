import React, { useState, useEffect, useRef } from "react";
import { MLCEngine } from "@mlc-ai/web-llm";
import {
  hasWebGPU,
  hasSpeechRecognition,
  addMessage,
  appendToken,
  initLLMEngine,
  streamChatResponse,
  startListening,
  mergeTranscript,
  MODEL_CATALOG,
  getDefaultModelId,
  isKnownModelId,
} from "./lib";
import type { Message } from "./lib";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  AlertTriangle,
  Sparkles,
  Bot,
  User,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

export const SELECTED_MODEL_ID_STORAGE_KEY = "webllm-chat-buddy:selected-model-id";

/**
 * Unloads an MLCEngine instance, converting any failure (a thrown error or
 * a rejected promise) into a resolved promise so callers can await disposal
 * without their own try/catch.
 */
async function unloadEngineSafely(engine: MLCEngine, context: string): Promise<void> {
  try {
    await engine.unload();
  } catch (err) {
    console.error(`Failed to unload ${context} engine:`, err);
  }
}

export default function App() {
  const [webgpuSupported] = useState<boolean>(() => hasWebGPU());
  const [speechSupported] = useState<boolean>(() => hasSpeechRecognition());

  const [storedModelId, setSelectedModelId] = useLocalStorageState<string>(
    SELECTED_MODEL_ID_STORAGE_KEY,
    getDefaultModelId
  );
  // localStorage is external data: validate it against the catalog before
  // trusting it, falling back to the device-specific default for any
  // unknown (e.g. removed or corrupted) id.
  const selectedModelId = isKnownModelId(storedModelId)
    ? storedModelId
    : getDefaultModelId();

  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [isLoadingEngine, setIsLoadingEngine] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>("");
  const [engineError, setEngineError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const activeListenerRef = useRef<{ stop: () => void } | null>(null);
  const isManuallyEditedRef = useRef<boolean>(isManuallyEdited);
  const engineRef = useRef<MLCEngine | null>(null);
  // Dedupes consecutive effect runs requested for the same model id (guards
  // against React.StrictMode's double-invocation of the same effect call).
  const lastRequestedModelIdRef = useRef<string | null>(null);
  // Ever-increasing generation number, bumped each time an init run actually
  // starts. Async completion handlers below only apply their result if this
  // is still the latest generation - identifying runs by model id alone
  // cannot distinguish an A -> B -> A sequence's first and third runs, which
  // share the same model id.
  const initGenerationRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Keep isManuallyEditedRef in sync
  useEffect(() => {
    isManuallyEditedRef.current = isManuallyEdited;
  }, [isManuallyEdited]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  // Keep engineRef in sync so the init effect can dispose of the previous
  // engine without depending on `engine` directly (avoids stale closures).
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  // Engine loading, re-run whenever the selected model changes.
  // Guarded against React.StrictMode double-invocation for the same model id.
  useEffect(() => {
    if (!webgpuSupported) {
      return;
    }

    if (lastRequestedModelIdRef.current === selectedModelId) {
      return;
    }
    lastRequestedModelIdRef.current = selectedModelId;

    // Snapshot the generation and model id this init run is for. Async
    // completion handlers below must only apply their result if this is
    // still the latest generation - otherwise a slow, superseded init
    // could overwrite a newer selection.
    const myGeneration = ++initGenerationRef.current;
    const modelIdAtStart = selectedModelId;
    const engineToDispose = engineRef.current;

    setEngine(null);
    setIsLoadingEngine(true);
    setEngineError(null);
    setProgressPercent(0);
    setProgressText("");

    const startInit = () => {
      initLLMEngine({
        modelId: modelIdAtStart,
        onProgress: (progress, text) => {
          if (initGenerationRef.current !== myGeneration) return;
          setProgressPercent(Math.round(progress * 100));
          setProgressText(text);
        },
      })
        .then((engineInstance) => {
          if (initGenerationRef.current !== myGeneration) {
            // Superseded by a newer model selection: free the discarded
            // engine's GPU resources instead of leaving them dangling.
            unloadEngineSafely(engineInstance, "discarded");
            return;
          }
          setEngine(engineInstance);
          setIsLoadingEngine(false);
        })
        .catch((err: unknown) => {
          if (initGenerationRef.current !== myGeneration) {
            return;
          }
          const errorMessage = err instanceof Error ? err.message : String(err);
          const baseMessage = errorMessage || "モデルの読み込みに失敗しました。";
          setEngineError(`${baseMessage} より軽いモデルを選んでください。`);
          setIsLoadingEngine(false);
        });
    };

    if (engineToDispose) {
      // Wait for the previous engine to fully release its GPU resources
      // before requesting the next one, so the two models never briefly
      // coexist in memory (which would double peak VRAM usage).
      unloadEngineSafely(engineToDispose, "previous").then(() => {
        startInit();
      });
    } else {
      startInit();
    }
  }, [webgpuSupported, selectedModelId]);

  const handleMicToggle = () => {
    if (!speechSupported || !engine || engineError) return;

    if (isListening) {
      if (activeListenerRef.current) {
        activeListenerRef.current.stop();
        activeListenerRef.current = null;
      }
      setIsListening(false);
    } else {
      setIsListening(true);
      const listener = startListening(
        (transcript) => {
          setInputText((prev) =>
            mergeTranscript(prev, transcript, isManuallyEditedRef.current)
          );
        },
        {
          onEnd: () => {
            setIsListening(false);
            activeListenerRef.current = null;
          },
        }
      );
      activeListenerRef.current = listener;
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !engine || isGenerating || engineError) return;

    const userText = inputText.trim();
    setInputText("");
    setIsManuallyEdited(false);

    if (isListening && activeListenerRef.current) {
      activeListenerRef.current.stop();
      activeListenerRef.current = null;
      setIsListening(false);
    }

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const userMsg: Message = { id: userMsgId, role: "user", content: userText };
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "" };

    setMessages((prev) => {
      const withUser = addMessage(prev, userMsg);
      return addMessage(withUser, assistantMsg);
    });

    setIsGenerating(true);

    try {
      const chatHistory = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userText },
      ];

      await streamChatResponse(engine, chatHistory, (token) => {
        setMessages((prev) => appendToken(prev, assistantMsgId, token));
      });
    } catch (err: unknown) {
      console.error("Streaming chat error:", err);
      setMessages((prev) =>
        appendToken(prev, assistantMsgId, "\n\n[エラー: 応答生成中に問題が発生しました]")
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const isEngineReady = Boolean(engine) && !engineError && !isLoadingEngine;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center justify-between border-b pb-4 gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-6 text-indigo-600" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            WebLLM Chat Buddy
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="model-select" className="text-xs text-slate-500 shrink-0">
            モデル
          </label>
          <select
            id="model-select"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            disabled={!webgpuSupported}
            className="text-sm border border-input rounded-md px-2 py-1 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {MODEL_CATALOG.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}（約{model.vramMB}MB）
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* WebGPU Unsupported Warning */}
      {!webgpuSupported && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800">
              WebGPU 非対応ブラウザ
            </h3>
            <p className="text-sm text-amber-700 mt-1">
              このブラウザはWebGPUに対応していません。WebGPU対応のブラウザ（Chrome, Edge,
              Safari Preview等）をご利用ください。
            </p>
          </div>
        </div>
      )}

      {/* Engine Loading Progress */}
      {webgpuSupported && isLoadingEngine && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-600" />
              AI モデルをダウンロード中 ({progressPercent}%)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">
              {progressText || "モデルデータを初期化中..."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Engine Error */}
      {engineError && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 flex items-start gap-3">
          <XCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">モデルの読み込みエラー</h3>
            <p className="text-sm text-red-700 mt-1">
              {engineError} ページを再読み込みしてください。
            </p>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col min-h-[500px]">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            チャット履歴
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[600px]">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-slate-400 py-12">
              <p className="text-sm">
                {!webgpuSupported
                  ? "WebGPU非対応ブラウザのため機能は利用できません。"
                  : engineError
                    ? "モデルの初期化に失敗しました。ページをリロードしてください。"
                    : isLoadingEngine
                      ? "モデルのロードを待機中..."
                      : "メッセージを入力するか、マイクボタンで話しかけてください。"}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <Bot className="size-4 text-indigo-600" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {msg.content ||
                    (msg.role === "assistant" && isGenerating && "Thinking...")}
                </div>
                {msg.role === "user" && (
                  <div className="size-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <User className="size-4 text-slate-600" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <CardFooter className="border-t p-3">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 w-full">
            {/* Speech Recognition Mic Button */}
            <div className="relative">
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                disabled={
                  !webgpuSupported || !speechSupported || !isEngineReady || isGenerating
                }
                onClick={handleMicToggle}
                title={
                  !webgpuSupported
                    ? "WebGPU非対応のため利用できません"
                    : !speechSupported
                      ? "このブラウザは音声認識機能(Speech Recognition API)に対応していません"
                      : engineError
                        ? "モデルの初期化に失敗しているため利用できません"
                        : isListening
                          ? "音声認識を停止"
                          : "音声認識を開始"
                }
              >
                {isListening ? (
                  <MicOff className="size-4 animate-pulse" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            </div>

            {/* Input Text Box */}
            <Input
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setIsManuallyEdited(true);
              }}
              placeholder={
                !webgpuSupported
                  ? "WebGPU非対応のため入力できません"
                  : engineError
                    ? "モデルの読み込みに失敗しました。ページを再読み込みしてください"
                    : !speechSupported
                      ? "メッセージを入力... (音声非対応)"
                      : "メッセージを入力、またはマイクで音声入力..."
              }
              disabled={!webgpuSupported || !isEngineReady || isGenerating}
              className="flex-1"
            />

            {/* Send Button */}
            <Button
              type="submit"
              disabled={
                !webgpuSupported || !isEngineReady || isGenerating || !inputText.trim()
              }
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
