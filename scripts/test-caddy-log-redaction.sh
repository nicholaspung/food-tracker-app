#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CADDY_BIN="${CADDY_BIN:-caddy}"

if ! command -v "$CADDY_BIN" >/dev/null 2>&1; then
    echo "Caddy is required. Set CADDY_BIN to the deployed Caddy executable." >&2
    exit 1
fi

TEST_DIR="$(mktemp -d)"
TEST_PORT=$((39000 + ($$ % 1000)))
TEST_CONFIG="$TEST_DIR/Caddyfile"
FULL_CONFIG="$TEST_DIR/full-Caddyfile"
PROD_LOG="$TEST_DIR/access.log"
BETA_LOG="$TEST_DIR/beta-access.log"
CADDY_OUTPUT="$TEST_DIR/caddy-output.log"
CADDY_PID=""

cleanup() {
    if [ -n "$CADDY_PID" ] && kill -0 "$CADDY_PID" >/dev/null 2>&1; then
        kill "$CADDY_PID" >/dev/null 2>&1 || true
        wait "$CADDY_PID" >/dev/null 2>&1 || true
    fi
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

extract_snippet() {
    local snippet_name="$1"

    awk -v target="($snippet_name)" '
        $1 == target && $2 == "{" {
            printing = 1
        }
        printing {
            print
            opens = gsub(/{/, "{")
            closes = gsub(/}/, "}")
            depth += opens - closes
            if (depth == 0) {
                exit
            }
        }
    ' "$REPO_ROOT/Caddyfile"
}

extract_global_options() {
    awk '
        !printing && $1 == "{" {
            printing = 1
        }
        printing {
            print
            opens = gsub(/{/, "{")
            closes = gsub(/}/, "}")
            depth += opens - closes
            if (depth == 0) {
                exit
            }
        }
    ' "$REPO_ROOT/Caddyfile"
}

sed \
    -e "s#/var/log/caddy/access.log#$PROD_LOG#g" \
    -e "s#/var/log/caddy/beta-access.log#$BETA_LOG#g" \
    "$REPO_ROOT/Caddyfile" >"$FULL_CONFIG"

"$CADDY_BIN" adapt --config "$FULL_CONFIG" --adapter caddyfile --validate >/dev/null

{
    extract_global_options | sed '$d'
    printf '\tadmin off\n\tauto_https off\n}\n\n'
    extract_snippet prod_logging | sed "s#/var/log/caddy/access.log#$PROD_LOG#g"
    printf '\n'
    extract_snippet beta_logging | sed "s#/var/log/caddy/beta-access.log#$BETA_LOG#g"
    printf '\nhttp://127.0.0.1:%s {\n\timport prod_logging\n\trespond "ok"\n}\n\n' "$TEST_PORT"
    printf 'http://localhost:%s {\n\timport beta_logging\n\thandle /error* {\n\t\treverse_proxy 127.0.0.1:1\n\t}\n\trespond "ok"\n}\n' "$TEST_PORT"
} >"$TEST_CONFIG"

"$CADDY_BIN" validate --config "$TEST_CONFIG" --adapter caddyfile >/dev/null
"$CADDY_BIN" run --config "$TEST_CONFIG" --adapter caddyfile >"$CADDY_OUTPUT" 2>&1 &
CADDY_PID=$!

for _ in {1..50}; do
    if curl --fail --silent --output /dev/null "http://127.0.0.1:$TEST_PORT/health"; then
        break
    fi
    if ! kill -0 "$CADDY_PID" >/dev/null 2>&1; then
        cat "$CADDY_OUTPUT" >&2
        exit 1
    fi
    sleep 0.1
done

: >"$PROD_LOG"
: >"$BETA_LOG"

curl --fail --silent --output /dev/null --path-as-is \
    --referer "https://app.yummyrecs.com/reset-password?token=prod-referer&source=email" \
    "http://127.0.0.1:$TEST_PORT/reset-password?token=prod-first&approved=visible&%74oken=prod-encoded&token=prod-last&empty="
curl --fail --silent --output /dev/null --path-as-is \
    --referer "https://beta.app.yummyrecs.com/reset-password?source=email&to%6Ben=beta-referer" \
    "http://localhost:$TEST_PORT/reset-password?approved=visible&to%6Ben=beta-encoded&token=&other=available"

ERROR_STATUS="$(curl --silent --output /dev/null --path-as-is --write-out '%{http_code}' \
    --referer "https://app.yummyrecs.com/reset-password?source=email;token=error-referer&other=available" \
    "http://localhost:$TEST_PORT/error?approved=visible;token=runtime-error")"
if [ "$ERROR_STATUS" != "502" ]; then
    echo "Expected the deliberate proxy failure to return 502, got $ERROR_STATUS" >&2
    exit 1
