#!/bin/zsh
# Start the Vite dev server over HTTPS, bound to 0.0.0.0, for LAN access
# (e.g. trying the app from a smartphone on the same network). See issue #21.
#
# なぜHTTPSが必須か:
#   ブラウザは `localhost` 以外への平文HTTPを secure context と見なさないため、
#   WebGPU API (`navigator.gpu`) 自体が露出しない(実測で確認済み。詳細はREADMEの
#   「LAN上の別端末で試す」を参照)。したがって同一LAN上の他端末からアクセスする
#   にはHTTPS化が必須。
#
# 自己署名証明書:
#   `openssl` でその場で自己署名証明書を生成する(追加の依存インストールや認証操作
#   は不要)。信頼された認証局の署名ではないため、**接続のたびにブラウザで証明書
#   警告が出て、手動での許可操作が必要になる**。常用したくなった場合は Tailscale
#   serve 等への移行を検討する(このスクリプトの対象外)。
#
# 証明書・秘密鍵の保存先:
#   リポジトリ外(既定 ~/.cache/webllm-chat-buddy/certs)に生成する。git の管理対象
#   に入ることは無い。LAN IP アドレスが変わった場合(別ネットワークへ移動した場合
#   など)は、既存証明書がそのIPをカバーしていないことを検知して自動的に再生成する。
#
# 環境変数:
#   PORT              dev サーバーのポート(既定: 5173)
#   WEBLLM_CERT_DIR   証明書/秘密鍵の保存先(既定: ~/.cache/webllm-chat-buddy/certs)
#   WEBLLM_LAN_IP     LAN IP の自動検出を上書きする(複数NIC等で誤検出する場合に指定)
set -eu

PORT="${PORT:-5173}"
CERT_DIR="${WEBLLM_CERT_DIR:-$HOME/.cache/webllm-chat-buddy/certs}"
CERT_FILE="$CERT_DIR/dev-cert.pem"
KEY_FILE="$CERT_DIR/dev-key.pem"

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: 'openssl' command not found. It is required to generate a self-signed certificate." >&2
  exit 1
fi

# --- 1. LAN IP アドレスを検出する ---
# 優先順: 明示指定(WEBLLM_LAN_IP) > 外部疎通に使う実経路の送信元IP(`ip route get`)
# > `hostname -I` の先頭。`hostname -I` は docker のブリッジIP等も一緒に列挙して
# しまい誤検出しやすいため、フォールバックに留める。
if [ -n "${WEBLLM_LAN_IP:-}" ]; then
  LAN_IP="$WEBLLM_LAN_IP"
else
  LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
  if [ -z "$LAN_IP" ]; then
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
fi

if [ -z "$LAN_IP" ]; then
  echo "Error: could not detect a LAN IP address." >&2
  echo "Set WEBLLM_LAN_IP=<ip> explicitly and retry." >&2
  exit 1
fi

# --- 2. 証明書がLAN IPをカバーしているか確認し、無ければ(再)生成する ---
# `-text` の全文出力に対する部分一致で判定する(存在しない拡張の抽出でexit codeが
# 環境依存になりうる `-ext subjectAltName` 単体フィルタより安全)。cert/keyが無い
# ・壊れている場合も CERT_COVERS_IP=0 のまま regenerate 分岐に落ちる(fail-safe)。
CERT_COVERS_IP=0
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  CERT_TEXT="$(openssl x509 -in "$CERT_FILE" -noout -text 2>/dev/null || true)"
  case "$CERT_TEXT" in
  *"$LAN_IP"*) CERT_COVERS_IP=1 ;;
  esac
fi

if [ "$CERT_COVERS_IP" -eq 0 ]; then
  mkdir -p "$CERT_DIR"
  chmod 700 "$CERT_DIR"
  echo "Generating self-signed dev certificate (localhost, 127.0.0.1, ${LAN_IP})..."
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=webllm-chat-buddy.local" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}" \
    >/dev/null 2>&1
  chmod 600 "$KEY_FILE" "$CERT_FILE"
  echo "  cert: $CERT_FILE"
  echo "  key:  $KEY_FILE"
else
  echo "Reusing existing dev certificate: $CERT_FILE"
fi

echo ""
echo "Self-signed certificate: your browser WILL show a security warning on every"
echo "connection. This is expected; accept/continue manually each time."
echo ""
echo "Connect from another device on the same LAN:"
echo "  https://${LAN_IP}:${PORT}/"
echo ""

export WEBLLM_HTTPS_CERT="$CERT_FILE"
export WEBLLM_HTTPS_KEY="$KEY_FILE"
exec npm run dev -- --host 0.0.0.0 --port "$PORT"
