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
readonly whatsapp_support_operator_api_token='synthetic_whatsapp_operator_support_012345678901234567'
readonly whatsapp_sales_operator_api_token='synthetic_whatsapp_operator_sales_0123456789012345678'
readonly support_inbox_api_token='synthetic_inbox_support_token_01234567890123456789'
readonly sales_inbox_api_token='synthetic_inbox_sales_token_01234567890123456789012'
readonly support_outbound_client_operation_id='synthetic-reply-support-0001'
readonly support_outbound_text='Synthetic durable reply intent'
readonly support_outbound_conflicting_text='Synthetic conflicting reply intent'
readonly support_outbound_history_client_operation_id='synthetic-reply-history-support-0001'
readonly support_outbound_history_text='Synthetic queued history reply'
readonly whatsapp_webhook_payload='{"object":"whatsapp_business_account","entry":[{"id":"900000000000000501","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"900000000000000601"},"messages":[{"from":"900000000000000701","id":"wamid.synthetic.901","timestamp":"1786492800","type":"text","text":{"body":"Synthetic WhatsApp Business inbound message"}}]}}]},{"id":"900000000000000501","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"900000000000000602"},"messages":[{"from":"900000000000000702","id":"wamid.synthetic.901","timestamp":"1786492800","type":"text","text":{"body":"Synthetic WhatsApp Business inbound message"}}]}}]}]}'
# This loopback-only HTTP smoke intentionally omits the optional browser dashboard.
# Secure cookies plus the exact external HTTPS origin are exercised by route tests, not by this Compose run.
readonly runtime_connections_configuration='{"version":1,"connections":[{"id":"telegram-bot-support","type":"telegram_bot","botToken":"synthetic-bot-token-support","operatorApiToken":"synthetic_operator_support_01234567890123456789","webhookSecret":"synthetic_support_webhook_secret_0123456789","webhookUrl":"https://example.test/v1/webhooks/telegram-bot/telegram-bot-support"},{"id":"telegram-bot-sales","type":"telegram_bot","botToken":"synthetic-bot-token-sales","operatorApiToken":"synthetic_operator_sales_0123456789012345678901","webhookSecret":"synthetic_sales_webhook_secret_01234567890123456789","webhookUrl":"https://example.test/v1/webhooks/telegram-bot/telegram-bot-sales"},{"id":"zalo-oa-support","type":"zalo_oa","appId":"900000000000000001","oaId":"900000000000000101","oaSecretKey":"synthetic-zalo-oa-support-secret-$-key","operatorApiToken":"synthetic_zalo_operator_support_012345678901234567","webhookUrl":"https://example.test/v1/webhooks/zalo-oa"},{"id":"zalo-oa-sales","type":"zalo_oa","appId":"900000000000000002","oaId":"900000000000000102","oaSecretKey":"synthetic-zalo-oa-sales-secret-$-key","operatorApiToken":"synthetic_zalo_operator_sales_0123456789012345678","webhookUrl":"https://example.test/v1/webhooks/zalo-oa"},{"id":"facebook-page-support","type":"facebook_page","appId":"900000000000000003","pageId":"900000000000000301","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_facebook_operator_support_012345678901234567","webhookUrl":"https://example.test/v1/webhooks/meta"},{"id":"facebook-page-sales","type":"facebook_page","appId":"900000000000000003","pageId":"900000000000000302","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_facebook_operator_sales_0123456789012345678","webhookUrl":"https://example.test/v1/webhooks/meta"},{"id":"whatsapp-business-support","type":"whatsapp_business","appId":"900000000000000003","wabaId":"900000000000000501","phoneNumberId":"900000000000000601","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_whatsapp_operator_support_012345678901234567","webhookUrl":"https://example.test/v1/webhooks/meta"},{"id":"whatsapp-business-sales","type":"whatsapp_business","appId":"900000000000000003","wabaId":"900000000000000501","phoneNumberId":"900000000000000602","appSecret":"synthetic-facebook-app-secret-$-value-01234567890","webhookVerifyToken":"synthetic-facebook-verify-token-012345678901234567","operatorApiToken":"synthetic_whatsapp_operator_sales_0123456789012345678","webhookUrl":"https://example.test/v1/webhooks/meta"}],"inboxes":[{"id":"support-inbox","token":"synthetic_inbox_support_token_01234567890123456789","connectionIds":["telegram-bot-support","zalo-oa-support","facebook-page-support","whatsapp-business-support"]},{"id":"sales-inbox","token":"synthetic_inbox_sales_token_01234567890123456789012","connectionIds":["telegram-bot-sales","zalo-oa-sales","facebook-page-sales","whatsapp-business-sales"]}]}'

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

