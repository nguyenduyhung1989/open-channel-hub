#!/usr/bin/env bash
set -euo pipefail

# This disposable check proves the production-shaped Compose dependency path
# without contacting an external provider or using a real operator credential.
readonly project_name='open-channel-hub-ci-smoke'
readonly api_host_port='30127'
readonly source_offer_url='https://github.com/nguyenduyhung1989/open-channel-hub/'
readonly support_operator_api_token='synthetic_operator_support_01234567890123456789'
readonly support_webhook_secret='synthetic_support_webhook_secret_0123456789'
readonly sales_operator_api_token='synthetic_operator_sales_0123456789012345678901'
readonly sales_webhook_secret='synthetic_sales_webhook_secret_01234567890123456789'
readonly webhook_payload='{"update_id":9001,"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"date":1786492800,"from":{"first_name":"Synthetic","id":42,"is_bot":false},"message_id":301,"text":"Synthetic inbound message"}}'
readonly zalo_support_app_id='900000000000000001'
readonly zalo_sales_app_id='900000000000000002'
readonly zalo_support_oa_secret_key='synthetic-zalo-oa-support-secret-$-key'
readonly zalo_sales_oa_secret_key='synthetic-zalo-oa-sales-secret-$-key'
readonly zalo_support_operator_api_token='synthetic_zalo_operator_support_012345678901234567'
readonly zalo_sales_operator_api_token='synthetic_zalo_operator_sales_0123456789012345678'
readonly zalo_timestamp='1786492800000'
readonly zalo_support_webhook_payload='{"timestamp":"1786492800000", "recipient":{"id":"900000000000000101"},"message":{"text":"Synthetic Zalo OA inbound message","msg_id":"zalo-message-901"},"event_name":"user_send_text","sender":{"id":"900000000000000201"},"app_id":"900000000000000001"}'
readonly zalo_sales_webhook_payload='{"app_id":"900000000000000002","sender":{"id":"900000000000000202"},"event_name":"user_send_text","message":{"msg_id":"zalo-message-901","text":"Synthetic Zalo OA inbound message"},"recipient":{"id":"900000000000000102"},"timestamp":"1786492800000"}'
readonly facebook_app_id='900000000000000003'
readonly facebook_app_secret='synthetic-facebook-app-secret-$-value-01234567890'
readonly facebook_webhook_verify_token='synthetic-facebook-verify-token-012345678901234567'
readonly facebook_support_operator_api_token='synthetic_facebook_operator_support_012345678901234567'
readonly facebook_sales_operator_api_token='synthetic_facebook_operator_sales_0123456789012345678'
readonly facebook_webhook_payload='{"object":"page","entry":[{"id":"900000000000000301","messaging":[{"sender":{"id":"900000000000000401"},"recipient":{"id":"900000000000000301"},"timestamp":1786492800000,"message":{"mid":"facebook-message-901","text":"Synthetic Facebook Page inbound message"}}]},{"id":"900000000000000302","messaging":[{"sender":{"id":"900000000000000402"},"recipient":{"id":"900000000000000302"},"timestamp":1786492800000,"message":{"mid":"facebook-message-901","text":"Synthetic Facebook Page inbound message"}}]}]}'
readonly runtime_connections_configuration='{"version":1,"connections":[{"id":"telegram-bot-support","type":"telegram_bot","botToken":"synthetic-bot-token-support","operatorApiToken":"synthetic_operator_support_01234567890123456789","webhookSecret":"synthetic_support_webhook_secret_0123456789","webhookUrl":"https://example.test/v1/webhooks/telegram-bot/telegram-bot-support"},{"id":"telegram-bot-sales","type":"telegram_bot","botToken":"synthetic-bot-token-sales","operatorApiToken":"synthetic_operator_sales_0123456789012345678901","webhookSecret":"synthetic_sales_webhook_secret_01234567890123456789","webhookUrl":"https://example.test/v1/webhooks/telegram-bot/telegram-bot-sales"},{"id":"zalo-oa-support","type":"zalo_oa","appId":"900000000000000001","oaId":"900000000000000101","oaSecretKey":"synthetic-zalo-oa-support-secret-$-key","operatorApiToken":"synthetic_zalo_operator_support_012345678901234567","webhookUrl":"https://example.test/v1/webhooks/zalo-oa"},{"id":"zalo-oa-sales","type":"zalo_oa","appId":"900000000000000002","oaId":"900000000000000102","oaSecretKey":"synthetic-zalo-oa-sales-secret-$-key","operatorApiToken":"synthetic_zalo_operator_sales_0123456789012345678","webhookUrl":"https://example.test/v1/webhooks/zalo-oa"},{"id":"facebook-page-support","type":"facebook_page","appId":"900000000000000003","pageId":"900000000000000301","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_facebook_operator_support_012345678901234567","webhookUrl":"https://example.test/v1/webhooks/facebook-page"},{"id":"facebook-page-sales","type":"facebook_page","appId":"900000000000000003","pageId":"900000000000000302","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_facebook_operator_sales_0123456789012345678","webhookUrl":"https://example.test/v1/webhooks/facebook-page"}]}'

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
  local connection_id=$1
  local webhook_secret=$2

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --data "$webhook_payload" \
    --header 'content-type: application/json' \
    --header "x-telegram-bot-api-secret-token: ${webhook_secret}" \
    --output /dev/null \
    --request POST \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/telegram-bot/${connection_id}"
}

