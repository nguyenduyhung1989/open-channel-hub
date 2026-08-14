import { randomUUID } from 'node:crypto';

import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { OutboundReplyCommandHistoryEntry } from '@open-channel-hub/domain';

export interface DashboardLoginPageInput {
  readonly csrfToken: string;
  readonly message?: 'invalid' | 'throttled';
}

export interface DashboardPageInput {
  readonly csrfToken: string;
  readonly events: readonly CanonicalEvent[];
  readonly inboxes: readonly Readonly<{ id: string }>[];
  readonly nextCursor?: string;
  readonly principalId: string;
  readonly replyIntentEnabled: boolean;
  readonly selectedInboxId: string;
}

export interface DashboardOutboundCommandHistoryPageInput {
  readonly commands: readonly OutboundReplyCommandHistoryEntry[];
  readonly csrfToken: string;
  readonly inboxes: readonly Readonly<{ id: string }>[];
  readonly nextCursor?: string;
  readonly principalId: string;
  readonly selectedInboxId: string;
  readonly telegramDeliveryAuthorizationEnabled: boolean;
}

/** Renders a no-script login page with an explicit anti-forgery form token. */
export const renderDashboardLoginPage = (input: DashboardLoginPageInput): string =>
  renderDocument({
    body: `
      <main class="login-shell" aria-labelledby="dashboard-title">
        <section class="login-panel">
          <p class="eyebrow">OPEN CHANNEL HUB</p>
          <h1 id="dashboard-title">Bảng tín hiệu</h1>
          <p class="lede">Đăng nhập để xem các tin nhắn đã được cấp quyền.</p>
          ${
            input.message === undefined
              ? ''
              : `<p class="notice" role="status">${
                  input.message === 'throttled'
                    ? 'Đã có quá nhiều lần thử. Hãy chờ một lát rồi thử lại.'
                    : 'Thông tin đăng nhập không hợp lệ.'
                }</p>`
          }
          <form action="/operator/session" method="post" class="login-form">
            <input type="hidden" name="csrf" value="${escapeAttribute(input.csrfToken)}">
            <label>
              <span>Mã người vận hành</span>
              <input autocomplete="username" maxlength="128" name="principal" required>
            </label>
            <label>
              <span>Mật khẩu</span>
              <input autocomplete="current-password" maxlength="512" name="password" required type="password">
            </label>
            <button type="submit">Mở bảng tín hiệu</button>
          </form>
        </section>
      </main>`
  });

/** Renders only canonical persisted content and escapes every dynamic field. */
export const renderDashboardPage = (input: DashboardPageInput): string => {
  const inboxOptions = input.inboxes
    .map(
      (inbox) =>
        `<option value="${escapeAttribute(inbox.id)}"${
          inbox.id === input.selectedInboxId ? ' selected' : ''
        }>${escapeHtml(inbox.id)}</option>`
    )
    .join('');
  const eventRows =
    input.events.length === 0
      ? '<p class="empty-state">Chưa có tín hiệu nào trong phạm vi này.</p>'
      : `<ol class="event-list">${input.events
          .map((event) => renderEvent(event, input))
          .join('')}</ol>`;
  const nextPage =
    input.nextCursor === undefined
      ? ''
      : `<a class="next-page" href="/operator?inbox=${encodeURIComponent(
          input.selectedInboxId
        )}&cursor=${encodeURIComponent(input.nextCursor)}">Xem trang tiếp theo</a>`;

  return renderDocument({
    body: `
      <main class="dashboard-shell" aria-labelledby="dashboard-title">
        <header class="dashboard-header">
          <div>
            <p class="eyebrow">OPEN CHANNEL HUB / BẢNG ĐIỀU HÀNH</p>
            <h1 id="dashboard-title">Bảng tín hiệu</h1>
          </div>
          <form action="/operator/logout" method="post">
            <input type="hidden" name="csrf" value="${escapeAttribute(input.csrfToken)}">
            <button class="quiet-button" type="submit">Đăng xuất</button>
          </form>
        </header>
        <section class="scope-bar" aria-label="Phạm vi hộp thư">
          <form action="/operator" method="get">
            <label for="inbox">Hộp thư</label>
            <select id="inbox" name="inbox">${inboxOptions}</select>
            <button class="quiet-button" type="submit">Đổi phạm vi</button>
          </form>
          <a class="quiet-link" href="/operator/outbound-commands?inbox=${encodeURIComponent(
            input.selectedInboxId
          )}">Ý định trả lời đang chờ</a>
          <p>Người vận hành: <strong>${escapeHtml(input.principalId)}</strong></p>
        </section>
        <section class="ledger" aria-labelledby="ledger-title">
          <div class="ledger-heading">
            <p class="eyebrow">SỔ SỰ KIỆN / MỚI NHẤT TRƯỚC</p>
            <h2 id="ledger-title">${escapeHtml(input.selectedInboxId)}</h2>
          </div>
          ${eventRows}
          ${nextPage}
        </section>
      </main>`
  });
};

