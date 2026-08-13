export interface ModelCatalogEntry {
  id: string;
  label: string;
  /**
   * WebLLM が要求する GPU メモリ量 (MB)。
   * `@mlc-ai/web-llm` の `prebuiltAppConfig.model_list[].vram_required_MB` 実測値を丸めたもの。
   */
  vramMB: number;
  /**
   * 初回に実際にダウンロードされる重みファイルの合計サイズ (MB)。
   * HuggingFace `mlc-ai/<model-id>` の `.bin` シャード合計の実測値。
   *
   * 🔴 vramMB とは別物で、比例もしない。ユーザーが「待ち時間」として体感するのは
   * こちらであり、選択UIに vramMB だけを出すと回線が細い利用者を誤導する
   * （例: Qwen2.5 0.5B は vram 945MB で一覧上は重く見えるが、
   *   ダウンロードは 265MB で全モデル中もっとも軽い）。
   */
  downloadMB: number;
  /**
   * このモデルが WebGPU の `shader-f16` 機能を必須とするか。
   * `q4f16_*` 量子化のモデルは対応必須（true）、`q4f32_*` は不要（false）。
   * 同一モデルでも f32 版は要求 GPU メモリがわずかに増える代わりに、
   * `shader-f16` 非対応の環境でも動く（issue #15）。
   *
   * 🔴 手動で付与する値なので `id` の実態とズレうる。ズレると
   * 「非対応環境に f16 モデルを出す」か「使えるモデルを隠す」ことになり、
   * どちらもエラーが出ずに間違った選択肢が並ぶ。Case F2-2 で
   * `id` に含まれる量子化サフィックスとの一致を検証している。
   */
  requiresF16: boolean;
}

/**
 * 選択可能なモデルの一覧。ダウンロード量の軽い順に並べる
 * （初回の待ち時間が選択の主要因になるため）。
 *
 * 🔴 `shader-f16` 非対応環境向けの `q4f32` モデルは、対応する `q4f16` モデルと
 * 実際のダウンロードバイト数がほぼ同一（4bit量子化された重み本体は同一で、
 * スケール値の精度のみが異なるため）。追加する際は既存エントリの直後に置き、
 * downloadMB 昇順を崩さないこと。
 */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    vramMB: 945,
    downloadMB: 265,
    requiresF16: true,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 0.5B (f32)",
    vramMB: 1060,
    downloadMB: 265,
    requiresF16: false,
  },
  {
    id: "gemma3-1b-it-q4f16_1-MLC",
    label: "Gemma3 1B",
    vramMB: 711,
    downloadMB: 537,
    requiresF16: true,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    vramMB: 879,
    downloadMB: 663,
    requiresF16: true,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    vramMB: 1630,
    downloadMB: 828,
    requiresF16: true,
  },
];

export const MOBILE_DEFAULT_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const DESKTOP_DEFAULT_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

/**
 * 指定されたIDが `MODEL_CATALOG` に実在するモデルIDかどうかを判定する。
 * localStorage 等の外部データを信頼する前の検証に用いる。
 */
export function isKnownModelId(id: string): boolean {
  return MODEL_CATALOG.some((entry) => entry.id === id);
}

/**
 * `shader-f16` の対応状況に応じて選択可能なモデル一覧を返す。
 * 非対応環境では `requiresF16` なモデルを除外する
 * （ダウンロードを完走させてからシェーダーのコンパイルで必ず失敗させないため。issue #15）。
 */
export function getSelectableModels(hasShaderF16Support: boolean): ModelCatalogEntry[] {
  if (hasShaderF16Support) {
    return MODEL_CATALOG;
  }
  return MODEL_CATALOG.filter((entry) => !entry.requiresF16);
}

interface NavigatorUAData {
  mobile: boolean;
}

function isMobileUserAgentString(userAgent: string): boolean {
  return /Android|iPhone|iPad|Mobile/.test(userAgent);
}

/**
 * 端末種別のみに基づく既定モデルIDを返す。
 * `navigator.userAgentData`（Client Hints API）を優先し、
 * 未対応環境では UA 文字列でフォールバック判定する。
 */
function getDeviceDefaultModelId(): string {
  if (typeof navigator === "undefined") {
    return DESKTOP_DEFAULT_MODEL_ID;
  }

  const nav = navigator as Navigator & { userAgentData?: NavigatorUAData };

  const isMobile =
    nav.userAgentData !== undefined
      ? nav.userAgentData.mobile
      : isMobileUserAgentString(nav.userAgent || "");

  return isMobile ? MOBILE_DEFAULT_MODEL_ID : DESKTOP_DEFAULT_MODEL_ID;
}

/**
 * 既定モデルIDを返す。端末種別（`navigator.userAgentData` 優先、
 * 未対応環境では UA 文字列でフォールバック）から決めるのが基本だが、
 * `hasShaderF16Support` が `false` かつ端末既定が `shader-f16` 必須モデルの
 * 場合は、カタログ内で最初に見つかった非必須モデルへフォールバックする
 * （既定モデルが f16 のままだと起動直後に必ず初期化が失敗するため。issue #15）。
 *
 * @param hasShaderF16Support - `shader-f16` の対応状況。省略時は `true`
 *   （既存呼び出し元の挙動を変えないための既定値）。
 */
export function getDefaultModelId(hasShaderF16Support = true): string {
  const deviceDefaultId = getDeviceDefaultModelId();

  if (hasShaderF16Support) {
    return deviceDefaultId;
  }

  const fallback = MODEL_CATALOG.find((entry) => !entry.requiresF16);
  return fallback ? fallback.id : deviceDefaultId;
}