read_inbound_events() {
  local operator_api_token=$1

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    "http://127.0.0.1:${api_host_port}/v1/telegram-bot/inbound-events"
}

read_inbound_events_status() {
  local operator_api_token=$1
  local cursor=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/telegram-bot/inbound-events?cursor=${cursor}"
}

zalo_webhook_signature() {
  local app_id=$1
  local oa_secret_key=$2
  local raw_json=$3
  local timestamp=$4

  printf '%s' "${app_id}${raw_json}${timestamp}${oa_secret_key}" \
    | sha256sum \
    | awk '{print $1}'
}

post_zalo_oa_webhook() {
  local raw_json=$1
  local signature=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --data-binary "$raw_json" \
    --header 'content-type: application/json' \
    --header "x-zevent-signature: ${signature}" \
    --output /dev/null \
    --request POST \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/zalo-oa"
}

read_zalo_oa_inbound_events() {
  local operator_api_token=$1

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    "http://127.0.0.1:${api_host_port}/v1/zalo-oa/inbound-events"
}

read_zalo_oa_inbound_events_status() {
  local operator_api_token=$1
  local cursor=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/zalo-oa/inbound-events?cursor=${cursor}"
}

facebook_webhook_signature() {
  local app_secret=$1
  local raw_json=$2

  printf '%s' "$raw_json" \
    | openssl dgst -sha256 -hmac "$app_secret" \
    | awk '{print $2}'
}

post_facebook_page_webhook() {
  local raw_json=$1
  local signature=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --data-binary "$raw_json" \
    --header 'content-type: application/json' \
    --header "x-hub-signature-256: sha256=${signature}" \
    --output /dev/null \
    --request POST \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/facebook-page"
}

verify_facebook_page_webhook() {
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/facebook-page?hub.mode=subscribe&hub.verify_token=${facebook_webhook_verify_token}&hub.challenge=synthetic-facebook-challenge"
}

read_facebook_page_inbound_events() {
  local operator_api_token=$1

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    "http://127.0.0.1:${api_host_port}/v1/facebook-page/inbound-events"
}

read_facebook_page_inbound_events_status() {
  local operator_api_token=$1
  local cursor=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/facebook-page/inbound-events?cursor=${cursor}"
}

query_postgres() {
  "${compose[@]}" exec -T postgres \
    psql --username=postgres --dbname=open_channel_hub --tuples-only --no-align --command "$1"
}