meta_webhook_signature() {
  local app_secret=$1
  local raw_json=$2

  printf '%s' "$raw_json" \
    | openssl dgst -sha256 -hmac "$app_secret" \
    | awk '{print $2}'
}

post_meta_webhook() {
  local raw_json=$1
  local signature=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --data-binary "$raw_json" \
    --header 'content-type: application/json' \
    --header "x-hub-signature-256: sha256=${signature}" \
    --output /dev/null \
    --request POST \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/meta"
}

verify_meta_webhook() {
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    "http://127.0.0.1:${api_host_port}/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${facebook_webhook_verify_token}&hub.challenge=synthetic-meta-challenge"
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

read_whatsapp_business_inbound_events() {
  local operator_api_token=$1

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    "http://127.0.0.1:${api_host_port}/v1/whatsapp-business/inbound-events"
}

read_whatsapp_business_inbound_events_status() {
  local operator_api_token=$1
  local cursor=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${operator_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/whatsapp-business/inbound-events?cursor=${cursor}"
}

read_inbox_inbound_events() {
  local inbox_api_token=$1
  local query=${2:-}
  local url="http://127.0.0.1:${api_host_port}/v1/inbox/inbound-events"

  if [[ -n "$query" ]]; then
    url+="?${query}"
  fi

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${inbox_api_token}" \
    "$url"
}

read_inbox_inbound_events_status() {
  local inbox_api_token=$1
  local query=${2:-}
  local url="http://127.0.0.1:${api_host_port}/v1/inbox/inbound-events"

  if [[ -n "$query" ]]; then
    url+="?${query}"
  fi

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${inbox_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$url"
}

post_inbox_outbound_command() {
  local inbox_api_token=$1
  local request_body=$2

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --data "$request_body" \
    --header "authorization: Bearer ${inbox_api_token}" \
    --header 'content-type: application/json' \
    --request POST \
    --write-out $'\n%{http_code}' \
    "http://127.0.0.1:${api_host_port}/v1/inbox/outbound-commands"
}

read_inbox_outbound_command_history() {
  local inbox_api_token=$1
  local query=${2:-}
  local url="http://127.0.0.1:${api_host_port}/v1/inbox/outbound-commands"

  if [[ -n "$query" ]]; then
    url+="?${query}"
  fi

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${inbox_api_token}" \
    "$url"
}

read_inbox_outbound_command_history_status() {
  local inbox_api_token=$1
  local query=${2:-}
  local url="http://127.0.0.1:${api_host_port}/v1/inbox/outbound-commands"

  if [[ -n "$query" ]]; then
    url+="?${query}"
  fi

  curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --header "authorization: Bearer ${inbox_api_token}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$url"
}

outbound_command_request_body() {
  local client_operation_id=$1
  local source_connection_id=$2
  local source_provider_event_id=$3
  local text=$4

  printf '{"clientOperationId":"%s","sourceConnectionId":"%s","sourceProviderEventId":"%s","text":"%s"}' \
    "$client_operation_id" \
    "$source_connection_id" \
    "$source_provider_event_id" \
    "$text"
}

http_response_body() {
  local response=$1

  printf '%s' "${response%$'\n'*}"
}

http_response_status() {
  local response=$1

  printf '%s' "${response##*$'\n'}"
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

assert_inbox_event_response() {
  local response=$1
  local expected_connection_one=$2
  local expected_connection_two=$3
  local expected_connection_three=$4
  local expected_connection_four=$5
  local forbidden_connection_one=$6
  local forbidden_connection_two=$7
  local forbidden_connection_three=$8
  local forbidden_connection_four=$9

  if [[ "$response" != *'"success":true'* ||
    "$response" != *"\"connectionId\":\"${expected_connection_one}\""* ||
    "$response" != *"\"connectionId\":\"${expected_connection_two}\""* ||
    "$response" != *"\"connectionId\":\"${expected_connection_three}\""* ||
    "$response" != *"\"connectionId\":\"${expected_connection_four}\""* ||
    "$response" == *"\"connectionId\":\"${forbidden_connection_one}\""* ||
    "$response" == *"\"connectionId\":\"${forbidden_connection_two}\""* ||
    "$response" == *"\"connectionId\":\"${forbidden_connection_three}\""* ||
    "$response" == *"\"connectionId\":\"${forbidden_connection_four}\""* ||
    "$response" == *'rawProviderPayload'* ]]; then
    printf 'The aggregate inbox API did not preserve configured scope or canonical-only output.\n' >&2
    return 1
  fi
}

assert_response_contains_no_secret() {
  local response=$1
  shift
  local candidate_secret

  for candidate_secret in "$@"; do
    if [[ "$response" == *"${candidate_secret}"* ]]; then
      printf 'A synthetic secret escaped through the aggregate inbox API.\n' >&2
      return 1
    fi
  done
}

assert_safe_outbound_command_response() {
  local response=$1
  local expected_connection_id=$2
  local expected_provider_event_id=$3
  local forbidden_text=$4

  if [[ "$response" != *'"success":true'* ||
    "$response" != *"\"sourceConnectionId\":\"${expected_connection_id}\""* ||
    "$response" != *"\"sourceProviderEventId\":\"${expected_provider_event_id}\""* ||
    "$response" != *'"state":"queued"'* ||
    "$response" == *'replyTargetId'* ||
    "$response" == *'sourceMessageId'* ||
    "$response" == *'sourceChannel'* ||
    "$response" == *'clientOperationId'* ||
    "$response" == *'rawProviderPayload'* ||
    "$response" == *'"raw"'* ||
    "$response" == *'"credentials"'* ||
    "$response" == *'"credential"'* ||
    "$response" == *"${forbidden_text}"* ||
    "$response" == *'-1001234567890'* ||
    "$response" == *'"telegram_bot"'* ]]; then
    printf 'The outbound-command API did not keep its public response safe and source-bound.\n' >&2
    return 1
  fi
}

assert_safe_outbound_command_history_response() {
  local response=$1
  local expected_connection_id=$2
  local expected_provider_event_id=$3
  local expected_text=$4
  local forbidden_text=${5:-}

  if [[ "$response" != *'"success":true'* ||
    "$response" != *'"commands":[{'* ||
    "$response" != *'"id":"'* ||
    "$response" != *"\"sourceConnectionId\":\"${expected_connection_id}\""* ||
    "$response" != *"\"sourceProviderEventId\":\"${expected_provider_event_id}\""* ||
    "$response" != *"\"text\":\"${expected_text}\""* ||
    "$response" != *'"state":"queued"'* ||
    "$response" != *'"createdAt":"'* ||
    "$response" == *'replyTargetId'* ||
    "$response" == *'sourceMessageId'* ||
    "$response" == *'sourceChannel'* ||
    "$response" == *'clientOperationId'* ||
    "$response" == *'rawProviderPayload'* ||
    "$response" == *'"raw"'* ||
    "$response" == *'"credentials"'* ||
    "$response" == *'"credential"'* ||
    "$response" == *'recipientId'* ||
    "$response" == *'-1001234567890'* ||
    "$response" == *'"telegram_bot"'* ||
    (-n "$forbidden_text" && "$response" == *"${forbidden_text}"*) ]]; then
    printf 'The outbound-command history API did not return the permitted scoped projection.\n' >&2
    return 1
  fi
}

assert_empty_outbound_command_history_response() {
  local response=$1
  local forbidden_connection_id=$2
  local forbidden_text=$3

  if [[ "$response" != *'"success":true'* ||
    "$response" != *'"commands":[]'* ||
    "$response" == *"\"sourceConnectionId\":\"${forbidden_connection_id}\""* ||
    "$response" == *"${forbidden_text}"* ||
    "$response" == *'replyTargetId'* ||
    "$response" == *'clientOperationId'* ||
    "$response" == *'rawProviderPayload'* ||
    "$response" == *'"raw"'* ||
    "$response" == *'"credentials"'* ||
    "$response" == *'"credential"'* ]]; then
    printf 'The outbound-command history API did not keep the empty inbox scope safe.\n' >&2
    return 1
  fi
}

extract_next_cursor() {
  local response=$1
  local cursor

  cursor="$(printf '%s' "$response" | sed -n 's/.*"nextCursor":"\([A-Za-z0-9_-]*\)".*/\1/p')"

  if [[ ! "$cursor" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf 'The aggregate inbox API did not return a valid opaque next cursor.\n' >&2
    return 1
  fi

  printf '%s' "$cursor"
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
  'synthetic-meta-challenge' \
  "$(verify_meta_webhook)" \
  'shared Meta webhook verification challenge'
facebook_signature="$(meta_webhook_signature "$facebook_app_secret" "$facebook_webhook_payload")"
facebook_changed_webhook_payload="${facebook_webhook_payload/Synthetic Facebook Page inbound message/Synthetic  Facebook Page inbound message}"
assert_equal \
  '401' \
  "$(post_meta_webhook "$facebook_changed_webhook_payload" "$facebook_signature")" \
  'shared Meta Facebook Page one-byte-different raw JSON rejection'
assert_equal \
  '200' \
  "$(post_meta_webhook "$facebook_webhook_payload" "$facebook_signature")" \
  'first shared Meta Facebook Page multi-Page webhook status'
assert_equal \
  '200' \
  "$(post_meta_webhook "$facebook_webhook_payload" "$facebook_signature")" \
  'duplicate shared Meta Facebook Page multi-Page webhook status'

whatsapp_signature="$(meta_webhook_signature "$facebook_app_secret" "$whatsapp_webhook_payload")"
whatsapp_changed_webhook_payload="${whatsapp_webhook_payload/Synthetic WhatsApp Business inbound message/Synthetic  WhatsApp Business inbound message}"
assert_equal \
  '401' \
  "$(post_meta_webhook "$whatsapp_changed_webhook_payload" "$whatsapp_signature")" \
  'shared Meta WhatsApp Business one-byte-different raw JSON rejection'
assert_equal \
  '200' \
  "$(post_meta_webhook "$whatsapp_webhook_payload" "$whatsapp_signature")" \
  'first shared Meta WhatsApp Business multi-phone webhook status'
assert_equal \
  '200' \
  "$(post_meta_webhook "$whatsapp_webhook_payload" "$whatsapp_signature")" \
  'duplicate shared Meta WhatsApp Business multi-phone webhook status'

event_records="$(
  query_postgres "SELECT connection_id || ':' || provider_event_id || ':' || canonical_event_id || ':' || message_text FROM open_channel_hub.inbound_events ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:facebook-message-901:facebook-page:facebook-page-sales:event:facebook-message-901:Synthetic Facebook Page inbound message\nfacebook-page-support:facebook-message-901:facebook-page:facebook-page-support:event:facebook-message-901:Synthetic Facebook Page inbound message\ntelegram-bot-sales:9001:telegram:event:9001:Synthetic inbound message\ntelegram-bot-support:9001:telegram:event:9001:Synthetic inbound message\nwhatsapp-business-sales:wamid.synthetic.901:whatsapp-business:whatsapp-business-sales:event:wamid.synthetic.901:Synthetic WhatsApp Business inbound message\nwhatsapp-business-support:wamid.synthetic.901:whatsapp-business:whatsapp-business-support:event:wamid.synthetic.901:Synthetic WhatsApp Business inbound message\nzalo-oa-sales:zalo-message-901:zalo-oa:zalo-oa-sales:event:zalo-message-901:Synthetic Zalo OA inbound message\nzalo-oa-support:zalo-message-901:zalo-oa:zalo-oa-support:event:zalo-message-901:Synthetic Zalo OA inbound message' \
  "$event_records" \
  'eight connection-scoped normalized events with repeated provider event ids'

per_connection_event_counts="$(
  query_postgres "SELECT connection_id || ':' || COUNT(*) FROM open_channel_hub.inbound_events GROUP BY connection_id ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:1\nfacebook-page-support:1\ntelegram-bot-sales:1\ntelegram-bot-support:1\nwhatsapp-business-sales:1\nwhatsapp-business-support:1\nzalo-oa-sales:1\nzalo-oa-support:1' \
  "$per_connection_event_counts" \
  'duplicate event idempotency within every connection'

migration_count="$(
  query_postgres "SELECT COUNT(*) FROM open_channel_hub.schema_migrations;"
)"
assert_equal '9' "$migration_count" 'immutable migration ledger entry count'

connection_registry_records="$(
  query_postgres "SELECT connection_id || ':' || connector_id || ':' || channel || ':' || tier FROM open_channel_hub.connection_registry ORDER BY connection_id;"
)"
assert_equal \
  $'facebook-page-sales:facebook-page:facebook_page:OFFICIAL\nfacebook-page-support:facebook-page:facebook_page:OFFICIAL\ntelegram-bot-sales:telegram-bot:telegram_bot:OFFICIAL\ntelegram-bot-support:telegram-bot:telegram_bot:OFFICIAL\nwhatsapp-business-sales:whatsapp-business:whatsapp_business:OFFICIAL\nwhatsapp-business-support:whatsapp-business:whatsapp_business:OFFICIAL\nzalo-oa-sales:zalo-oa:zalo_oa:OFFICIAL\nzalo-oa-support:zalo-oa:zalo_oa:OFFICIAL' \
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

whatsapp_provider_identity_fingerprints="$(
  query_postgres "SELECT connection_id || ':' || CASE WHEN provider_identity_fingerprint ~ '^[a-f0-9]{64}$' THEN 'present' ELSE 'missing' END FROM open_channel_hub.connection_registry WHERE channel = 'whatsapp_business' ORDER BY connection_id;"
)"
assert_equal \
  $'whatsapp-business-sales:present\nwhatsapp-business-support:present' \
  "$whatsapp_provider_identity_fingerprints" \
  'non-secret WhatsApp Business provider identity fingerprints'

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

whatsapp_support_inbound_events_response="$(
  read_whatsapp_business_inbound_events "$whatsapp_support_operator_api_token"
)"
whatsapp_sales_inbound_events_response="$(
  read_whatsapp_business_inbound_events "$whatsapp_sales_operator_api_token"
)"

assert_scoped_event_response \
  "$whatsapp_support_inbound_events_response" \
  'whatsapp-business-support' \
  'whatsapp-business-sales'
assert_scoped_event_response \
  "$whatsapp_sales_inbound_events_response" \
  'whatsapp-business-sales' \
  'whatsapp-business-support'

support_inbox_inbound_events_response="$(
  read_inbox_inbound_events "$support_inbox_api_token" 'limit=100'
)"
sales_inbox_inbound_events_response="$(
  read_inbox_inbound_events "$sales_inbox_api_token" 'limit=100'
)"

