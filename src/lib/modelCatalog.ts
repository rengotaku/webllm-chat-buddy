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
}

/**
 * 選択可能なモデルの一覧。ダウンロード量の軽い順に並べる
 * （初回の待ち時間が選択の主要因になるため）。
 */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    vramMB: 945,
    downloadMB: 265,
  },
  { id: "gemma3-1b-it-q4f16_1-MLC", label: "Gemma3 1B", vramMB: 711, downloadMB: 537 },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    vramMB: 879,
    downloadMB: 663,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    vramMB: 1630,
    downloadMB: 828,
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

interface NavigatorUAData {
  mobile: boolean;
}

function isMobileUserAgentString(userAgent: string): boolean {
  return /Android|iPhone|iPad|Mobile/.test(userAgent);
}

/**
 * 端末種別に応じた既定モデルIDを返す。
 * `navigator.userAgentData`（Client Hints API）を優先し、
 * 未対応環境では UA 文字列でフォールバック判定する。
 */
export function getDefaultModelId(): string {
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
