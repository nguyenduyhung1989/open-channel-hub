#!/usr/bin/env bash
set -euo pipefail

# This disposable check proves the production-shaped Compose dependency path
# without contacting Telegram or using a real operator credential.
readonly project_name='open-channel-hub-ci-smoke'
readonly api_host_port='30127'
readonly operator_api_token='synthetic_operator_api_token_01234567890123456789'
readonly source_offer_url='https://github.com/nguyenduyhung1989/open-channel-hub/'
readonly webhook_secret='synthetic_webhook_secret_0123456789'
readonly webhook_payload='{"update_id":9001,"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"date":1786492800,"from":{"first_name":"Synthetic","id":42,"is_bot":false},"message_id":301,"text":"Synthetic inbound message"}}'

compose=(docker compose --project-name "$project_name" --file compose.yaml)

cleanup() {
  local exit_status=$?

  trap - EXIT ERR
  set +e
  "${compose[@]}" down --volumes --remove-orphans >&2
  exit "$exit_status"
}

diagnostics() {
  printf 'Compose smoke test diagnostics:\n' >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --no-color >&2 || true
}

on_error() {
  local exit_status=$?
  local line_number=$1

  trap - ERR
  set +e
  printf 'Compose smoke test failed at line %s.\n' "$line_number" >&2
  diagnostics
  exit "$exit_status"
}

assert_equal() {
  local expected=$1
  local actual=$2
  local label=$3

  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected %s to equal %q, received %q.\n' "$label" "$expected" "$actual" >&2
    return 1
  fi
}

wait_for_readiness() {
  local attempt
  local response

  for attempt in {1..30}; do
    if response="$(
      curl --fail --silent --connect-timeout 2 --max-time 5 \
        "http://127.0.0.1:${api_host_port}/ready"
    )" && [[ "$response" == *'"success":true'* && "$response" == *'"status":"ready"'* ]]; then
      return 0
    fi

    sleep 2
  done

  printf 'The API did not become ready within 60 seconds.\n' >&2
  return 1
}

post_webhook() {
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --data "$webhook_payload" \
    --header 'content-type: application/json' \
    --header "x-telegram-bot-api-secret-token: ${webhook_secret}" \
    --output /dev/null \
    --request POST \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/telegram-bot"
}

read_inbound_events() {
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    "http://127.0.0.1:${api_host_port}/v1/telegram-bot/inbound-events"
}

query_postgres() {
  "${compose[@]}" exec -T postgres \
    psql --username=postgres --dbname=open_channel_hub --tuples-only --no-align --command "$1"
}

trap cleanup EXIT
trap 'on_error "$LINENO"' ERR

export API_HOST_PORT="$api_host_port"
export DATABASE_PASSWORD='synthetic_database_password_0123456789'
export OPERATOR_API_TOKEN="$operator_api_token"
export POSTGRES_PASSWORD='synthetic_postgres_password_0123456789'
export SOURCE_OFFER_URL="$source_offer_url"
export TELEGRAM_BOT_ENABLED='true'
export TELEGRAM_BOT_TOKEN='synthetic-bot-token'
export TELEGRAM_CONNECTION_ID='telegram-bot-ci'
export TELEGRAM_WEBHOOK_SECRET="$webhook_secret"

# A previous interrupted run can only be cleaned when it uses this exact test project name.
"${compose[@]}" down --volumes --remove-orphans >&2 || true
"${compose[@]}" up --build --detach
wait_for_readiness

# Re-running a completed migration must be safe before live traffic is exercised.
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps migrate

assert_equal '204' "$(post_webhook)" 'first authenticated webhook status'
assert_equal '204' "$(post_webhook)" 'duplicate authenticated webhook status'

event_record="$(
  query_postgres "SELECT connection_id || ':' || provider_event_id || ':' || canonical_event_id || ':' || message_text FROM open_channel_hub.inbound_events;"
)"
assert_equal \
  'telegram-bot-ci:9001:telegram:event:9001:Synthetic inbound message' \
  "$event_record" \
  'durably stored normalized event'

migration_count="$(
  query_postgres "SELECT COUNT(*) FROM open_channel_hub.schema_migrations;"
)"
assert_equal '2' "$migration_count" 'immutable migration ledger entry count'

inbound_events_response="$(read_inbound_events)"

if [[ "$inbound_events_response" != *'"success":true'* ||
  "$inbound_events_response" != *'"connectionId":"telegram-bot-ci"'* ||
  "$inbound_events_response" != *'"text":"Synthetic inbound message"'* ||
  "$inbound_events_response" == *'rawProviderPayload'* ]]; then
  printf 'The operator inbound-event API did not return the expected canonical event.\n' >&2
  exit 1
fi

role_safety="$(
  query_postgres "SELECT CASE WHEN rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls THEN 'unsafe' ELSE 'safe' END FROM pg_roles WHERE rolname = 'open_channel_hub';"
)"
assert_equal 'safe' "$role_safety" 'application PostgreSQL role privileges'

printf 'Compose PostgreSQL smoke test passed.\n'
