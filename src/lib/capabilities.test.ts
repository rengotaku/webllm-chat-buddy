import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hasWebGPU,
  hasWebGPUAdapter,
  hasSpeechRecognition,
  hasShaderF16,
  resetShaderF16Cache,
} from "./capabilities";

describe("capabilities", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    // Reset mocks before each test
  });

  describe("Case 1-1: WebGPU 対応判定", () => {
    it("returns true when navigator.gpu is defined", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, gpu: {} },
        writable: true,
        configurable: true,
      });

      expect(hasWebGPU()).toBe(true);
    });
  });

  describe("Case 1-2: WebGPU 非対応判定", () => {
    it("returns false when navigator.gpu is undefined", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, gpu: undefined },
        writable: true,
        configurable: true,
      });

      expect(hasWebGPU()).toBe(false);
    });
  });

  describe("Case 1-3: Web Speech API 対応判定（ベンダープレフィックス込み）", () => {
    it("returns true when webkitSpeechRecognition is defined even if SpeechRecognition is undefined", () => {
      const mockWindow = {
        webkitSpeechRecognition: class MockSpeechRecognition {},
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        writable: true,
        configurable: true,
      });

      expect(hasSpeechRecognition()).toBe(true);
    });
  });

  describe("Case 1-4: Web Speech API 非対応判定", () => {
    it("returns false when neither SpeechRecognition nor webkitSpeechRecognition is defined", () => {
      const mockWindow = {};

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        writable: true,
        configurable: true,
      });

      expect(hasSpeechRecognition()).toBe(false);
    });
  });

  describe("Case F1: shader-f16 の対応判定", () => {
    beforeEach(() => {
      resetShaderF16Cache();
    });

    describe("Case F1-1: 対応している場合", () => {
      it("returns true when the adapter reports the shader-f16 feature", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi.fn().mockResolvedValue({
                features: new Set(["shader-f16"]),
              }),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasShaderF16()).resolves.toBe(true);
      });
    });

    describe("Case F1-2: 非対応の場合", () => {
      it("returns false when the adapter's features do not include shader-f16", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi.fn().mockResolvedValue({
                features: new Set(["texture-compression-bc"]),
              }),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasShaderF16()).resolves.toBe(false);
      });
    });

    describe("Case F1-3: アダプタが取得できない場合", () => {
      it("returns false without throwing when requestAdapter resolves to null", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi.fn().mockResolvedValue(null),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasShaderF16()).resolves.toBe(false);
      });
    });

    describe("Case F1-4: WebGPU 自体が無い場合", () => {
      it("returns false without throwing when navigator.gpu is undefined", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: { ...originalNavigator, gpu: undefined },
          writable: true,
          configurable: true,
        });

        await expect(hasShaderF16()).resolves.toBe(false);
      });
    });

    describe("Case F1-5: requestAdapter() が reject する場合", () => {
      it("returns false without propagating the rejection", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi
                .fn()
                .mockRejectedValue(new Error("adapter request failed")),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasShaderF16()).resolves.toBe(false);
      });
    });
  });

  describe("Case A1: WebGPU アダプタ取得可否の判定", () => {
    describe("Case A1-1: アダプタが取得できる場合", () => {
      it("returns true when requestAdapter resolves to an adapter", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi.fn().mockResolvedValue({
                features: new Set(["shader-f16"]),
              }),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasWebGPUAdapter()).resolves.toBe(true);
      });
    });

    describe("Case A1-2: アダプタが null の場合", () => {
      it("returns false when requestAdapter resolves to null", async () => {
        // issue #18 の症状そのもの: navigator.gpu があっても
        // requestAdapter() が null を返す環境では WebGPU は実際には
        // 使えない。navigator.gpu の有無だけでは判定できない。
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi.fn().mockResolvedValue(null),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasWebGPUAdapter()).resolves.toBe(false);
      });
    });

    describe("Case A1-3: navigator.gpu が無い場合", () => {
      it("returns false without throwing when navigator.gpu is undefined", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: { ...originalNavigator, gpu: undefined },
          writable: true,
          configurable: true,
        });

        await expect(hasWebGPUAdapter()).resolves.toBe(false);
      });
    });

    describe("Case A1-4: requestAdapter() が reject する場合", () => {
      it("returns false without propagating the rejection", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            ...originalNavigator,
            gpu: {
              requestAdapter: vi
                .fn()
                .mockRejectedValue(new Error("adapter request failed")),
            },
          },
          writable: true,
          configurable: true,
        });

        await expect(hasWebGPUAdapter()).resolves.toBe(false);
      });
    });
  });
});
