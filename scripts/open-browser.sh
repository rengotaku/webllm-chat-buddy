#!/bin/sh
# Open webllm-chat-buddy in a dedicated Chrome/Chromium instance.
#
# Linux の Chrome/Chromium は既定でGPUバックエンド(Vulkan)が無効なため、
# フラグ無しではWebGPUアダプタを取得できない(issue #18)。
# `chrome://flags/#enable-vulkan` は常用ブラウザ全体の設定を変えてしまうため、
# 代わりに専用のユーザープロファイルで `--enable-features=Vulkan` を付けた
# 別インスタンスを起動する(常用ブラウザのプロセス・設定には一切影響しない)。
#
# 起動したブラウザプロセスの管理は行わない(ユーザーが閉じる)。
#
# 環境変数:
#   PORT                       dev サーバーのポート(既定: 5173)
#   WEBLLM_CHROME_PROFILE_DIR  専用プロファイルの保存先
#                              (既定: ~/.cache/webllm-chat-buddy/chrome-profile)
#   WEBLLM_CHROME_BIN          使用する Chrome/Chromium 実行ファイルを明示指定する
#                              (既定: 自動探索。下記「実行ファイルの決定順序」を参照)
set -eu

PORT="${PORT:-5173}"
PROFILE_DIR="${WEBLLM_CHROME_PROFILE_DIR:-$HOME/.cache/webllm-chat-buddy/chrome-profile}"
URL="http://localhost:${PORT}"

# --- 1. dev サーバーが起動しているか確認する ---
# `make run` / `make stop` / `make status` と同じ lsof ベースの判定に揃える。
if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: 'lsof' command not found. It is required to check whether the dev server is running." >&2
  exit 1
fi

if ! lsof -i ":${PORT}" >/dev/null 2>&1; then
  echo "Error: dev server is not running on port ${PORT}." >&2
  echo "Start it first with: make run" >&2
  exit 1
fi

# --- 2. Chrome/Chromium 実行ファイルを決定する ---
#
# 実行ファイルの決定順序: WEBLLM_CHROME_BIN(明示指定) → 絶対パス → PATH。
#
# 🔴 絶対パスを PATH より先に試すこと。逆にしてはいけない。
#
# 理由: PATH 上の `google-chrome` 等は、GPUを使う他ジョブとのVRAM競合を避ける
# ために既定で `--disable-gpu` 等を注入するラッパースクリプトに差し替えられて
# いることがある(実運用で実際に踏んだ: `~/.local/bin/google-chrome` がそのような
# ラッパーで、PATH優先順位により `command -v google-chrome` はラッパーを返す)。
# ラッパーは実体を `exec` する際に `--disable-gpu` を固定で注入するため、この
# スクリプトが後から `--enable-features=Vulkan` を渡してもVulkanバックエンドは
# 有効化されず、WebGPUアダプタを取得できないまま起動してしまう。
# 実体バイナリの絶対パス(`/opt/google/chrome/chrome` 等)を先に試すことで、この
# 種のラッパーを迂回する。絶対パスの候補に無い環境(ディストリ独自の配置等)では
# PATH 探索にフォールバックするため、可搬性は損なわない。
# なお、そのラッパー自体を削除・変更してはいけない(意図的なVRAM競合対策のため)。
find_browser() {
  # 2-1. 実体の絶対パス(よくあるインストール先。ラッパーを迂回するため PATH より先)
  for path in /opt/google/chrome/chrome /usr/bin/google-chrome /usr/bin/google-chrome-stable \
    /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
    if [ -x "$path" ]; then
      echo "$path"
      return 0
    fi
  done

  # 2-2. PATH 探索(フォールバック。ラッパーを踏む可能性があるため最後)
  for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done

  return 1
}

if [ -n "${WEBLLM_CHROME_BIN:-}" ]; then
  # 明示指定(最優先)。無効な場合は自動探索へ黙ってフォールバックせず、明確に知らせる。
  if [ ! -x "$WEBLLM_CHROME_BIN" ]; then
    echo "Error: WEBLLM_CHROME_BIN=${WEBLLM_CHROME_BIN} is not an executable file." >&2
    exit 1
  fi
  BROWSER_BIN="$WEBLLM_CHROME_BIN"
else
  BROWSER_BIN="$(find_browser)" || {
    echo "Error: Chrome or Chromium executable not found." >&2
    echo "Looked for: /opt/google/chrome/chrome (and common install paths), then google-chrome, google-chrome-stable, chromium, chromium-browser on PATH." >&2
    echo "Install Google Chrome or Chromium, then retry, or set WEBLLM_CHROME_BIN=/path/to/chrome." >&2
    exit 1
  }
fi

# --- 3. 専用プロファイルで起動する ---
mkdir -p "$PROFILE_DIR"

echo "Opening ${URL}"
echo "  browser: ${BROWSER_BIN}"
echo "  profile: ${PROFILE_DIR} (persisted; your default browser profile is untouched)"

nohup "$BROWSER_BIN" \
  --user-data-dir="$PROFILE_DIR" \
  --enable-features=Vulkan \
  --no-first-run \
  --no-default-browser-check \
  "$URL" >/dev/null 2>&1 &

exit 0
