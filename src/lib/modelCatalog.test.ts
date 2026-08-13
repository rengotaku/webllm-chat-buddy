import { describe, it, expect, afterEach } from "vitest";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import {
  MODEL_CATALOG,
  MOBILE_DEFAULT_MODEL_ID,
  DESKTOP_DEFAULT_MODEL_ID,
  getDefaultModelId,
  isKnownModelId,
} from "./modelCatalog";

describe("modelCatalog", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("Case M1-1: userAgentData でモバイル判定", () => {
    it("navigator.userAgentData.mobile が true のときモバイル既定モデルIDを返す", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, userAgentData: { mobile: true } },
        writable: true,
        configurable: true,
      });

      expect(getDefaultModelId()).toBe(MOBILE_DEFAULT_MODEL_ID);
    });
  });

  describe("Case M1-2: userAgentData 非対応時の UA 文字列フォールバック", () => {
    it("userAgentData が undefined かつ UA に Android を含む場合モバイル既定モデルIDを返す", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          userAgentData: undefined,
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
        },
        writable: true,
        configurable: true,
      });

      expect(getDefaultModelId()).toBe(MOBILE_DEFAULT_MODEL_ID);
    });
  });

  describe("Case M1-3: デスクトップ判定", () => {
    it("userAgentData.mobile が false かつ UA がデスクトップ相当のときデスクトップ既定モデルIDを返す", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          userAgentData: { mobile: false },
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
        writable: true,
        configurable: true,
      });

      expect(getDefaultModelId()).toBe(DESKTOP_DEFAULT_MODEL_ID);
    });
  });

  describe("Case M2-1: カタログの全モデルIDが WebLLM に実在する", () => {
    it("カタログの各 id が prebuiltAppConfig.model_list に存在する", () => {
      const knownIds = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));

      for (const entry of MODEL_CATALOG) {
        expect(knownIds.has(entry.id)).toBe(true);
      }
    });
  });

  describe("Case M2-2: 要求メモリが正の数である", () => {
    it("カタログの各エントリの vramMB が 0 より大きい", () => {
      for (const entry of MODEL_CATALOG) {
        expect(entry.vramMB).toBeGreaterThan(0);
      }
    });
  });

  // 追加テスト: downloadMB は選択UIに表示され、初回の待ち時間を決める値。
  // 欠損・0 のまま追加されると「DL 0MB」と表示され、利用者が待ち時間を
  // 見誤る（vramMB と違い、値が無くても型エラーにならず気づけない）。
  describe("追加: ダウンロード量 (downloadMB) の妥当性", () => {
    it("カタログの各エントリの downloadMB が 0 より大きい", () => {
      for (const entry of MODEL_CATALOG) {
        expect(entry.downloadMB).toBeGreaterThan(0);
      }
    });

    // カタログの並び順は UI の選択肢順にそのまま反映される。
    // 「初回の待ち時間が軽い順」という契約が崩れると、回線が細い利用者が
    // 一覧の上から選んで最も重いモデルを掴む。並び順は型では守れない。
    it("カタログが downloadMB の昇順に並んでいる", () => {
      const sizes = MODEL_CATALOG.map((e) => e.downloadMB);
      const sorted = [...sizes].sort((a, b) => a - b);
      expect(sizes).toEqual(sorted);
    });
  });

  // 追加テスト: isKnownModelId は localStorage 由来のIDをカタログと照合する
  // ためのバリデータ本体。App.test.tsx の Case M4-4 は結合レベルでこの関数の
  // false 分岐（未知ID）を間接的に検証しているが、関数単体で true/false 双方の
  // 分岐を直接検証しておく。理由は報告の「追加したテスト」を参照。
  describe("追加: isKnownModelId によるモデルID検証", () => {
    it("カタログに実在するIDに対して true を返す", () => {
      expect(isKnownModelId(MODEL_CATALOG[0].id)).toBe(true);
    });

    it("カタログに存在しないIDに対して false を返す", () => {
      expect(isKnownModelId("nonexistent-model-id")).toBe(false);
    });
  });
});
