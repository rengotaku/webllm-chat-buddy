export type EngineErrorCategory = "memory" | "network" | "unknown";

export interface EngineErrorInfo {
  category: EngineErrorCategory;
  /** 日本語の要点（先頭に出す） */
  headline: string;
  /** 対処の箇条書き */
  actions: string[];
  /** WebLLM の生メッセージ（空文字もありうる） */
  rawMessage: string;
}

const MEMORY_PATTERN = /memory|oom/i;
const NETWORK_PATTERN = /fetch|network|download|timeout/i;

/**
 * WebLLM の初期化失敗（`initLLMEngine().catch()`）で受け取った生のエラーを、
 * キーワードベースでカテゴリ推定し、日本語の見出しと対処の箇条書きに変換する。
 *
 * `hasWebGPUAdapter()` によるアダプタ事前チェック（issue #18）を通過した後に
 * 起きるその他の初期化失敗（メモリ不足・ネットワーク失敗・シェーダーコンパイル
 * 失敗等）を対象とする。分類できない場合は `unknown` とし、`rawMessage` が
 * 空文字なら既存のフォールバック文言を維持する（issue #13）。
 */
export function classifyEngineError(err: unknown): EngineErrorInfo {
  const rawMessage = err instanceof Error ? err.message : String(err);

  if (MEMORY_PATTERN.test(rawMessage)) {
    return {
      category: "memory",
      headline: "GPUメモリが不足している可能性があります。",
      actions: ["より軽いモデルを選んでください。", "他のアプリやタブを閉じてください。"],
      rawMessage,
    };
  }

  if (NETWORK_PATTERN.test(rawMessage)) {
    return {
      category: "network",
      headline: "モデルのダウンロードに失敗しました。",
      actions: [
        "ネットワーク接続を確認してください。",
        "しばらく待ってから再度お試しください。",
      ],
      rawMessage,
    };
  }

  return {
    category: "unknown",
    headline: rawMessage
      ? "モデルの初期化に失敗しました。"
      : "モデルの読み込みに失敗しました。",
    actions: ["ページを再読み込みしてください。", "より軽いモデルを選んでください。"],
    rawMessage,
  };
}