assert_scoped_event_response() {
  local response=$1
  local expected_connection_id=$2
  local forbidden_connection_id=$3

  if [[ "$response" != *'"success":true'* ||
    "$response" != *"\"connectionId\":\"${expected_connection_id}\""* ||
    "$response" == *"${forbidden_connection_id}"* ||
    "$response" == *'rawProviderPayload'* ]]; then
    printf 'The operator inbound-event API did not remain scoped to the configured connection.\n' >&2
    return 1
  fi
}

trap cleanup EXIT
trap 'on_error "$LINENO"' ERR

export API_HOST_PORT="$api_host_port"
export CONNECTIONS_CONFIG_BASE64="$(printf '%s' "$runtime_connections_configuration" | base64 | tr '+/' '-_' | tr -d '=\n')"
export DATABASE_PASSWORD='synthetic_database_password_0123456789'
export POSTGRES_PASSWORD='synthetic_postgres_password_0123456789'
export SOURCE_OFFER_URL="$source_offer_url"
export TELEGRAM_BOT_ENABLED='false'
unset CONNECTIONS_CONFIG_BASE64_FILE
unset CONNECTIONS_CONFIG_FILE
unset OPERATOR_API_TOKEN
unset TELEGRAM_BOT_TOKEN
unset TELEGRAM_CONNECTION_ID
unset TELEGRAM_WEBHOOK_SECRET
unset TELEGRAM_WEBHOOK_URL

# A previous interrupted run can only be cleaned when it uses this exact test project name.
"${compose[@]}" down --volumes --remove-orphans >&2 || true
"${compose[@]}" up --build --detach
wait_for_readiness

# Re-running a completed migration must be safe before live traffic is exercised.
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps migrate

assert_equal \
  '204' \
  "$(post_webhook 'telegram-bot-support' "$support_webhook_secret")" \
  'first support webhook status'
assert_equal \
  '204' \
  "$(post_webhook 'telegram-bot-support' "$support_webhook_secret")" \
  'duplicate support webhook status'
assert_equal \
  '204' \
  "$(post_webhook 'telegram-bot-sales' "$sales_webhook_secret")" \
  'sales webhook status with the same provider event id'

# This valid signature covers the original byte sequence. A changed body with
# the same header must fail, proving the raw JSON is not reserialized first.
zalo_support_signature="$(zalo_webhook_signature "$zalo_support_app_id" "$zalo_support_oa_secret_key" "$zalo_support_webhook_payload" "$zalo_timestamp")"
zalo_changed_webhook_payload="${zalo_support_webhook_payload/Synthetic Zalo OA inbound message/Synthetic  Zalo OA inbound message}"
assert_equal \
  '401' \
  "$(post_zalo_oa_webhook "$zalo_changed_webhook_payload" "$zalo_support_signature")" \
  'Zalo OA one-byte-different raw JSON rejection'
assert_equal \
  '200' \
  "$(post_zalo_oa_webhook "$zalo_support_webhook_payload" "$zalo_support_signature")" \
  'first Zalo OA support webhook status'
assert_equal \
  '200' \
  "$(post_zalo_oa_webhook "$zalo_support_webhook_payload" "$zalo_support_signature")" \
  'duplicate Zalo OA support webhook status'
zalo_sales_signature="$(zalo_webhook_signature "$zalo_sales_app_id" "$zalo_sales_oa_secret_key" "$zalo_sales_webhook_payload" "$zalo_timestamp")"
assert_equal \
  '200' \
  "$(post_zalo_oa_webhook "$zalo_sales_webhook_payload" "$zalo_sales_signature")" \
  'Zalo OA sales webhook status with the same provider message id'

assert_equal \
  'synthetic-facebook-challenge' \
  "$(verify_facebook_page_webhook)" \
  'Facebook Page webhook verification challenge'
facebook_signature="$(facebook_webhook_signature "$facebook_app_secret" "$facebook_webhook_payload")"
facebook_changed_webhook_payload="${facebook_webhook_payload/Synthetic Facebook Page inbound message/Synthetic  Facebook Page inbound message}"
assert_equal \
  '401' \
  "$(post_facebook_page_webhook "$facebook_changed_webhook_payload" "$facebook_signature")" \
  'Facebook Page one-byte-different raw JSON rejection'
