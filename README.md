# webllm-chat-buddy

ブラウザだけで完結するローカルLLMチャットアプリ。サーバーもAPI課金も無し。[WebLLM](https://github.com/mlc-ai/web-llm)がWebGPU経由でユーザーのGPU上に小型LLM(`Qwen2.5-1.5B-Instruct`、4bit量子化)を直接ロードして推論する。マイクからの音声入力([Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API))にも対応。

## 特徴

- **サーバー不要**: 静的ホスティングだけで動く。会話内容は一切外部に送信されない
- **音声入力**: マイクボタンで音声認識→テキスト入力欄に反映
- **ブラウザ内モデルキャッシュ**: 初回のみモデルをダウンロード、以降はブラウザキャッシュから読み込む

## 動作要件

- WebGPU対応ブラウザ(Chrome / Edge 推奨。`chrome://gpu` でWebGPUが有効か確認できる)
- マイク入力を使う場合はWeb Speech API対応ブラウザ(Chrome系)
- 非対応ブラウザではその旨のメッセージが表示され、チャット機能は無効化される

## セットアップ

```bash
make install
make run
```

`http://localhost:5173` を開く。初回アクセス時にモデル(約1GB)のダウンロードが始まる。

## その他のコマンド

```bash
make help   # 利用可能なコマンド一覧
make ci     # lint / test / build をまとめて実行
```

## 技術構成

- Vite + React + TypeScript
- [`@mlc-ai/web-llm`](https://www.npmjs.com/package/@mlc-ai/web-llm): WebGPU上でのLLM推論エンジン
- Web Speech API: 音声認識(ブラウザ標準機能、追加ライブラリ無し)

CI workflow は `.github/workflows/ci.yml`。
