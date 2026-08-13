# Phase 4f dashboard source-bound reply intents

**Status:** source verified at exact commit `74fca30`. It passed `npm run
check` (54 test files / 358 tests and build), `npm audit --audit-level=low`
with zero findings, Gitleaks with no secrets, `git diff --check`, a synthetic
Compose smoke with cleanup, an independent security audit APPROVE with zero
high/medium findings, and GitHub checks `Verify Node 24.18.1` and `Analyze
JavaScript and TypeScript`. This evidence must not be read as public-TLS,
live-provider, provider-send, or production evidence.

Phase 4f adds one constrained browser write: a configured dashboard principal
may record a source-bound reply intent from a persisted inbound event for an
explicitly granted inbox. It does **not** send, retry, cancel, update, deliver,
or mark a message read.

`queued` means PostgreSQL recorded an immutable intent. It is not provider
acceptance, a send attempt, delivery, or a read receipt.

## Prerequisites and explicit write grant

All Phase 4b dashboard prerequisites remain required: PostgreSQL, the existing
`0008_dashboard_sessions` migration, an exact public HTTPS origin, signed
`Secure` `HttpOnly` session cookies, and a proxy that preserves `Origin`,
`Cookie`, and `Set-Cookie` without logging secret values. The existing Phase
4c `0009_outbound_reply_commands` migration must also be available because the
form records through that immutable ledger.

Dashboard principals remain read-only unless their runtime-secret entry
contains `replyIntentInboxIds`. This optional array is a unique subset of that
principal's readable `inboxIds`; every value must already be a configured
inbox. Omission is exactly equivalent to an empty array.

```json
{
  "dashboard": {
    "principals": [
      {
        "id": "support-agent",
        "passwordHash": "<Argon2id PHC value>",
        "inboxIds": ["support-inbox", "sales-inbox"],
        "replyIntentInboxIds": ["support-inbox"]
      }
    ]
  }
}
```

In this example the principal can read both inboxes but may record a reply
intent only in `support-inbox`. The server rejects a duplicate, malformed,
unknown, or non-readable `replyIntentInboxIds` member during configuration
loading. This field changes dashboard authorization only; it adds no provider
credential, browser bearer, environment variable, Compose service, or database
migration.

Treat the entire runtime document as a secret. Do not put real dashboard
password hashes, session keys, inbox bearers, provider credentials, message
text, or source identifiers in Git, a shell command, issue, pull request,
screenshot, or log.

## What the browser can do

After a configured principal signs in at `/operator/login`, `/operator` shows
a native reply-intent form inside each rendered inbound event card only when
the selected inbox is in that principal's `replyIntentInboxIds` allow-list.
For a read-only inbox, no form is rendered.

The only editable input is reply text. The server renders escaped hidden values
for the selected inbox, canonical source connection ID, canonical provider
event ID, the current anti-forgery token, and a freshly generated UUIDv4 client
operation ID. The form carries no caller-editable recipient, source channel,
or source-message field, and it exposes no inbox bearer, provider credential,
reply target, command ID, or provider-send control. The ordinary inbound event
card renders only its canonical channel, occurrence time, message text, and
connection ID. It omits `conversationId`, `senderId`, a reply target, and a
source-message ID; its read-only channel display is not a reply-form authority.

Those hidden source values are not a security boundary. A submitted form is
validated again at the server, the principal's explicit write grant is resolved
there, and the existing Phase 4c command path accepts only a durable source
event inside that inbox's fixed connection scope. PostgreSQL derives the
private reply target from canonical source data; there is no recipient field.

The form submits `POST /operator/reply-intents`. It requires all of these:

- an active signed dashboard session;
- the exact configured HTTPS `Origin`;
- a matching dashboard anti-forgery value; and
- one strict, non-duplicated form value for each required field.

The text must contain non-blank content and is limited to 2,000 characters.
The source connection ID and provider event ID are bounded canonical
identifiers. The operation ID must be a UUIDv4. Extra, duplicate, malformed,
or client-chosen recipient/delivery fields are not accepted.