assert_equal \
  '200' \
  "$(post_facebook_page_webhook "$facebook_webhook_payload" "$facebook_signature")" \
  'first Facebook Page multi-Page webhook status'
assert_equal \
  '200' \
  "$(post_facebook_page_webhook "$facebook_webhook_payload" "$facebook_signature")" \
  'duplicate Facebook Page multi-Page webhook status'

event_records="$(
  query_postgres "SELECT connection_id || ':' || provider_event_id || ':' || canonical_event_id || ':' || message_text FROM open_channel_hub.inbound_events ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:facebook-message-901:facebook-page:facebook-page-sales:event:facebook-message-901:Synthetic Facebook Page inbound message\nfacebook-page-support:facebook-message-901:facebook-page:facebook-page-support:event:facebook-message-901:Synthetic Facebook Page inbound message\ntelegram-bot-sales:9001:telegram:event:9001:Synthetic inbound message\ntelegram-bot-support:9001:telegram:event:9001:Synthetic inbound message\nzalo-oa-sales:zalo-message-901:zalo-oa:zalo-oa-sales:event:zalo-message-901:Synthetic Zalo OA inbound message\nzalo-oa-support:zalo-message-901:zalo-oa:zalo-oa-support:event:zalo-message-901:Synthetic Zalo OA inbound message' \
  "$event_records" \
  'six connection-scoped normalized events with repeated provider event ids'

per_connection_event_counts="$(
  query_postgres "SELECT connection_id || ':' || COUNT(*) FROM open_channel_hub.inbound_events GROUP BY connection_id ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:1\nfacebook-page-support:1\ntelegram-bot-sales:1\ntelegram-bot-support:1\nzalo-oa-sales:1\nzalo-oa-support:1' \
  "$per_connection_event_counts" \
  'duplicate event idempotency within every connection'

migration_count="$(
  query_postgres "SELECT COUNT(*) FROM open_channel_hub.schema_migrations;"
)"
assert_equal '6' "$migration_count" 'immutable migration ledger entry count'

connection_registry_records="$(
  query_postgres "SELECT connection_id || ':' || connector_id || ':' || channel || ':' || tier FROM open_channel_hub.connection_registry ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:facebook-page:facebook_page:OFFICIAL\nfacebook-page-support:facebook-page:facebook_page:OFFICIAL\ntelegram-bot-sales:telegram-bot:telegram_bot:OFFICIAL\ntelegram-bot-support:telegram-bot:telegram_bot:OFFICIAL\nzalo-oa-sales:zalo-oa:zalo_oa:OFFICIAL\nzalo-oa-support:zalo-oa:zalo_oa:OFFICIAL' \
  "$connection_registry_records" \
  'registered official connection identity records'

zalo_provider_identity_fingerprints="$(
  query_postgres "SELECT connection_id || ':' || CASE WHEN provider_identity_fingerprint ~ '^[a-f0-9]{64}$' THEN 'present' ELSE 'missing' END FROM open_channel_hub.connection_registry WHERE channel = 'zalo_oa' ORDER BY connection_id;"
)"
assert_equal \
  $'zalo-oa-sales:present\nzalo-oa-support:present' \
  "$zalo_provider_identity_fingerprints" \
  'non-secret Zalo OA provider identity fingerprints'

facebook_provider_identity_fingerprints="$(
  query_postgres "SELECT connection_id || ':' || CASE WHEN provider_identity_fingerprint ~ '^[a-f0-9]{64}$' THEN 'present' ELSE 'missing' END FROM open_channel_hub.connection_registry WHERE channel = 'facebook_page' ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:present\nfacebook-page-support:present' \
  "$facebook_provider_identity_fingerprints" \
  'non-secret Facebook Page provider identity fingerprints'