/** Renders queued reply intents without exposing a bearer or delivery path. */
export const renderDashboardOutboundCommandHistoryPage = (
  input: DashboardOutboundCommandHistoryPageInput
): string => {
  const inboxLinks = input.inboxes
    .map(
      (inbox) =>
        `<a class="scope-link" href="/operator/outbound-commands?inbox=${encodeURIComponent(
          inbox.id
        )}"${inbox.id === input.selectedInboxId ? ' aria-current="page"' : ''}>${escapeHtml(
          inbox.id
        )}</a>`
    )
    .join('');
  const commandRows =
    input.commands.length === 0
      ? '<p class="empty-state">Chưa có ý định trả lời nào đang chờ trong phạm vi này.</p>'
      : `<ol class="command-list">${input.commands
          .map((command) => renderOutboundCommand(command, input))
          .join('')}</ol>`;
  const nextPage =
    input.nextCursor === undefined
      ? ''
      : `<a class="next-page" href="/operator/outbound-commands?inbox=${encodeURIComponent(
          input.selectedInboxId
        )}&cursor=${encodeURIComponent(input.nextCursor)}">Xem trang tiếp theo</a>`;

  return renderDocument({
    body: `
      <main class="dashboard-shell" aria-labelledby="dashboard-title">
        <header class="dashboard-header">
          <div>
            <p class="eyebrow">OPEN CHANNEL HUB / HÀNG ĐỢI</p>
            <h1 id="dashboard-title">Bảng tín hiệu</h1>
          </div>
          <form action="/operator/logout" method="post">
            <input type="hidden" name="csrf" value="${escapeAttribute(input.csrfToken)}">
            <button class="quiet-button" type="submit">Đăng xuất</button>
          </form>
        </header>
        <section class="scope-bar" aria-label="Phạm vi hộp thư">
          <nav class="scope-links" aria-label="Chọn hộp thư">
            <span class="scope-label">Hộp thư</span>
            ${inboxLinks}
          </nav>
          <a class="quiet-link" href="/operator?inbox=${encodeURIComponent(
            input.selectedInboxId
          )}">Xem tin nhắn đến</a>
          <p>Người vận hành: <strong>${escapeHtml(input.principalId)}</strong></p>
        </section>
        <section class="ledger" aria-labelledby="ledger-title">
          <div class="ledger-heading">
            <p class="eyebrow">Ý ĐỊNH TRẢ LỜI / MỚI NHẤT TRƯỚC</p>
            <h2 id="ledger-title">${escapeHtml(input.selectedInboxId)}</h2>
            <p class="ledger-note">Các mục này mới chỉ được ghi nhận; chưa có tin nào được gửi đến nhà cung cấp.</p>
          </div>
          ${commandRows}
          ${nextPage}
        </section>
      </main>`
  });
};

