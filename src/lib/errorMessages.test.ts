import { describe, it, expect } from "vitest";
import { classifyEngineError } from "./errorMessages";

describe("classifyEngineError", () => {
  describe("Case 1: メモリ不足と推定されるエラー", () => {
    it("classifies memory-related errors and preserves the raw message", () => {
      const result = classifyEngineError(new Error("GPU memory exhausted"));

      expect(result.category).toBe("memory");
      expect(result.headline).toBe("GPUメモリが不足している可能性があります。");
      expect(result.actions).toContain("より軽いモデルを選んでください。");
      expect(result.rawMessage).toBe("GPU memory exhausted");
    });
  });

  describe("Case 2: ネットワーク系と推定されるエラー", () => {
    it("classifies network-related errors", () => {
      const result = classifyEngineError(
        new Error("Failed to fetch model weights from CDN")
      );

      expect(result.category).toBe("network");
      expect(result.headline).toBe("モデルのダウンロードに失敗しました。");
      expect(result.actions).toContain("ネットワーク接続を確認してください。");
    });
  });

  describe("Case 3: 分類不能・非 Error インスタンス（空文字列）", () => {
    it("keeps the existing fallback headline for an empty string", () => {
      const result = classifyEngineError("");

      expect(result.category).toBe("unknown");
      expect(result.headline).toBe("モデルの読み込みに失敗しました。");
      expect(result.rawMessage).toBe("");
    });
  });

  describe("Case 4: 分類不能・具体的なメッセージを持つエラー", () => {
    it("keeps the raw message for an unclassifiable error", () => {
      const result = classifyEngineError(
        new Error("Unexpected shader compilation failure")
      );

      expect(result.category).toBe("unknown");
      expect(result.headline).toBe("モデルの初期化に失敗しました。");
      expect(result.rawMessage).toBe("Unexpected shader compilation failure");
    });
  });
});
