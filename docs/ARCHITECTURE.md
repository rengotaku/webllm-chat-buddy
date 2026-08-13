# ARCHITECTURE

ブラウザ内で完結する LLM チャットアプリ。**ローカル実行のみを想定**しており、公開ホスティングはしていない。バックエンドは存在しない。

## 全体像

```
ブラウザ (Chrome / Edge)
  │
  ├─ React UI ......................... src/App.tsx
  │    ├─ モデル選択 select
  │    ├─ チャット履歴
  │    └─ 入力欄 + マイクボタン + 送信ボタン
  │
  ├─ 推論 ............................. src/lib/llmEngine.ts
  │    └─ @mlc-ai/web-llm (MLCEngine)
  │         └─ WebGPU → ユーザーの GPU
  │
  ├─ 音声入力 ......................... src/lib/voiceInput.ts
  │    └─ Web Speech API (SpeechRecognition)
  │         └─ ⚠️ ブラウザベンダのサーバーへ音声送信（ローカル処理ではない）
  │
  ├─ 状態 ............................. src/lib/chatReducer.ts
  └─ 環境判定 ......................... src/lib/capabilities.ts
```

## どこを触れば何が変わるか

| 変えたいこと | 触るファイル |
|---|---|
| 選択できるモデル・既定モデル・表示ラベル・容量 | `src/lib/modelCatalog.ts` |
| モデルのロード処理・推論・ストリーミング | `src/lib/llmEngine.ts` |
| チャット履歴の持ち方・トークン追記 | `src/lib/chatReducer.ts` |
| 音声認識の開始/停止・結果の受け取り | `src/lib/voiceInput.ts` |
| WebGPU / Web Speech API の対応判定 | `src/lib/capabilities.ts` |
| 画面レイアウト・エンジン初期化の配線 | `src/App.tsx` |

## データフロー

### 起動時

1. `capabilities.hasWebGPU()` で WebGPU 対応を判定。非対応なら代替メッセージを出してチャット機能を無効化する
2. `modelCatalog.getDefaultModelId()` が端末種別（`navigator.userAgentData.mobile` → UA 文字列でフォールバック）から既定モデルを決める
3. localStorage の保存値を `isKnownModelId()` で検証し、未知なら既定へフォールバック
4. `llmEngine.initLLMEngine()` が `CreateMLCEngine` を呼ぶ
   - wasm ランタイムを `raw.githubusercontent.com` から取得
   - モデルの重みを `huggingface.co` から取得（30 個前後に分割）
   - ブラウザの Cache Storage（`webllm/model` / `webllm/wasm` / `webllm/config`）へ保存
   - GPU へアップロード
   - 進捗は `initProgressCallback` → `onProgress` で画面のプログレスバーへ

2 回目以降はキャッシュから読むためダウンロードは走らない。

### 送信時

1. `chatReducer.addMessage()` でユーザーメッセージを追加
2. 空のアシスタントメッセージを追加
3. `llmEngine.streamChatResponse()` がトークンを逐次返す
4. トークンごとに `chatReducer.appendToken(messages, id, token)` で対象メッセージへ追記（イミュータブル更新）

## 壊すと危ない前提

### エンジン初期化は「世代番号」で識別する

`src/App.tsx` の `initGenerationRef` は、初期化のたびに増える番号。完了・進捗・失敗の**すべてのコールバック**で「開始時の番号 === 現在の番号」を確認してから state を更新している。

- **モデルIDでの識別に戻してはいけない。** A→B→A と素早く切り替えると 1 回目と 3 回目が同一 ID になり区別できず、古い結果が最新を上書きして「未初期化なのに入力可能」になる（Case M4-1 が検知する）
- **前エンジンの `unload()` を待たずに次の初期化を始めてはいけない。** 解放前に確保すると新旧モデルが同時に GPU メモリを占め、ピークが両者の合計になる。「軽いモデルへの切り替え」が OOM で失敗する（Case M4-3）
- **解放待機中の連続切替でも、解放後に世代を再確認してから初期化する。** `pendingDisposalRef` が進行中の解放を追跡している（Case M4-5）
- **破棄する初期化結果のエンジンも `unload()` する。** 無視するだけでは GPU メモリが残る（Case M4-2）

これらはテストでのみ検知できる。エラーも出ず、通常操作では緑のまま壊れる。

### レイアウトは「入力欄がビューポート内に残ること」を最優先にする

`src/App.tsx` のルートは `h-dvh`（`overflow-hidden` なし）。

- **チャット履歴領域に大きな固定 `min-height` を設けてはいけない。** 画面高が小さいとき（横向き・ソフトキーボード表示時）に入力欄をビューポート外へ押し出す。過去に `min-h-[200px]` を入れて実際に踏んだ
- 代わりに **警告・エラーアラート側に `max-h-[20dvh] overflow-y-auto`** を設けて、長い WebGPU エラー文（英語・約 380 文字）が画面を占有しないようにしている
- チャット履歴の下限は `min-h-12`（48px、1 行分）に留める