telegram_provider_identity_fingerprints="$(
  query_postgres "SELECT connection_id || ':' || CASE WHEN provider_identity_fingerprint IS NULL THEN 'absent' ELSE 'unexpected' END FROM open_channel_hub.connection_registry WHERE channel = 'telegram_bot' ORDER BY connection_id;"
)"
assert_equal \
  $'telegram-bot-sales:absent\ntelegram-bot-support:absent' \
  "$telegram_provider_identity_fingerprints" \
  'no unsupported Telegram provider identity fingerprint'

support_inbound_events_response="$(read_inbound_events "$support_operator_api_token")"
sales_inbound_events_response="$(read_inbound_events "$sales_operator_api_token")"

assert_scoped_event_response \
  "$support_inbound_events_response" \
  'telegram-bot-support' \
  'telegram-bot-sales'
assert_scoped_event_response \
  "$sales_inbound_events_response" \
  'telegram-bot-sales' \
  'telegram-bot-support'

zalo_support_inbound_events_response="$(read_zalo_oa_inbound_events "$zalo_support_operator_api_token")"
zalo_sales_inbound_events_response="$(read_zalo_oa_inbound_events "$zalo_sales_operator_api_token")"

assert_scoped_event_response \
  "$zalo_support_inbound_events_response" \
  'zalo-oa-support' \
  'zalo-oa-sales'
assert_scoped_event_response \
  "$zalo_sales_inbound_events_response" \
  'zalo-oa-sales' \
  'zalo-oa-support'

facebook_support_inbound_events_response="$(
  read_facebook_page_inbound_events "$facebook_support_operator_api_token"
)"
facebook_sales_inbound_events_response="$(
  read_facebook_page_inbound_events "$facebook_sales_operator_api_token"
)"

assert_scoped_event_response \
  "$facebook_support_inbound_events_response" \
  'facebook-page-support' \
  'facebook-page-sales'
assert_scoped_event_response \
  "$facebook_sales_inbound_events_response" \
  'facebook-page-sales' \
  'facebook-page-support'

cross_connection_cursor="$(
  printf '%s' '{"beforeSequence":"1","connectionId":"telegram-bot-support","snapshotMaxSequence":"1"}' \
    | base64 \
    | tr '+/' '-_' \
    | tr -d '=\n'
)"
assert_equal \
  '400' \
  "$(read_inbound_events_status "$sales_operator_api_token" "$cross_connection_cursor")" \
  'cross-connection cursor rejection'

zalo_cross_connection_cursor="$(
  printf '%s' '{"beforeSequence":"1","connectionId":"zalo-oa-support","snapshotMaxSequence":"1"}' \
    | base64 \
    | tr '+/' '-_' \
    | tr -d '=\n'
)"
assert_equal \
  '400' \
  "$(read_zalo_oa_inbound_events_status "$zalo_sales_operator_api_token" "$zalo_cross_connection_cursor")" \
  'Zalo OA cross-connection cursor rejection'

facebook_cross_connection_cursor="$(
  printf '%s' '{"beforeSequence":"1","connectionId":"facebook-page-support","snapshotMaxSequence":"1"}' \
    | base64 \
    | tr '+/' '-_' \
    | tr -d '=\n'
)"
assert_equal \
  '400' \
  "$(read_facebook_page_inbound_events_status "$facebook_sales_operator_api_token" "$facebook_cross_connection_cursor")" \
  'Facebook Page cross-connection cursor rejection'

runtime_connection_secret_permissions="$(
  "${compose[@]}" exec -T api stat -c '%u:%g:%a' /run/secrets/runtime_connections_base64
)"
assert_equal '10001:10001:400' "$runtime_connection_secret_permissions" 'runtime connection secret permissions'

role_safety="$(
  query_postgres "SELECT CASE WHEN rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls THEN 'unsafe' ELSE 'safe' END FROM pg_roles WHERE rolname = 'open_channel_hub';"
)"
assert_equal 'safe' "$role_safety" 'application PostgreSQL role privileges'

printf 'Compose PostgreSQL smoke test passed.\n'