assert_inbox_event_response \
  "$support_inbox_inbound_events_response" \
  'telegram-bot-support' \
  'zalo-oa-support' \
  'facebook-page-support' \
  'whatsapp-business-support' \
  'telegram-bot-sales' \
  'zalo-oa-sales' \
  'facebook-page-sales' \
  'whatsapp-business-sales'
assert_inbox_event_response \
  "$sales_inbox_inbound_events_response" \
  'telegram-bot-sales' \
  'zalo-oa-sales' \
  'facebook-page-sales' \
  'whatsapp-business-sales' \
  'telegram-bot-support' \
  'zalo-oa-support' \
  'facebook-page-support' \
  'whatsapp-business-support'

assert_response_contains_no_secret \
  "$support_inbox_inbound_events_response" \
  "$support_operator_api_token" \
  "$sales_operator_api_token" \
  "$support_webhook_secret" \
  "$sales_webhook_secret" \
  "$zalo_support_oa_secret_key" \
  "$zalo_sales_oa_secret_key" \
  "$facebook_app_secret" \
  "$facebook_webhook_verify_token" \
  "$support_inbox_api_token" \
  "$sales_inbox_api_token" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"
assert_response_contains_no_secret \
  "$sales_inbox_inbound_events_response" \
  "$support_operator_api_token" \
  "$sales_operator_api_token" \
  "$support_webhook_secret" \
  "$sales_webhook_secret" \
  "$zalo_support_oa_secret_key" \
  "$zalo_sales_oa_secret_key" \
  "$facebook_app_secret" \
  "$facebook_webhook_verify_token" \
  "$support_inbox_api_token" \
  "$sales_inbox_api_token" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"

