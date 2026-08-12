export interface ModelCatalogEntry {
  id: string;
  label: string;
  vramMB: number;
}

/**
 * 選択可能なモデルの一覧。要求メモリ (vramMB) は
 * `@mlc-ai/web-llm` の `prebuiltAppConfig.model_list[].vram_required_MB` 実測値を丸めたもの。
 */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  { id: "gemma3-1b-it-q4f16_1-MLC", label: "Gemma3 1B", vramMB: 711 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", vramMB: 879 },
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0.5B", vramMB: 945 },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", vramMB: 1630 },
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
