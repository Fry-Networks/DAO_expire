#!/bin/sh
set -eu

TOKEN_FILE=/run/secrets/op_service_account_token

if [ ! -r "$TOKEN_FILE" ] || [ ! -s "$TOKEN_FILE" ]; then
  echo "Missing or unreadable 1Password token file: $TOKEN_FILE" >&2
  exit 1
fi

export OP_SERVICE_ACCOUNT_TOKEN="$(cat "$TOKEN_FILE")"
export OP_CONFIG_DIR="${OP_CONFIG_DIR:-/tmp/op}"
export HOME=/home/appuser

exec gosu appuser op run -- "$@"
