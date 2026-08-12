import { describe, it, expect, beforeEach } from "vitest";
import { hasWebGPU, hasSpeechRecognition } from "./capabilities";

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
});