const renderEvent = (event: CanonicalEvent, input: DashboardPageInput): string => `
  <li class="event-card">
    <div class="event-meta">
      <span>${escapeHtml(event.channel)}</span>
      <time datetime="${escapeAttribute(event.occurredAt)}">${escapeHtml(event.occurredAt)}</time>
    </div>
    <p class="event-message">${escapeHtml(event.message.text)}</p>
    <dl>
      <div><dt>Kết nối</dt><dd>${escapeHtml(event.connectionId)}</dd></div>
    </dl>
    ${input.replyIntentEnabled ? renderReplyIntentForm(event, input) : ''}
  </li>`;

/**
 * Associates one native form with one persisted inbound event. The only
 * editable value is reply text; source identity and the UUID idempotency key
 * are freshly generated server-side and encoded as escaped hidden inputs.
 */
const renderReplyIntentForm = (event: CanonicalEvent, input: DashboardPageInput): string => `
  <form action="/operator/reply-intents" method="post" class="reply-intent-form">
    <input type="hidden" name="csrf" value="${escapeAttribute(input.csrfToken)}">
    <input type="hidden" name="inbox" value="${escapeAttribute(input.selectedInboxId)}">
    <input type="hidden" name="sourceConnectionId" value="${escapeAttribute(event.connectionId)}">
    <input type="hidden" name="sourceProviderEventId" value="${escapeAttribute(event.providerEventId)}">
    <input type="hidden" name="clientOperationId" value="${escapeAttribute(randomUUID())}">
    <label>
      <span>Nội dung trả lời</span>
      <textarea maxlength="2000" name="text" required rows="4"></textarea>
    </label>
    <button type="submit">Ghi ý định trả lời</button>
  </form>`;

const renderOutboundCommand = (
  command: OutboundReplyCommandHistoryEntry,
  input: DashboardOutboundCommandHistoryPageInput
): string => `
  <li class="command-card">
    <div class="event-meta">
      <span>ĐÃ GHI, CHƯA GỬI</span>
      <time datetime="${escapeAttribute(command.createdAt)}">${escapeHtml(command.createdAt)}</time>
    </div>
    <p class="event-message">${escapeHtml(command.text)}</p>
    <dl>
      <div><dt>Kết nối</dt><dd>${escapeHtml(command.sourceConnectionId)}</dd></div>
    </dl>
    ${
      input.telegramDeliveryAuthorizationEnabled && command.telegramDeliveryAuthorizationEligible
        ? renderTelegramDeliveryAuthorizationForm(command, input)
        : ''
    }
  </li>`;

/**
 * The command ID is a non-secret, server-validated transport reference. This
 * form records only an immutable approval fact; it cannot send, retry, or
 * create a delivery attempt.
 */
const renderTelegramDeliveryAuthorizationForm = (
  command: OutboundReplyCommandHistoryEntry,
  input: DashboardOutboundCommandHistoryPageInput
): string => `
  <form action="/operator/telegram-delivery-authorizations" method="post" class="reply-intent-form">
    <input type="hidden" name="csrf" value="${escapeAttribute(input.csrfToken)}">
    <input type="hidden" name="inbox" value="${escapeAttribute(input.selectedInboxId)}">
    <input type="hidden" name="commandId" value="${escapeAttribute(command.id)}">
    <p class="ledger-note">Có thể ghi chấp thuận Telegram cho mục này. Thao tác này chưa gửi tin.</p>
    <button type="submit">Ghi chấp thuận Telegram</button>
  </form>`;

const renderDocument = (input: Readonly<{ body: string }>): string => `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1" name="viewport">
    <title>Open Channel Hub</title>
    <link href="/operator/assets/dashboard.css" rel="stylesheet">
  </head>
  <body>${input.body}
  </body>
</html>`;

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });

const escapeAttribute = (value: string): string => escapeHtml(value);