support_outbound_request_body="$(
  outbound_command_request_body \
    "$support_outbound_client_operation_id" \
    'telegram-bot-support' \
    '9001' \
    "$support_outbound_text"
)"
support_outbound_created_response="$(
  post_inbox_outbound_command "$support_inbox_api_token" "$support_outbound_request_body"
)"
support_outbound_created_status="$(http_response_status "$support_outbound_created_response")"
support_outbound_created_body="$(http_response_body "$support_outbound_created_response")"
assert_equal '201' "$support_outbound_created_status" 'first source-bound reply-command status'
assert_safe_outbound_command_response \
  "$support_outbound_created_body" \
  'telegram-bot-support' \
  '9001' \
  "$support_outbound_text"
assert_response_contains_no_secret \
  "$support_outbound_created_body" \
  "$support_inbox_api_token" \
  "$support_operator_api_token" \
  "$support_webhook_secret" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"

support_outbound_replay_response="$(
  post_inbox_outbound_command "$support_inbox_api_token" "$support_outbound_request_body"
)"
support_outbound_replay_status="$(http_response_status "$support_outbound_replay_response")"
support_outbound_replay_body="$(http_response_body "$support_outbound_replay_response")"
assert_equal '200' "$support_outbound_replay_status" 'exact source-bound reply-command replay status'
assert_equal \
  "$support_outbound_created_body" \
  "$support_outbound_replay_body" \
  'exact source-bound reply-command replay body'