The whole URL-encoded form is capped at 32 KiB before parsing. An oversized
form receives `413` and reaches no dashboard recorder; this does not increase
the 2,000-character text limit. Operator HTML responses, including this
parser-rejected `413` page, use `Cache-Control: no-store`; the same-origin
dashboard stylesheet remains separately cacheable.

## Result and safe operator behavior

A new durable command and an exact idempotent replay both use post/redirect/get:
the response is a `303` redirect to
`/operator/outbound-commands?inbox=<allowed inbox>`. It carries no command
result query value. The queued-history row is the only browser evidence of a
durable record; the redirect itself is not proof that a provider accepted,
sent, delivered, or read a message. The URL carries only the allowed opaque
inbox label, never a bearer, command ID, source ID, recipient, or delivery
result. An added `notice` query value is outside the strict history-query
contract and is rejected; do not use a crafted URL as evidence that an intent
was recorded.

| Result         | Meaning and operator action                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `303`          | The intent was recorded or the exact same operation was already recorded. Inspect the queued-history row; the redirect carries no command-result signal and is not a provider-send or delivery result.    |
| `303` to login | The submitted form had no usable active session. The server clears the dashboard cookie and redirects to `/operator/login?error=invalid`; sign in again rather than assuming that an intent was recorded. |
| `400`          | The form is malformed, has an extra field, or repeats a field. Return to the rendered event form rather than editing hidden values.                                                                       |
| `403`          | Exact-origin or anti-forgery validation failed. Submit only through the rendered dashboard form at the configured HTTPS origin.                                                                           |
| `413`          | The complete form body exceeded the 32 KiB transport cap. Reduce it only by returning to the rendered form; do not put message content in a URL or browser-side retry queue.                              |
| `404`          | The principal lacks the explicit write grant, or the source is absent or outside the selected inbox scope. The response is intentionally generic.                                                         |
| `409`          | The same client operation ID was presented with a different source or text. Do not try to replace an immutable command through the dashboard.                                                             |
| `429`          | The local dashboard write guard is full. Wait before trying again; this does not mean a provider rejected a message.                                                                                      |
| `500`          | The server could not safely complete the recording request. Do not infer send or delivery, and do not add a browser-side automatic retry.                                                                 |

The operation ID is generated by the server for each rendered form. Repeating
the exact same submitted form can reach the existing durable idempotency rule,
but operators must not turn uncertainty into a blind retry loop. A later
provider dispatcher needs its own official-provider attempt, timeout, receipt,
and retry design.

## Rate and proxy boundary

The application permits at most 20 recording attempts in a rolling minute for
one configured dashboard principal. This is an in-memory, one-process guard; it
does not coordinate multiple application processes, hosts, or browser sessions.
It neither replaces nor configures an edge rate limit.

Before exposing this endpoint beyond a controlled network, configure and test
the HTTPS proxy to rate-limit `POST /operator/reply-intents`, preserve the
exact `Origin` header, avoid logging cookies/form bodies/message text, and keep
PostgreSQL private. The supplied Docker Compose smoke remains loopback HTTP and
does not configure the dashboard or submit this form. The passed smoke with
cleanup proves only the unchanged synthetic base stack; it does not prove the
required external HTTPS cookie/origin behavior.

## What Phase 4f deliberately does not do

- No inbox bearer or provider credential in HTML, JavaScript, a URL, browser
  storage, or a browser API request.
- No recipient picker, reply target, source-message disclosure, command ID,
  raw provider payload, provider token/OAuth storage, provider HTTP client,
  worker, queue, dispatch, retry, attempt, timeout policy, receipt,
  delivery/read status, cancellation, or command mutation. The operation ID is
  a hidden transport value, not displayed command metadata. The ordinary
  inbound card's read-only canonical channel display is not a source-channel
  form field or delivery metadata.
- No new PostgreSQL migration, table, index, trigger, or state model. It uses
  the existing immutable `outbound_commands` ledger and its source-bound
  idempotency rule.
- No real Telegram, Zalo OA, Facebook Page, WhatsApp Business, public TLS, or
  production authorization proof. The Phase 1a Telegram direct-send endpoint
  remains unrelated legacy compatibility behavior.