### エンジン初期化失敗のエラー文言は `errorMessages.ts` が唯一の分類窓口

`hasWebGPUAdapter()` の事前チェック（issue #18）を通過した後に起きるその他の失敗（メモリ不足・ネットワーク失敗・シェーダーコンパイル失敗等）は、`initLLMEngine().catch()` 内で `classifyEngineError()` に通してから `engineError` state（`EngineErrorInfo`）へ入れる（issue #13）。

- **WebLLM の生の英語メッセージを直接 UI に出してはいけない。** 日本語の `headline` を先頭に、対処の `actions` を箇条書き、生メッセージ（`rawMessage`）は `<details>` で折りたたむ。逆順にすると issue #13 が解消しようとした「英語の生メッセージが句読点なく連結される」問題に戻る
- **分類はキーワード正規表現ベースの推定であり確定診断ではない。** 新しいエラーパターンを追加するときは `MEMORY_PATTERN` / `NETWORK_PATTERN` を拡張するか、`unknown` のフォールバック文言に頼る。誤分類が起きても `rawMessage` は必ず保持されるため実害は小さい
- **GPU アダプタ非対応（#18）の専用メッセージとは別経路。** アダプタ判定は `initLLMEngine()` を呼ぶ前の pre-check で完結しており、`classifyEngineError()` の対象にはならない

### 容量表示は 2 種類あり、混同してはいけない

`modelCatalog.ts` の `downloadMB`（初回ダウンロード量）と `vramMB`（要求 GPU メモリ）は**比例しない**。

- ユーザーが待ち時間として体感するのは `downloadMB`。UI にはこちらを先に出す
- カタログは `downloadMB` 昇順に並べる（テストで強制）。崩れると回線の細い環境で最も重いモデルが上位に見える
- 過去に `vramMB` のみを表示し、DL 最軽量の Qwen2.5 0.5B（265MB）が「945MB」として一覧 3 番目に見える状態だった

### 音声入力はローカル処理ではない

Chrome の Web Speech API は**サーバー側音声認識**で、音声データがブラウザベンダへ送信される。「LLM 推論がローカル完結」であることと混同して「一切外部送信しない」と書かないこと（README に一度書いて訂正した）。

### 量子化形式（f16/f32）と shader-f16 対応は別々に扱う

`modelCatalog.ts` の各エントリが持つ `requiresF16` は、モデルの量子化形式（`q4f16_*` / `q4f32_*`）が
WebGPU の `shader-f16` 機能を要求するかどうかを表す。この機能が無い環境では、モデルの重み
（数百MB）のダウンロードには成功するが、**推論用シェーダーのコンパイル時点で必ず失敗する**
（issue #15。実測環境では RTX 4080 SUPER 搭載機でも Dawn / Vulkan 両バックエンドで
`shader-f16` が false だった。ドライバ構成に依存するため利用者側でも起こりうる）。

- **`requiresF16` は手で付与する値で、`id` の実態とズレうる。** ズレは実行時エラーが出ず、
  「非対応環境に f16 モデルを出す」か「使える f32 モデルを隠す」という間違った選択肢を
  黙って並べる（Case F2-2 が `id` に含まれる量子化サフィックスとの一致を検証している）
- **`shader-f16` 対応判定（`capabilities.hasShaderF16()`）は非同期。** `GPUAdapter` の取得を
  伴うため、既存の同期関数 `hasWebGPU()` とは別関数にしてある。`App.tsx` はこの判定の
  完了を、モデルの世代管理（`initGenerationRef`）と並ぶ「初期化を開始してよい条件」の
  一つとして扱っている。判定を待たずに保存済みモデルIDで初期化を始めると、非対応環境で
  毎回ダウンロードを完走させてから失敗させることになる（Case F4-1）
- **同一モデルでも f16 版と f32 版でダウンロードサイズはほぼ同じ**（4bit 量子化された重み
  本体は同一で、スケール値の精度のみが異なるため）。要求 GPU メモリ（`vramMB`）は f32 の方が
  わずかに増える
- **`shader-f16` 非対応環境でも選べるモデルが最低 1 つ残ることを維持する。** f32 モデルを
  誤って全部削除すると、非対応環境で選択肢がゼロになりアプリが完全に使えなくなる
  （Case F2-3）

## テスト

`src/lib/*.test.ts` と `src/App.test.tsx` に、事前設計されたケース（Case 1-1〜3-3 / M1-1〜M4-5 / F1-1〜F4-2）がある。これらは実装と同時に間違えると検知できない構造穴を塞ぐために設計されたもので、**削除・改名・アサーション緩和をしない**。

CI は `.github/workflows/ci.yml`。`make ci` に加えて `npm run format:check` / `npx tsc --noEmit` / カバレッジ 80% ゲートを回す。

## 既知の未整理事項

なし（scaffold 由来の未使用コード `src/pages/` `src/api/` `src/schemas/` `src/types/` 等は #12 で削除済み）。