support_outbound_conflicting_request_body="$(
  outbound_command_request_body \
    "$support_outbound_client_operation_id" \
    'telegram-bot-support' \
    '9001' \
    "$support_outbound_conflicting_text"
)"
support_outbound_conflict_response="$(
  post_inbox_outbound_command "$support_inbox_api_token" "$support_outbound_conflicting_request_body"
)"
support_outbound_conflict_status="$(http_response_status "$support_outbound_conflict_response")"
assert_equal '409' "$support_outbound_conflict_status" 'conflicting source-bound reply-command status'

outside_scope_outbound_request_body="$(
  outbound_command_request_body \
    'synthetic-reply-outside-scope-0001' \
    'telegram-bot-sales' \
    '9001' \
    "$support_outbound_text"
)"
outside_scope_outbound_response="$(
  post_inbox_outbound_command "$support_inbox_api_token" "$outside_scope_outbound_request_body"
)"
outside_scope_outbound_status="$(http_response_status "$outside_scope_outbound_response")"
outside_scope_outbound_body="$(http_response_body "$outside_scope_outbound_response")"
assert_equal '404' "$outside_scope_outbound_status" 'out-of-scope reply-command source status'

missing_source_outbound_request_body="$(
  outbound_command_request_body \
    'synthetic-reply-missing-source-0001' \
    'telegram-bot-support' \
    'missing-9001' \
    "$support_outbound_text"
)"
missing_source_outbound_response="$(
  post_inbox_outbound_command "$support_inbox_api_token" "$missing_source_outbound_request_body"
)"
missing_source_outbound_status="$(http_response_status "$missing_source_outbound_response")"
missing_source_outbound_body="$(http_response_body "$missing_source_outbound_response")"
assert_equal '404' "$missing_source_outbound_status" 'missing reply-command source status'
assert_equal \
  "$outside_scope_outbound_body" \
  "$missing_source_outbound_body" \
  'out-of-scope and missing reply-command source responses'

