# webllm-chat-buddy

ブラウザだけで完結するローカルLLMチャットアプリ。サーバーもAPI課金も無し。[WebLLM](https://github.com/mlc-ai/web-llm)がWebGPU経由でユーザーのGPU上に小型LLM（4bit量子化、既定は `Qwen2.5-1.5B-Instruct`）を直接ロードして推論する。マイクからの音声入力([Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API))にも対応。

**ローカル実行のみを想定している**（公開ホスティングはしていない）。`make run` で起動してブラウザで開く。

![チャット画面](docs/images/screenshot-chat.png)

上は実際に動作している画面。モデルをブラウザにダウンロードしたあと、GPU 上で推論して応答している（応答はローカルの小型モデルによるもので、品質はモデルサイズなりになる）。

## 特徴

- **サーバー不要**: LLMの推論はブラウザ内(WebGPU)で完結する。バックエンドは存在しない
- **音声入力**: マイクボタンで音声認識→テキスト入力欄に反映
- **モデル切替**: 用途・端末に応じて選択できる(下表)。選択はブラウザに保存される
- **ブラウザ内モデルキャッシュ**: 初回のみモデルをダウンロード、以降はブラウザキャッシュから読み込む

## プライバシーについて

- **チャットの推論**: WebLLMがブラウザ内(WebGPU)でモデルを実行するため、会話メッセージが外部サーバーへ送信されることはない
- **音声入力**: Web Speech APIを使用。ChromeなどのWeb Speech API実装は**サーバー側音声認識**のため、マイクで録音した音声データはブラウザベンダ(Google等)のサーバーへ送信され、テキストに変換されて返る。音声入力ボタンを使わない場合、この送信は発生しない

## 動作要件

- WebGPU対応ブラウザ(Chrome / Edge 推奨。`chrome://gpu` でWebGPUが有効か確認できる)
- マイク入力を使う場合はWeb Speech API対応ブラウザ(Chrome系)
- Android: Android 12 以降 + Chrome 121 以降(WebGPU対応の最小要件)
- **Linux の Chrome / Edge**: 既定ではGPUバックエンド(Vulkan)が無効になっており、ブラウザ自体はWebGPUに対応していてもGPUアダプタを取得できないことがある。対処方法は2つあり、詳しくは後述の「[アプリを開く(Linux でGPUアダプタを取得できない場合)](#アプリを開くlinux-でgpuアダプタを取得できない場合)」を参照(この状態ではモデルを軽いものに変更しても解決しない)。それ以外のブラウザではGPUドライバやOSのグラフィックス設定を確認する
- 非対応ブラウザ、およびGPUアダプタを取得できない場合はその旨のメッセージが表示され、チャット機能は無効化される

スマートフォン幅にも対応している。

<img src="docs/images/screenshot-mobile.png" alt="モバイル幅の表示" width="320">

（上は WebGPU 非対応環境で開いたときの表示。エラー内容が読め、入力欄も画面内に収まる）

## セットアップ

```bash
make install
make run
```

`http://localhost:5173` を開く。初回アクセス時にモデルのダウンロードが始まる（進捗バーが出る）。

### アプリを開く(Linux でGPUアダプタを取得できない場合)

前述のとおり、Linux の Chrome / Edge は既定でGPUバックエンド(Vulkan)が無効なため、`make run` の後に常用ブラウザでそのまま開くとGPUアダプタを取得できないことがある。対処方法は2つある。

| 方法 | 影響範囲 |
|---|---|
| `make open`(推奨) | このアプリ専用のプロファイルのみ。常用ブラウザのプロファイル・設定・拡張・ログイン状態には影響しない |
| `chrome://flags/#enable-vulkan`(Edgeは `edge://flags/#enable-vulkan`)を変更 | 常用ブラウザ全体のGPUバックエンド(他のサイト・タブにも影響する) |

日常使いのブラウザのGPUバックエンドを変えるのは影響が大きいため、`make open` を推奨する。

```bash
make run    # 別ターミナルで dev サーバーを起動
make open   # 専用インスタンスで開く
```

`make open` は `google-chrome` / `google-chrome-stable` / `chromium` / `chromium-browser` などの実行ファイルを自動検出し(実体の絶対パスを優先し、PATH上のコマンド名はフォールバックとして最後に試す。理由は後述)、専用のユーザープロファイル(既定 `~/.cache/webllm-chat-buddy/chrome-profile`。`WEBLLM_CHROME_PROFILE_DIR` 環境変数で変更可)を使って `--enable-features=Vulkan` 付きで起動する。プロファイルは永続化されるため、モデルのダウンロードキャッシュは毎回失われない。dev サーバーが起動していない場合や、Chrome/Chromium が見つからない場合はその旨のエラーで案内される。起動したブラウザプロセスの管理(終了など)は行わない。ポートは `make run` と同じ既定値(5173)を使い、`PORT` 環境変数で上書きできる(例: `make open PORT=3000`)。

**自動検出が絶対パスを優先する理由**: PATH上の `google-chrome` 等は、GPUを使う他ジョブとのVRAM競合を避けるために既定で `--disable-gpu` を注入するラッパースクリプトに差し替えられていることがある。ラッパー経由で起動すると `--enable-features=Vulkan` を渡してもGPUが無効化されたまま起動してしまうため、`make open` は実体バイナリの絶対パス(`/opt/google/chrome/chrome` など)を優先する。それでも意図しない実行ファイルが選ばれる場合は `WEBLLM_CHROME_BIN=/path/to/chrome make open` で使用する実行ファイルを明示指定できる。

### LAN上の別端末で試す(スマートフォン等)

同一LAN上のスマートフォンなど別端末からこのアプリを開くには、**HTTPS化が必須**。`vite --host 0.0.0.0` で公開しただけの平文HTTPでは動かない。

| アクセス経路 | `isSecureContext` | `navigator.gpu` |
|---|---|---|
| `http://localhost:5173/` | true | 存在する |
| `http://192.168.x.x:5173/`(平文HTTP) | **false** | **存在しない** |

ブラウザは `localhost` 以外への平文HTTPを secure context と見なさないため、WebGPU API (`navigator.gpu`) 自体が露出しない。端末のGPU性能とは無関係で、HTTPS化すれば解決する。

```bash
make run-https
```

起動時にLAN上の他端末から接続するためのURL(`https://<LAN IP>:5173/`)が表示される。証明書は初回起動時に `openssl` でその場で自己署名生成し、リポジトリ外(既定 `~/.cache/webllm-chat-buddy/certs`。`WEBLLM_CERT_DIR` で変更可)に保存する。2回目以降は既存証明書を再利用する(別ネットワークへ移動してLAN IPが変わった場合は自動的に再生成される)。

**注意点**:

- **自己署名証明書のため、接続のたびにブラウザで証明書警告が出て、手動で許可する必要がある**(信頼された認証局の署名ではないため)。常用したくなった場合は Tailscale serve 等への移行を検討する(本リポジトリの対象外)
- スマートフォン側にもWebGPUの要件がある: **Android 12以降 + Chrome 121以降**。iOSは**Safari 26以降**が必要(端末がこれらの要件を満たすかは別途確認が必要。要件を満たしていてもGPUドライバや `shader-f16` 対応の有無で動作しないことがある)
- `make open`(専用Chromeプロファイルでの起動)は**このHTTPSモードには対応していない**。`open-browser.sh` は `http://localhost:${PORT}` 固定で、`make run`(平文HTTP)と組み合わせて使う想定。前述の表のとおり `localhost` は平文HTTPでもsecure contextとして扱われるため、同一マシン上でのGPUアダプタ確認には `make run` + `make open` を使う。`make run-https` はLAN上の**別端末**からアクセスする用途にのみ使う

## モデルと初回ダウンロード量

画面上部のプルダウンで選択する。数値は実測値（重みファイルの合計サイズ／WebLLM が要求する GPU メモリ）。

| モデル | 初回ダウンロード | 要求GPUメモリ | `shader-f16` |
|---|---|---|---|
| Qwen2.5 0.5B | 約 265 MB | 945 MB | 必要 |
| Qwen2.5 0.5B (f32) | 約 265 MB | 1060 MB | **不要** |
| Gemma3 1B | 約 537 MB | 711 MB | 必要 |
| Llama 3.2 1B | 約 663 MB | 879 MB | 必要 |
| Qwen2.5 1.5B（既定） | 約 828 MB | 1630 MB | 必要 |

ダウンロード量と要求GPUメモリは比例しない（Gemma3 1B はダウンロードが Llama 3.2 1B より小さいが、要求GPUメモリはさらに小さい）。回線が細いときはダウンロード量、GPU が非力なときは要求GPUメモリを見て選ぶ。

モバイル環境（`navigator.userAgentData.mobile` または UA 文字列で判定）では既定が Qwen2.5 0.5B になる。

### `shader-f16` について

4bit 量子化には `q4f16` と `q4f32` の2種類があり、**`q4f16` は WebGPU の `shader-f16` 機能を必須とする**。この機能が使えない環境では、モデルのダウンロードが最後まで進んだあとにシェーダーのコンパイルで失敗する。

Linux 版 Chrome / Edge は**既定で Vulkan バックエンドが無効**なため、フラグ無しでは WebGPU の GPUAdapter 自体を取得できない（`navigator.gpu` は存在していても `requestAdapter()` が `null` を返す）。Chromeでは `chrome://flags/#enable-vulkan`、Edgeでは `edge://flags/#enable-vulkan` を Enabled にしてブラウザを再起動すると、実GPUのアダプタを取得できるようになる。ただし、その状態でも `shader-f16` が使えない場合があり（GPUドライバの構成に依存）、そのときは `shader-f16` 不要な f32 モデルへ自動でフォールバックする。

起動時に自動判定し、**使えない環境では `shader-f16` 不要のモデルだけを選択肢に出す**（保存済みの選択が f16 必須モデルだった場合も自動でフォールバックする）。判定中はモデル選択が一時的に操作不可になる。

### ダウンロードされる仕組み

「インストール」ではなく、ページを開いた JavaScript が実行時に取得してブラウザのキャッシュへ保存する。OS にもブラウザにも何も常駐しない。

1. wasm ランタイムを `raw.githubusercontent.com` から取得（推論エンジン本体）
2. モデルの重みを `huggingface.co` から取得（30 個前後のファイルに分割されている）
3. ブラウザのキャッシュ（Cache Storage の `webllm/model` / `webllm/wasm` / `webllm/config`）へ保存
4. GPU へアップロードして会話可能になる

2 回目以降はダウンロードが走らず、キャッシュから読み込む。消したい場合はブラウザの「サイトデータを削除」で消える。

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