fi

MALFORMED_STATUS="$(curl --silent --output /dev/null --path-as-is --write-out '%{http_code}' \
    "http://127.0.0.1:$TEST_PORT/reset-password?token=malformed-escape&bad=%ZZ")"
if [ "$MALFORMED_STATUS" != "200" ]; then
    echo "Expected Caddy to accept the malformed query for log filtering, got $MALFORMED_STATUS" >&2
    exit 1
fi

curl --fail --silent --output /dev/null --path-as-is \
    "http://127.0.0.1:$TEST_PORT/reset-password?approved=visible;token=semicolon-after&token=semicolon-before;other=available"

for _ in {1..50}; do
    if [ -s "$PROD_LOG" ] && [ -s "$BETA_LOG" ]; then
        break
    fi
    sleep 0.1
done

node - "$PROD_LOG" "$BETA_LOG" "$CADDY_OUTPUT" <<'NODE'
const fs = require('node:fs');

const [prodLogPath, betaLogPath, caddyOutputPath] = process.argv.slice(2);

function readEvents(logPath) {
  const lines = fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean);

  return { events: lines.map((line) => JSON.parse(line)), raw: lines.join('\n') };
}

const prod = readEvents(prodLogPath);
const beta = readEvents(betaLogPath);
const runtime = readEvents(caddyOutputPath);
const syntheticCredentials = [
  'prod-first',
  'prod-encoded',
  'prod-last',
  'prod-referer',
  'beta-encoded',
  'beta-referer',
  'runtime-error',
  'error-referer',
  'malformed-escape',
  'semicolon-after',
  'semicolon-before',
];

for (const credential of syntheticCredentials) {
  if (prod.raw.includes(credential) || beta.raw.includes(credential) || runtime.raw.includes(credential)) {
    throw new Error(`synthetic credential ${credential} appeared in a Caddy log event`);
  }
}

const prodReset = prod.events.find((event) => event?.request?.uri?.startsWith('/reset-password?'));
const betaReset = beta.events.find((event) => event?.request?.uri?.startsWith('/reset-password?'));
const malformedReset = prod.events.find((event) => event?.request?.uri?.includes('bad=%ZZ'));
const semicolonReset = prod.events.find(
  (event) =>
    event?.request?.uri ===
    '/reset-password?approved=visible;token=REDACTED&token=REDACTED;other=available',
);
const runtimeError = runtime.events.find((event) => event?.logger?.startsWith('http.log.error'));
const expectedProdUri =
  '/reset-password?token=REDACTED&approved=visible&%74oken=REDACTED&token=REDACTED&empty=';
const expectedBetaUri = '/reset-password?approved=visible&to%6Ben=REDACTED&token=REDACTED&other=available';
const expectedProdReferer =
  'https://app.yummyrecs.com/reset-password?token=REDACTED&source=email';
const expectedBetaReferer =
  'https://beta.app.yummyrecs.com/reset-password?source=email&to%6Ben=REDACTED';

if (prodReset?.request?.uri !== expectedProdUri) {
  throw new Error(`unexpected production URI: ${prodReset?.request?.uri}`);
}
if (prodReset?.request?.headers?.Referer?.[0] !== expectedProdReferer) {
  throw new Error(`unexpected production Referer: ${prodReset?.request?.headers?.Referer?.[0]}`);
}
if (betaReset?.request?.uri !== expectedBetaUri) {
  throw new Error(`unexpected beta URI: ${betaReset?.request?.uri}`);
}
if (betaReset?.request?.headers?.Referer?.[0] !== expectedBetaReferer) {
  throw new Error(`unexpected beta Referer: ${betaReset?.request?.headers?.Referer?.[0]}`);
}
if (malformedReset?.request?.uri !== '/reset-password?token=REDACTED&bad=%ZZ') {
  throw new Error(`unexpected malformed URI: ${malformedReset?.request?.uri}`);
}
if (
  semicolonReset?.request?.uri !==
  '/reset-password?approved=visible;token=REDACTED&token=REDACTED;other=available'
) {
  throw new Error(`unexpected semicolon URI: ${semicolonReset?.request?.uri}`);
}
if (runtimeError?.request?.uri !== '/error?approved=visible;token=REDACTED') {
  throw new Error(`unexpected runtime error URI: ${runtimeError?.request?.uri}`);
}
if (
  runtimeError?.request?.headers?.Referer?.[0] !==
  'https://app.yummyrecs.com/reset-password?source=email;token=REDACTED&other=available'
) {
  throw new Error(`unexpected runtime error Referer: ${runtimeError?.request?.headers?.Referer?.[0]}`);
}
NODE

echo "Caddy access and runtime log token redaction passed for Production and Beta."