support_outbound_history_request_body="$(
  outbound_command_request_body \
    "$support_outbound_history_client_operation_id" \
    'telegram-bot-support' \
    '9001' \
    "$support_outbound_history_text"
)"
support_outbound_history_created_response="$(
  post_inbox_outbound_command \
    "$support_inbox_api_token" \
    "$support_outbound_history_request_body"
)"
support_outbound_history_created_status="$(
  http_response_status "$support_outbound_history_created_response"
)"
support_outbound_history_created_body="$(
  http_response_body "$support_outbound_history_created_response"
)"
assert_equal \
  '201' \
  "$support_outbound_history_created_status" \
  'second source-bound reply-command status for history pagination'
assert_safe_outbound_command_response \
  "$support_outbound_history_created_body" \
  'telegram-bot-support' \
  '9001' \
  "$support_outbound_history_text"
assert_response_contains_no_secret \
  "$support_outbound_history_created_body" \
  "$support_inbox_api_token" \
  "$support_operator_api_token" \
  "$support_webhook_secret" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"

support_outbound_command_count="$(
  query_postgres "SELECT COUNT(*) FROM open_channel_hub.outbound_commands WHERE connection_id = 'telegram-bot-support' AND client_operation_id IN ('${support_outbound_client_operation_id}', '${support_outbound_history_client_operation_id}');"
)"
assert_equal '2' "$support_outbound_command_count" 'two stored source-bound reply commands for history pagination'

