export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
}

/**
 * `navigator.gpu` の最小限の形状。TypeScript の DOM lib はこのプロジェクトの
 * バージョンでは WebGPU 型を含まないため、必要な部分だけをローカルに定義する
 * （`modelCatalog.ts` の `NavigatorUAData` や `voiceInput.ts` の
 * `SpeechRecognitionLike` と同じ方針）。
 */
interface GPUAdapterFeaturesLike {
  has(name: string): boolean;
}

interface GPUAdapterLike {
  features: GPUAdapterFeaturesLike;
}

interface NavigatorGPULike {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapterLike | null>;
  };
}

let shaderF16CachePromise: Promise<boolean> | null = null;

/**
 * テスト専用: `hasShaderF16()` のキャッシュをリセットする。
 * 本番コードから呼ぶ必要はない。
 */
export function resetShaderF16Cache(): void {
  shaderF16CachePromise = null;
}

async function detectShaderF16(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    return false;
  }

  const nav = navigator as unknown as NavigatorGPULike;

  try {
    const adapter = await nav.gpu!.requestAdapter();
    if (!adapter) {
      return false;
    }
    return adapter.features.has("shader-f16");
  } catch {
    // requestAdapter() を実装しつつ実際には拒否する環境が存在しうる。
    // 起動時に呼ばれるため、ここで例外を伝播させると画面が真っ白になる。
    return false;
  }
}

/**
 * WebGPU の `shader-f16` 機能への対応を判定する。`GPUAdapter` の取得を伴うため
 * 非同期（既存の同期関数 `hasWebGPU()` とは別関数として提供する）。
 *
 * カタログの全モデルが `q4f16` 量子化を要求していた頃、この機能が無い環境では
 * モデルのダウンロードを完走した後、推論用シェーダーのコンパイル時点で必ず
 * 初期化が失敗していた（issue #15）。判定結果は 1 度取得できれば変わらない
 * 前提でキャッシュする。テストでリセットする場合は `resetShaderF16Cache()`。
 */
export function hasShaderF16(): Promise<boolean> {
  if (!shaderF16CachePromise) {
    shaderF16CachePromise = detectShaderF16();
  }
  return shaderF16CachePromise;
}

export function hasSpeechRecognition(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const win = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}
