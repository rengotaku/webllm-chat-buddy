import { describe, it, expect, vi, beforeEach } from "vitest";
import { startListening, mergeTranscript } from "./voiceInput";

describe("voiceInput", () => {
  let mockRecognitionInstance: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onend: (() => void) | null;
  };
  let MockSpeechRecognition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRecognitionInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      onresult: null,
      onerror: null,
      onend: null,
    };

    MockSpeechRecognition = vi.fn().mockImplementation(function () {
      return mockRecognitionInstance;
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        SpeechRecognition: MockSpeechRecognition,
      },
      writable: true,
      configurable: true,
    });
  });

  describe("Case 3-1: 音声認識結果がテキスト入力に反映される", () => {
    it("triggers onTranscript callback with transcript when onresult fires", () => {
      const onTranscript = vi.fn();
      const listener = startListening(onTranscript);

      expect(MockSpeechRecognition).toHaveBeenCalled();
      expect(mockRecognitionInstance.start).toHaveBeenCalled();

      // Simulate SpeechRecognition onresult event
      const mockEvent = {
        results: [[{ transcript: "こんにちは" }]],
      };

      mockRecognitionInstance.onresult!(mockEvent);

      expect(onTranscript).toHaveBeenCalledWith("こんにちは");

      listener.stop();
      expect(mockRecognitionInstance.stop).toHaveBeenCalled();
    });
  });

  describe("Case 3-2: 認識開始後、結果が返る前にユーザーが入力欄を手動編集しても、後から来た認識結果は編集後の値を上書きしない", () => {
    it("does not silently overwrite manually edited input with incoming transcript result", () => {
      let currentInputValue = "";
      let isManuallyEdited = false;

      const handleTranscript = (transcript: string) => {
        currentInputValue = mergeTranscript(
          currentInputValue,
          transcript,
          isManuallyEdited
        );
      };

      // Step (a): Start voice recognition
      startListening(handleTranscript);

      // Step (b): User manually edits input while waiting for result
      currentInputValue = "手動入力";
      isManuallyEdited = true;

      // Step (c): Delayed onresult event fires with recognition result
      const mockEvent = {
        results: [[{ transcript: "認識結果" }]],
      };
      mockRecognitionInstance.onresult!(mockEvent);

      // Expectation: The manually typed input is preserved and not silently overwritten by "認識結果"
      expect(currentInputValue).not.toBe("認識結果");
      expect(currentInputValue).toContain("手動入力");
    });
  });

  describe("Case 3-3: 音声認識が自然終了(onend)した際に onEnd コールバックが通知される", () => {
    it("calls onEnd callback when recognition fires onend event", () => {
      const onTranscript = vi.fn();
      const onEnd = vi.fn();

      startListening(onTranscript, { onEnd });

      expect(mockRecognitionInstance.onend).toBeTypeOf("function");
      mockRecognitionInstance.onend!();

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });
});