support_outbound_source_derivation="$(
  query_postgres "SELECT connection_id || ':' || source_provider_event_id || ':' || reply_target_id || ':' || source_message_id || ':' || source_channel || ':' || state FROM open_channel_hub.outbound_commands WHERE connection_id = 'telegram-bot-support' AND client_operation_id = '${support_outbound_client_operation_id}';"
)"
assert_equal \
  'telegram-bot-support:9001:-1001234567890:301:telegram_bot:queued' \
  "$support_outbound_source_derivation" \
  'source-derived private reply target, message ID, channel, and queued state'

outbound_command_schema_guards="$(
  query_postgres "SELECT CASE WHEN (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'open_channel_hub.outbound_commands'::regclass AND conname IN ('outbound_commands_source_event_fk', 'outbound_commands_connection_client_operation_unique')) = 2 AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'open_channel_hub.outbound_commands'::regclass AND tgname = 'outbound_commands_immutable' AND NOT tgisinternal) THEN 'present' ELSE 'missing' END;"
)"
assert_equal 'present' "$outbound_command_schema_guards" 'source foreign key, idempotency constraint, and immutable trigger'

support_outbound_history_queued_rows="$(
  query_postgres "SELECT CASE WHEN COUNT(*) = 2 AND COUNT(*) FILTER (WHERE state = 'queued') = 2 THEN 'present' ELSE 'missing' END FROM open_channel_hub.outbound_commands WHERE connection_id = 'telegram-bot-support' AND client_operation_id IN ('${support_outbound_client_operation_id}', '${support_outbound_history_client_operation_id}');"
)"
assert_equal \
  'present' \
  "$support_outbound_history_queued_rows" \
  'queued outbound-command rows are present in PostgreSQL'

support_outbound_history_first_page_response="$(
  read_inbox_outbound_command_history "$support_inbox_api_token" 'limit=1'
)"
assert_safe_outbound_command_history_response \
  "$support_outbound_history_first_page_response" \
  'telegram-bot-support' \
  '9001' \
  "$support_outbound_history_text" \
  "$support_outbound_text"
support_outbound_history_cursor="$(
  extract_next_cursor "$support_outbound_history_first_page_response"
)"
assert_response_contains_no_secret \
  "$support_outbound_history_first_page_response" \
  "$support_inbox_api_token" \
  "$sales_inbox_api_token" \
  "$support_operator_api_token" \
  "$support_webhook_secret" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"

