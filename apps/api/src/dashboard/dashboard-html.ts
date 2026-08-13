import type { CanonicalEvent } from '@open-channel-hub/contracts';

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
  readonly selectedInboxId: string;
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
      : `<ol class="event-list">${input.events.map(renderEvent).join('')}</ol>`;
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
            <p class="eyebrow">OPEN CHANNEL HUB / READ ONLY</p>
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

const renderEvent = (event: CanonicalEvent): string => `
  <li class="event-card">
    <div class="event-meta">
      <span>${escapeHtml(event.channel)}</span>
      <time datetime="${escapeAttribute(event.occurredAt)}">${escapeHtml(event.occurredAt)}</time>
    </div>
    <p class="event-message">${escapeHtml(event.message.text)}</p>
    <dl>
      <div><dt>Kết nối</dt><dd>${escapeHtml(event.connectionId)}</dd></div>
      <div><dt>Hội thoại</dt><dd>${escapeHtml(event.message.conversationId)}</dd></div>
      <div><dt>Người gửi</dt><dd>${escapeHtml(event.message.senderId)}</dd></div>
    </dl>
  </li>`;

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
