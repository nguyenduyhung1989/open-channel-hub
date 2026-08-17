/** Same-origin stylesheet; pages intentionally contain no inline style or script. */
export const dashboardStyle = `
:root {
  color-scheme: dark;
  --canvas: oklch(13% 0.025 252);
  --canvas-grid: oklch(20% 0.035 248 / 0.32);
  --surface: oklch(17% 0.028 250);
  --surface-raised: oklch(21% 0.034 248);
  --surface-deep: oklch(11% 0.024 250);
  --line: oklch(34% 0.035 245);
  --line-strong: oklch(48% 0.05 240);
  --ink: oklch(94% 0.018 245);
  --muted: oklch(73% 0.03 245);
  --signal: oklch(83% 0.16 162);
  --signal-ink: oklch(20% 0.052 160);
  --warning: oklch(82% 0.13 82);
  --warning-ink: oklch(25% 0.05 80);
  --danger: oklch(76% 0.14 27);
  --danger-ink: oklch(25% 0.055 25);
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: clamp(2rem, 1.4rem + 2vw, 3.5rem);
  --radius-small: 0.35rem;
  --radius-panel: 0.75rem;
  --duration-fast: 150ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --font-body: ui-sans-serif, system-ui, sans-serif;
  --font-display: ui-monospace, "Cascadia Mono", "SFMono-Regular", monospace;
  font-family: var(--font-body);
}

* { box-sizing: border-box; }
html { background: var(--canvas); }
body {
  background:
    linear-gradient(var(--canvas-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px),
    radial-gradient(circle at 100% 0%, oklch(27% 0.075 211 / 0.36), transparent 34rem),
    var(--canvas);
  background-size: 2rem 2rem, 2rem 2rem, auto, auto;
  color: var(--ink);
  margin: 0;
  min-width: 20rem;
}

button, input, select, textarea { font: inherit; }
button, .google-sign-in, .quiet-link, .scope-link, .next-page { -webkit-tap-highlight-color: transparent; }
button {
  background: var(--signal);
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  color: var(--signal-ink);
  cursor: pointer;
  font-weight: 780;
  min-height: 2.75rem;
  padding: 0.7rem 1rem;
  transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
button:hover { box-shadow: 0 0 0 0.2rem oklch(83% 0.16 162 / 0.12); }
button:active { transform: scale(0.98); }
button:focus-visible, .google-sign-in:focus-visible, .quiet-link:focus-visible, .scope-link:focus-visible, .next-page:focus-visible,
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 0.18rem solid oklch(91% 0.09 200);
  outline-offset: 0.16rem;
}

.dashboard-shell, .login-shell { margin: 0 auto; max-width: 76rem; padding: var(--space-4); }
.login-shell { align-items: center; display: flex; min-height: 100dvh; max-width: 34rem; }
.login-panel, .ledger, .scope-bar {
  background: linear-gradient(145deg, oklch(20% 0.035 248 / 0.96), oklch(15% 0.025 250 / 0.96));
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  box-shadow: 0 1.1rem 3rem oklch(5% 0.02 250 / 0.32);
}
.login-panel { padding: var(--space-5); position: relative; width: 100%; }
.login-panel::before, .dashboard-header::before {
  background: var(--signal);
  content: "";
  display: block;
  height: 0.28rem;
  left: 0;
  position: absolute;
  top: 0;
  width: 4.25rem;
}
.eyebrow {
  color: var(--signal);
  font-family: var(--font-display);
  font-size: clamp(0.66rem, 0.64rem + 0.1vw, 0.75rem);
  font-weight: 750;
  letter-spacing: 0.12em;
  margin: 0 0 var(--space-2);
}
h1, h2 { letter-spacing: -0.045em; margin: 0; }
h1 { font-size: clamp(2.1rem, 1.4rem + 4.5vw, 4.4rem); line-height: 0.95; }
h2 { font-size: clamp(1.25rem, 1rem + 1.5vw, 1.9rem); }
.lede, .scope-bar p { color: var(--muted); line-height: 1.55; }
.login-form { display: grid; gap: var(--space-4); margin-top: var(--space-5); }
label { display: grid; gap: var(--space-2); font-weight: 720; }
input, select, textarea {
  background: var(--surface-deep);
  border: 1px solid var(--line);
  border-radius: var(--radius-small);
  color: var(--ink);
  min-height: 2.75rem;
  padding: 0.6rem 0.7rem;
}
textarea { min-height: 7.5rem; resize: vertical; }
.notice {
  background: oklch(28% 0.055 25);
  border: 1px solid oklch(53% 0.12 25);
  border-radius: var(--radius-small);
  color: var(--danger);
  margin: var(--space-4) 0 0;
  padding: var(--space-3);
}
.login-separator {
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 0.76rem;
  margin: var(--space-4) 0;
  text-align: center;
}
.google-sign-in {
  align-items: center;
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-small);
  color: var(--ink);
  display: flex;
  font-weight: 780;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.7rem 1rem;
  text-decoration: none;
}
.google-sign-in:hover { background: oklch(31% 0.05 235 / 0.45); }

.dashboard-header {
  align-items: flex-start;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) 0 var(--space-5);
  position: relative;
}
.dashboard-header > div { padding-top: var(--space-3); }
.scope-bar { display: grid; gap: var(--space-4); margin: var(--space-4) 0; padding: var(--space-4); }
.scope-bar form { align-items: end; display: grid; gap: var(--space-2); grid-template-columns: 1fr; }
.scope-bar p { font-family: var(--font-display); font-size: 0.78rem; margin: 0; overflow-wrap: anywhere; }
.quiet-button, .quiet-link {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
.quiet-link {
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-small);
  font-weight: 750;
  min-height: 2.75rem;
  padding: 0.7rem 1rem;
  text-align: center;
  text-decoration: none;
}
.quiet-link:hover { background: oklch(31% 0.05 235 / 0.45); }
.scope-links { align-items: center; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.scope-label { color: var(--muted); font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; margin-right: var(--space-1); }
.scope-link {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  min-height: 2.5rem;
  padding: 0.55rem 0.72rem;
  text-decoration: none;
}
.scope-link[aria-current="page"] { background: var(--signal); border-color: var(--signal); color: var(--signal-ink); }
.scope-link:hover { border-color: var(--signal); }

.workflow-rail {
  border-bottom: 1px solid var(--line);
  border-top: 1px solid var(--line);
  margin: var(--space-5) 0;
  padding: var(--space-3) 0;
}
.workflow-rail > .eyebrow { margin-left: var(--space-1); }
.workflow-rail ol { display: grid; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.workflow-step {
  align-items: baseline;
  border-left: 0.2rem solid var(--line);
  display: grid;
  gap: var(--space-1) var(--space-2);
  grid-template-columns: 2.2rem minmax(0, 1fr);
  padding: var(--space-2) var(--space-3);
}
.workflow-step > span { color: var(--muted); font-family: var(--font-display); font-size: 0.72rem; font-weight: 750; }
.workflow-step > strong { font-size: 0.95rem; }
.workflow-step > small { color: var(--muted); font-size: 0.78rem; grid-column: 2; line-height: 1.4; }
.workflow-active { background: oklch(27% 0.055 164 / 0.32); border-left-color: var(--signal); }
.workflow-paused { border-left-color: var(--warning); }
.connection-scope {
  align-items: start;
  border: 1px solid var(--line);
  border-radius: var(--radius-small);
  display: grid;
  gap: var(--space-3);
  margin: var(--space-4) 0;
  padding: var(--space-3);
}
.connection-scope p { color: var(--muted); font-size: 0.88rem; line-height: 1.45; margin: 0; }
.connection-scope ul { display: flex; flex-wrap: wrap; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.connection-scope li { background: var(--surface-deep); border: 1px solid var(--line); border-radius: 999px; color: var(--ink); padding: 0.42rem 0.6rem; }
.connection-scope code { font-family: var(--font-display); font-size: 0.74rem; overflow-wrap: anywhere; }

.ledger { overflow: hidden; padding: var(--space-4); }
.ledger-heading { border-bottom: 1px solid var(--line); padding-bottom: var(--space-4); }
.ledger-note { color: var(--muted); font-size: 0.9rem; line-height: 1.5; margin: var(--space-2) 0 0; }
.reply-intent-form { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.event-list, .command-list { display: grid; gap: var(--space-3); list-style: none; margin: var(--space-4) 0; padding: 0; }
.event-card, .command-card {
  background: linear-gradient(135deg, oklch(17% 0.028 250), oklch(13% 0.022 250));
  border: 1px solid var(--line);
  border-left: 0.25rem solid var(--line-strong);
  border-radius: var(--radius-small);
  padding: var(--space-4);
}
.command-card { border-left-color: var(--signal); }
.event-meta { color: var(--muted); display: flex; flex-wrap: wrap; font-family: var(--font-display); font-size: 0.7rem; font-weight: 750; gap: var(--space-2) var(--space-4); letter-spacing: 0.05em; text-transform: uppercase; }
.event-message { line-height: 1.6; margin: var(--space-3) 0; overflow-wrap: anywhere; white-space: pre-wrap; }
dl { color: var(--muted); display: grid; gap: var(--space-2); margin: 0; }
dl div { align-items: start; display: grid; gap: var(--space-2); grid-template-columns: 6.3rem minmax(0, 1fr); }
dt { font-family: var(--font-display); font-size: 0.72rem; font-weight: 750; }
dd { margin: 0; overflow-wrap: anywhere; }
.command-evidence { border-top: 1px dashed var(--line); margin-top: var(--space-4); padding-top: var(--space-3); }
.evidence-title { color: var(--muted); font-family: var(--font-display); font-size: 0.72rem; font-weight: 750; letter-spacing: 0.08em; margin: 0 0 var(--space-2); text-transform: uppercase; }
.evidence-list { display: flex; flex-wrap: wrap; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.evidence-chip { border: 1px solid transparent; border-radius: 999px; font-size: 0.78rem; font-weight: 720; line-height: 1.25; padding: 0.42rem 0.6rem; }
.evidence-positive { background: oklch(30% 0.07 158); border-color: oklch(50% 0.11 158); color: oklch(91% 0.08 158); }
.evidence-warning { background: oklch(31% 0.06 78); border-color: oklch(58% 0.11 78); color: oklch(93% 0.08 86); }
.evidence-danger { background: oklch(31% 0.07 25); border-color: oklch(57% 0.13 25); color: oklch(92% 0.06 25); }
.evidence-muted { background: oklch(24% 0.025 245); border-color: var(--line); color: var(--muted); }
.empty-state { color: var(--muted); padding: var(--space-5) 0 var(--space-2); }
.next-page { color: var(--signal); display: inline-flex; font-weight: 760; min-height: 2.75rem; padding: 0.7rem 0; text-decoration: none; }
.next-page:hover { text-decoration: underline; }

@media (min-width: 42rem) {
  .dashboard-shell { padding: var(--space-6); }
  .dashboard-header { align-items: center; flex-direction: row; justify-content: space-between; }
  .scope-bar { align-items: center; grid-template-columns: minmax(0, 1fr) auto auto; }
  .scope-bar form { grid-template-columns: auto minmax(12rem, 20rem) auto; }
  .workflow-rail ol { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .workflow-step { grid-template-columns: 1fr; }
  .workflow-step > small { grid-column: auto; }
  .connection-scope { grid-template-columns: minmax(0, 1fr) minmax(16rem, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
`;