support_outbound_history_second_page_response="$(
  read_inbox_outbound_command_history \
    "$support_inbox_api_token" \
    "cursor=${support_outbound_history_cursor}"
)"
assert_safe_outbound_command_history_response \
  "$support_outbound_history_second_page_response" \
  'telegram-bot-support' \
  '9001' \
  "$support_outbound_text" \
  "$support_outbound_history_text"
assert_response_contains_no_secret \
  "$support_outbound_history_second_page_response" \
  "$support_inbox_api_token" \
  "$sales_inbox_api_token" \
  "$support_operator_api_token" \
  "$support_webhook_secret" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"

sales_outbound_history_response="$(
  read_inbox_outbound_command_history "$sales_inbox_api_token" 'limit=100'
)"
assert_empty_outbound_command_history_response \
  "$sales_outbound_history_response" \
  'telegram-bot-support' \
  "$support_outbound_history_text"
assert_response_contains_no_secret \
  "$sales_outbound_history_response" \
  "$support_inbox_api_token" \
  "$sales_inbox_api_token" \
  "$support_operator_api_token" \
  "$support_webhook_secret" \
  "$DATABASE_PASSWORD" \
  "$POSTGRES_PASSWORD"
assert_equal \
  '400' \
  "$(read_inbox_outbound_command_history_status "$sales_inbox_api_token" "cursor=${support_outbound_history_cursor}")" \
  'cross-inbox outbound-command history cursor rejection'
assert_equal \
  '401' \
  "$(read_inbox_outbound_command_history_status "$support_operator_api_token" 'cursor=not-a-history-cursor')" \
  'account bearer rejection before outbound-command history cursor validation'
assert_equal \
  '400' \
  "$(read_inbox_outbound_command_history_status "$support_inbox_api_token" 'cursor=not-a-history-cursor')" \
  'malformed outbound-command history cursor rejection'

assert_equal \
  '401' \
  "$(read_inbox_inbound_events_status "$support_operator_api_token")" \
  'account bearer rejection at the aggregate inbox route'

support_inbox_first_page_response="$(
  read_inbox_inbound_events "$support_inbox_api_token" 'limit=1'
)"
support_inbox_cursor="$(extract_next_cursor "$support_inbox_first_page_response")"
assert_equal \
  '200' \
  "$(read_inbox_inbound_events_status "$support_inbox_api_token" "cursor=${support_inbox_cursor}")" \
  'same-inbox cursor continuation'
assert_equal \
  '400' \
  "$(read_inbox_inbound_events_status "$sales_inbox_api_token" "cursor=${support_inbox_cursor}")" \
  'cross-inbox cursor rejection'
assert_equal \
  '401' \
  "$(read_inbound_events_status "$support_inbox_api_token" '')" \
  'inbox bearer rejection at an account route'

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

whatsapp_cross_connection_cursor="$(
  printf '%s' '{"beforeSequence":"1","connectionId":"whatsapp-business-support","snapshotMaxSequence":"1"}' \
    | base64 \
    | tr '+/' '-_' \
    | tr -d '=\n'
)"
assert_equal \
  '400' \
  "$(read_whatsapp_business_inbound_events_status "$whatsapp_sales_operator_api_token" "$whatsapp_cross_connection_cursor")" \
  'WhatsApp Business cross-connection cursor rejection'

runtime_connection_secret_permissions="$(
  "${compose[@]}" exec -T api stat -c '%u:%g:%a' /run/secrets/runtime_connections_base64
)"
assert_equal '10001:10001:400' "$runtime_connection_secret_permissions" 'runtime connection secret permissions'

role_safety="$(
  query_postgres "SELECT CASE WHEN rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls THEN 'unsafe' ELSE 'safe' END FROM pg_roles WHERE rolname = 'open_channel_hub';"
)"
assert_equal 'safe' "$role_safety" 'application PostgreSQL role privileges'

printf 'Compose PostgreSQL smoke test passed.\n'
