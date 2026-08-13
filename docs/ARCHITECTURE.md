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

### 容量表示は 2 種類あり、混同してはいけない

`modelCatalog.ts` の `downloadMB`（初回ダウンロード量）と `vramMB`（要求 GPU メモリ）は**比例しない**。

- ユーザーが待ち時間として体感するのは `downloadMB`。UI にはこちらを先に出す
- カタログは `downloadMB` 昇順に並べる（テストで強制）。崩れると回線の細い環境で最も重いモデルが上位に見える
- 過去に `vramMB` のみを表示し、DL 最軽量の Qwen2.5 0.5B（265MB）が「945MB」として一覧 3 番目に見える状態だった

### 音声入力はローカル処理ではない

Chrome の Web Speech API は**サーバー側音声認識**で、音声データがブラウザベンダへ送信される。「LLM 推論がローカル完結」であることと混同して「一切外部送信しない」と書かないこと（README に一度書いて訂正した）。

## テスト

`src/lib/*.test.ts` と `src/App.test.tsx` に、事前設計されたケース（Case 1-1〜3-3 / M1-1〜M4-5）がある。これらは実装と同時に間違えると検知できない構造穴を塞ぐために設計されたもので、**削除・改名・アサーション緩和をしない**。

CI は `.github/workflows/ci.yml`。`make ci` に加えて `npm run format:check` / `npx tsc --noEmit` / カバレッジ 80% ゲートを回す。

## 既知の未整理事項

scaffold（my-boilerplate の react-spa）由来の未使用コードが残っている。チャットアプリからは一切参照されていないが、テストとカバレッジには計上されている。

| ディレクトリ | 規模 | 状態 |
|---|---|---|
| `src/pages/` | 9 ファイル / 821 行 | 未使用（ルーティングごと撤去済み） |
| `src/api/` | 6 ファイル / 246 行 | 未使用（バックエンドが無い） |
| `src/schemas/` | 3 ファイル / 32 行 | 未使用 |
| `src/types/` | 3 ファイル / 28 行 | 未使用 |

削除するとカバレッジの分母が変わるため、別 issue で扱う。
