/** Same-origin stylesheet; pages intentionally contain no inline style or script. */
export const dashboardStyle = `
:root {
  color-scheme: dark;
  --canvas: #090d13;
  --panel: #111925;
  --line: #2b394b;
  --ink: #e5edf7;
  --muted: #93a4b8;
  --signal: #55e6b3;
  --signal-ink: #062219;
  --danger: #ffb2aa;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

* { box-sizing: border-box; }
body { background: radial-gradient(circle at top right, #17263a 0, var(--canvas) 42rem); color: var(--ink); margin: 0; min-width: 20rem; }
button, input, select, textarea { font: inherit; }
button { background: var(--signal); border: 0; border-radius: .45rem; color: var(--signal-ink); cursor: pointer; font-weight: 750; padding: .72rem 1rem; }
button:hover, button:focus-visible { outline: .16rem solid #d9fff1; outline-offset: .15rem; }
.dashboard-shell, .login-shell { margin: 0 auto; max-width: 72rem; padding: 1.25rem; }
.login-shell { align-items: center; display: flex; min-height: 100vh; max-width: 32rem; }
.login-panel, .ledger, .scope-bar { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); border-radius: .75rem; }
.login-panel { padding: 1.5rem; width: 100%; }
.eyebrow { color: var(--signal); font-size: .72rem; font-weight: 800; letter-spacing: .12em; margin: 0 0 .45rem; }
h1, h2 { letter-spacing: -.035em; margin: 0; }
h1 { font-size: clamp(2rem, 9vw, 3.5rem); }
h2 { font-size: clamp(1.25rem, 5vw, 1.75rem); }
.lede, .scope-bar p { color: var(--muted); line-height: 1.55; }
.login-form { display: grid; gap: 1rem; margin-top: 1.5rem; }
label { display: grid; gap: .4rem; font-weight: 700; }
input, select, textarea { background: #08101a; border: 1px solid var(--line); border-radius: .45rem; color: var(--ink); min-height: 2.7rem; padding: .55rem .65rem; }
textarea { resize: vertical; }
.notice { background: #3c2024; border: 1px solid #8f3c44; border-radius: .45rem; color: var(--danger); padding: .7rem; }
.dashboard-header, .scope-bar { display: flex; flex-direction: column; gap: 1rem; }
.dashboard-header { border-bottom: 1px solid var(--line); padding-bottom: 1.25rem; }
.scope-bar { margin: 1rem 0; padding: 1rem; }
.scope-bar form { align-items: end; display: grid; gap: .55rem; grid-template-columns: 1fr; }
.quiet-button, .quiet-link { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.quiet-link { border-radius: .45rem; font-weight: 750; padding: .72rem 1rem; text-decoration: none; }
.quiet-link:hover, .quiet-link:focus-visible { outline: .16rem solid #d9fff1; outline-offset: .15rem; }
.scope-links { align-items: center; display: flex; flex-wrap: wrap; gap: .45rem; }
.scope-label { color: var(--muted); font-weight: 700; margin-right: .15rem; }
.scope-link { border: 1px solid var(--line); border-radius: 999px; color: var(--ink); font-size: .88rem; font-weight: 700; padding: .4rem .65rem; text-decoration: none; }
.scope-link[aria-current="page"] { background: var(--signal); border-color: var(--signal); color: var(--signal-ink); }
.scope-link:hover, .scope-link:focus-visible { outline: .16rem solid #d9fff1; outline-offset: .15rem; }
.ledger { padding: 1rem; }
.reply-intent-form { display: grid; gap: 1rem; }
.ledger-heading { border-bottom: 1px solid var(--line); padding-bottom: .9rem; }
.ledger-note { color: var(--muted); line-height: 1.5; margin: .65rem 0 0; }
.event-list, .command-list { display: grid; gap: .75rem; list-style: none; margin: 1rem 0; padding: 0; }
.event-card, .command-card { background: #0b121d; border: 1px solid #243347; border-radius: .55rem; padding: 1rem; }
.event-meta { color: var(--muted); display: flex; flex-wrap: wrap; font-size: .78rem; font-weight: 700; gap: .5rem 1rem; text-transform: uppercase; }
.event-message { line-height: 1.55; margin: .85rem 0; overflow-wrap: anywhere; white-space: pre-wrap; }
dl { color: var(--muted); display: grid; gap: .45rem; margin: 0; }
dl div { display: grid; gap: .25rem; grid-template-columns: 6.3rem minmax(0, 1fr); }
dt { font-weight: 700; } dd { margin: 0; overflow-wrap: anywhere; }
.empty-state { color: var(--muted); padding: 1.2rem 0 .3rem; }
.next-page { color: var(--signal); display: inline-block; font-weight: 750; padding: .7rem 0; }
@media (min-width: 42rem) {
  .dashboard-shell { padding: 2.25rem; }
  .dashboard-header { align-items: center; flex-direction: row; justify-content: space-between; }
  .scope-bar { align-items: center; flex-direction: row; justify-content: space-between; }
  .scope-bar form { grid-template-columns: auto minmax(12rem, 20rem) auto; }
}
`;
