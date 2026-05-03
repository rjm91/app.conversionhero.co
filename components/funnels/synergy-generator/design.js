export const DESIGN_CSS = `
:root {
  --brand: #016838;
  --brand-deep: #014d29;
  --brand-tint: #e6f2ec;
  --brand-tint-2: #c2dece;
  --accent: oklch(0.62 0.12 45);
  --paper: oklch(0.985 0.008 80);
  --paper-2: oklch(0.96 0.01 80);
  --paper-3: oklch(0.92 0.012 80);
  --ink: oklch(0.18 0.02 145);
  --ink-2: oklch(0.32 0.015 145);
  --ink-3: oklch(0.5 0.012 145);
  --line: oklch(0.88 0.012 80);
  --line-2: oklch(0.82 0.015 80);
  --serif: "Newsreader", "Source Serif 4", Georgia, serif;
  --sans: "Geist", "Söhne", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --mono: "Geist Mono", "JetBrains Mono", ui-monospace, Menlo, monospace;
  --radius: 14px; --radius-sm: 8px; --radius-lg: 22px;
}
[data-theme="ink"] {
  --brand: oklch(0.28 0.04 240); --brand-deep: oklch(0.2 0.04 240);
  --brand-tint: oklch(0.94 0.012 240); --brand-tint-2: oklch(0.86 0.02 240);
  --accent: oklch(0.65 0.14 50);
}
[data-theme="copper"] {
  --brand: oklch(0.5 0.13 45); --brand-deep: oklch(0.38 0.12 45);
  --brand-tint: oklch(0.95 0.02 45); --brand-tint-2: oklch(0.88 0.04 45);
  --accent: oklch(0.42 0.09 145);
}
[data-theme="midnight"] {
  --brand: oklch(0.78 0.13 90); --brand-deep: oklch(0.7 0.13 90);
  --brand-tint: oklch(0.22 0.02 240); --brand-tint-2: oklch(0.28 0.025 240);
  --accent: oklch(0.7 0.14 30);
  --paper: oklch(0.16 0.015 240); --paper-2: oklch(0.2 0.018 240); --paper-3: oklch(0.26 0.02 240);
  --ink: oklch(0.96 0.005 90); --ink-2: oklch(0.82 0.01 90); --ink-3: oklch(0.62 0.015 90);
  --line: oklch(0.3 0.02 240); --line-2: oklch(0.36 0.022 240);
}

.d-root { font-family: var(--sans); background: var(--paper); color: var(--ink);
  -webkit-font-smoothing: antialiased; min-height: 100vh; width: 100%; }

.survey-shell { display: grid; grid-template-columns: 1fr; min-height: 100vh; background: var(--paper); }
@media (min-width: 961px) { .survey-shell { grid-template-columns: 320px 1fr; } }
.survey-shell--done { grid-template-columns: 1fr !important; }
.survey-shell--centered { grid-template-columns: 1fr !important; }
.center-logo { display: flex; justify-content: center; padding-top: 8px; padding-bottom: 4px; }
.center-logo img { height: 60px; width: auto; display: block; }
@media (max-width: 720px) { .center-logo img { height: 44px; } }
.stage-top--centered { align-items: center; text-align: center; }
.stage-top--centered .stage-headline { max-width: none; }
.stage-top--centered .progress-row { width: 100%; }

.rail { display: none; background: var(--paper-2); border-right: 1px solid var(--line);
  padding: 28px 24px; flex-direction: column; gap: 28px;
  position: sticky; top: 0; height: 100vh; overflow-y: auto; }
@media (min-width: 961px) { .rail { display: flex; } }

.rail-brand { display: flex; align-items: center; }
.rail-logo { height: 52px; width: auto; display: block; }
.mobile-logo { display: flex; padding-bottom: 8px; }
.mobile-logo img { height: 64px; width: auto; display: block; }
@media (min-width: 961px) { .mobile-logo { display: none; } }

.step-list { list-style: none; margin: 0; padding: 0; display: flex;
  flex-direction: column; gap: 4px; flex: 1; }
.step-item { display: grid; grid-template-columns: 32px 1fr; gap: 14px;
  align-items: flex-start; padding: 12px 12px 12px 0; position: relative;
  transition: opacity 0.25s ease; opacity: 0.55; }
.step-item.active { opacity: 1; }
.step-item.done { opacity: 0.85; }
.step-item:not(:last-child)::before { content: ""; position: absolute; left: 13px;
  top: 36px; bottom: -4px; width: 1px; background: var(--line-2); }
.step-item.done:not(:last-child)::before { background: var(--brand); }
.step-dot-wrap { display: flex; justify-content: center; padding-top: 4px; }
.step-dot { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line-2);
  background: var(--paper); display: grid; place-items: center;
  font-family: var(--mono); font-size: 14px; color: var(--ink-3); transition: all 0.25s ease; }
.step-dot.active { border-color: var(--brand); background: var(--brand); color: var(--paper);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--brand) 18%, transparent); }
.step-dot.done { background: var(--brand); border-color: var(--brand); color: var(--paper); }
.step-meta { padding-top: 2px; }
.step-num { font-family: var(--mono); font-size: 13.5px; letter-spacing: 0.06em;
  color: var(--ink-3); text-transform: uppercase; }
.step-label { font-size: 17px; color: var(--ink); font-weight: 500; margin-top: 2px; }
.step-item.active .step-label { color: var(--brand-deep); }

.rail-foot { border-top: 1px solid var(--line); padding-top: 24px; }
.rail-foot-row { display: flex; align-items: center; gap: 14px; }
.cert-badge { width: 44px; height: 44px; border-radius: 50%; background: var(--brand-tint);
  display: grid; place-items: center; flex-shrink: 0; }
.rail-foot-title { font-size: 16px; font-weight: 600; color: var(--ink); }
.rail-foot-sub { font-size: 15px; color: var(--ink-3); margin-top: 1px; }

.stage { padding: 32px 48px 28px; max-width: 1080px; width: 100%; margin: 0 auto;
  display: flex; flex-direction: column; gap: 18px; min-height: 100vh; }
@media (max-width: 720px) { .stage { padding: 24px 18px; gap: 16px; min-height: auto; } }

.stage-top { display: flex; flex-direction: column; gap: 10px; }
.stage-eyebrow { font-family: var(--mono); font-size: 17px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); }
.stage-headline { font-family: var(--serif); font-weight: 400;
  font-size: clamp(41px, 3.8vw, 55px); line-height: 1.1; letter-spacing: -0.02em;
  margin: 0; color: var(--ink); max-width: 28ch; }
.stage-headline .hl { color: var(--brand); font-style: italic; font-weight: 500; white-space: nowrap; }
.stage-promo { margin: 0; font-family: var(--sans); font-size: 17px; line-height: 1.6;
  color: var(--ink-2); }
.stage-promo-badge { font-family: var(--mono); font-size: 14px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--brand); background: color-mix(in srgb, var(--brand) 12%, transparent);
  padding: 2px 7px; border-radius: 4px; white-space: nowrap; margin-right: 10px;
  display: inline-block; vertical-align: middle; }
.progress-row { margin-top: 6px; display: flex; align-items: center; gap: 14px; }
.progress-bar { flex: 1; height: 4px; background: var(--paper-3); border-radius: 99px; position: relative; overflow: hidden; }
.progress-fill { position: absolute; inset: 0 auto 0 0; background: var(--brand);
  border-radius: 99px; transition: width 0.45s cubic-bezier(0.4,0,0.2,1); }
.progress-meta { font-family: var(--mono); font-size: 14px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-3); white-space: nowrap; flex-shrink: 0; }

.card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02), 0 12px 40px -20px color-mix(in oklch, var(--brand) 30%, transparent); }
.card-inner { padding: 22px 28px 8px; animation: stepIn 0.4s cubic-bezier(0.2,0.8,0.2,1); }
.card-inner[data-direction="-1"] { animation: stepInBack 0.4s cubic-bezier(0.2,0.8,0.2,1); }
@keyframes stepIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
@keyframes stepInBack { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
@media (max-width: 720px) { .card-inner { padding: 22px 18px 8px; } }

.step-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px;
  align-items: center; text-align: center; }
.step-eyebrow { font-family: var(--mono); font-size: 13.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--brand); }
.step-title { font-family: var(--serif); font-weight: 400; font-size: clamp(29px,2.8vw,35px);
  letter-spacing: -0.01em; line-height: 1.2; margin: 0; color: var(--ink); }
.step-sub { font-size: 20px; color: var(--ink-2); margin: 0; line-height: 1.5; max-width: 52ch; }

.opt-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 601px) { .opt-grid { grid-template-columns: 1fr 1fr; } }

.opt-tile { appearance: none; -webkit-appearance: none; border: 1px solid var(--line);
  background: var(--paper); border-radius: var(--radius); padding: 14px 18px;
  display: grid; grid-template-columns: 24px 1fr 16px; gap: 14px; align-items: center;
  text-align: left; cursor: pointer; font-family: inherit; color: var(--ink);
  transition: border-color 0.18s, background 0.18s, transform 0.18s, box-shadow 0.18s;
  animation: tileIn 0.4s both cubic-bezier(0.2,0.8,0.2,1);
  animation-delay: calc(var(--i, 0) * 50ms + 80ms); }
@keyframes tileIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
.opt-tile:hover { border-color: var(--brand); background: var(--paper-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px -10px color-mix(in oklch, var(--brand) 40%, transparent); }
.opt-tile:active { transform: translateY(0); }
.opt-tile.selected { border-color: var(--brand); background: var(--brand-tint);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--brand) 22%, transparent),
              0 8px 22px -14px color-mix(in oklch, var(--brand) 50%, transparent); }
.opt-radio { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--line-2);
  display: grid; place-items: center; transition: border-color 0.18s, background 0.18s;
  background: var(--paper); }
.opt-tile:hover .opt-radio { border-color: var(--brand); }
.opt-tile.selected .opt-radio { border-color: var(--brand); background: var(--brand); }
.opt-radio-inner { width: 8px; height: 8px; border-radius: 50%; background: var(--paper);
  transform: scale(0); transition: transform 0.2s cubic-bezier(0.5,1.5,0.5,1); }
.opt-tile.selected .opt-radio-inner { transform: scale(1); }
.opt-tile-label { font-size: 21px; font-weight: 500; color: var(--ink); line-height: 1.3; }
.opt-tile-sub { font-size: 17px; color: var(--ink-3); margin-top: 2px; }
.opt-tile-arrow { color: var(--ink-3); opacity: 0; transform: translateX(-4px);
  transition: opacity 0.2s, transform 0.2s, color 0.2s; }
.opt-tile:hover .opt-tile-arrow { opacity: 1; transform: translateX(0); color: var(--brand); }

.card-foot { display: flex; justify-content: space-between; align-items: center;
  padding: 14px 28px 16px; border-top: 1px solid var(--line); margin-top: 14px;
  background: var(--paper-2); }
@media (max-width: 720px) { .card-foot { padding: 16px 18px 18px; } }

.btn-ghost { appearance: none; background: transparent; border: none; font-family: inherit;
  color: var(--ink-2); font-size: 19px; cursor: pointer; padding: 10px 14px;
  border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;
  transition: background 0.15s, color 0.15s; }
.btn-ghost:hover { background: var(--paper-3); color: var(--ink); }
.btn-primary { appearance: none; border: none; background: var(--brand); color: var(--paper);
  font-family: inherit; font-size: 20px; font-weight: 500; letter-spacing: 0.005em;
  padding: 13px 22px; border-radius: 999px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 14px -8px color-mix(in oklch, var(--brand) 80%, transparent); }
.btn-primary:hover:not(:disabled) { background: var(--brand-deep); transform: translateY(-1px);
  box-shadow: 0 6px 18px -8px color-mix(in oklch, var(--brand) 90%, transparent); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.zip-field-wrap { display: flex; flex-direction: column; gap: 14px; align-items: center; }
.field-label { font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3); display: flex;
  justify-content: space-between; align-items: baseline; }
.zip-field { border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper);
  display: grid; grid-template-columns: 1fr auto; align-items: center;
  transition: border-color 0.2s, box-shadow 0.2s; overflow: hidden;
  max-width: 360px; width: 100%; margin: 0 auto; }
.zip-field:focus-within { border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent); }
.zip-field.error { border-color: var(--accent); }
.zip-field.ok { border-color: var(--brand); background: var(--brand-tint); }
.zip-field input { font-family: var(--serif); font-size: 35px; letter-spacing: 0.08em;
  font-weight: 400; border: none; background: transparent; padding: 18px 22px;
  color: var(--ink); outline: none; width: 100%; text-align: center; }
.zip-field input::placeholder { color: var(--ink-3); opacity: 0.5; }
.zip-status { padding-right: 22px; font-size: 16.5px; white-space: nowrap; }
.zip-city { display: inline-flex; align-items: center; gap: 6px;
  color: var(--brand); font-weight: 500; }
.zip-err-msg { color: var(--accent); }
.zip-hint { color: var(--ink-3); font-family: var(--mono); font-size: 14.5px; letter-spacing: 0.04em; }
.zip-coverage { font-size: 15.5px; color: var(--ink-3); display: flex;
  align-items: center; gap: 8px; line-height: 1.5; }
.cov-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 25%, transparent); flex-shrink: 0; }

.contact-grid { display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.field input { font-family: var(--sans); font-size: 18px; border: 1px solid var(--line);
  border-radius: var(--radius-sm); padding: 13px 16px; background: var(--paper);
  color: var(--ink); outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
.field input::placeholder { color: var(--ink-3); }
.field input:focus { border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 15%, transparent); }
.check-row { display: grid; grid-template-columns: 18px 1fr; gap: 12px;
  align-items: flex-start; font-size: 16px; color: var(--ink-2); line-height: 1.5;
  cursor: pointer; padding: 6px 0 0; }
.check-row input { margin: 2px 0 0; accent-color: var(--brand); width: 16px; height: 16px; }

.stat-strip { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; align-items: center;
  gap: 16px; padding: 20px 24px; background: var(--paper-2); border: 1px solid var(--line);
  border-radius: var(--radius); }
.stat { display: flex; flex-direction: column; gap: 4px; }
.stat-num { font-family: var(--serif); font-size: 29px; font-weight: 500; color: var(--ink);
  letter-spacing: -0.02em; line-height: 1; }
.stat-num span { font-size: 16px; color: var(--ink-3); font-weight: 400; margin-left: 2px; }
.stat-title { font-size: 17px; font-weight: 600; color: var(--ink); line-height: 1.3; }
.stat-label { font-size: 15px; color: var(--ink-3); letter-spacing: 0.02em; margin-top: 1px; }
.stat-rule { width: 1px; height: 28px; background: var(--line); }
@media (max-width: 700px) { .stat-strip { grid-template-columns: 1fr 1fr; gap: 14px; padding: 18px; }
  .stat-rule { display: none; } }
@media (max-width: 400px) { .stat-strip { grid-template-columns: 1fr; } }

.testimonial { display: grid; grid-template-columns: 84px 1fr; gap: 22px; padding: 22px;
  margin: 0; background: var(--paper-2); border: 1px solid var(--line); border-radius: var(--radius);
  align-items: center; }
.testimonial-photo { width: 84px; height: 84px; border-radius: 14px; overflow: hidden; background: var(--brand-tint); }
.testimonial blockquote { font-family: var(--serif); font-size: 19px; line-height: 1.45;
  color: var(--ink); margin: 0 0 8px; letter-spacing: -0.005em; }
.testimonial figcaption { font-size: 16px; color: var(--ink-3); display: flex; gap: 8px; align-items: baseline; }
.testimonial figcaption strong { color: var(--ink); font-weight: 500; }
.testimonial figcaption span::before { content: "·"; margin-right: 8px; color: var(--line-2); }

.complete { padding: 48px 36px 44px; text-align: center; display: flex;
  flex-direction: column; align-items: center; gap: 16px; }
.ty-actions { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 10px;
  justify-content: center; align-items: center; }
.ty-actions .btn-primary, .ty-actions .btn-ghost { text-decoration: none; }
@keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.complete-mark { animation: pop 0.6s cubic-bezier(0.5,1.5,0.5,1); }
.complete-title { font-family: var(--serif); font-weight: 400; font-size: 33px;
  letter-spacing: -0.01em; margin: 0; color: var(--ink); }
.complete-sub { font-size: 18px; color: var(--ink-2); margin: 0; max-width: 44ch; line-height: 1.55; }
.complete-next { margin-top: 20px; display: flex; flex-direction: column; width: 100%;
  max-width: 420px; text-align: left; border-top: 1px solid var(--line); }
.next-row { padding: 14px 4px; border-bottom: 1px solid var(--line); display: grid;
  grid-template-columns: 36px 1fr; gap: 12px; font-size: 17px; color: var(--ink); align-items: baseline; }
.next-num { font-family: var(--mono); font-size: 14px; color: var(--brand); letter-spacing: 0.06em; }
.next-label em { color: var(--ink-3); font-style: normal; font-size: 16px; }

.stage-foot { margin-top: auto; display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--ink-3); padding-top: 12px; flex-wrap: wrap;
  justify-content: center; text-align: center; }
.stage-foot .dot { color: var(--line-2); }

.dev-banner { background: #1e3a5f; color: #fff; text-align: center; padding: 8px 16px;
  font-size: 13px; font-family: sans-serif; position: sticky; top: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center; gap: 24px; }
.dev-banner select { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
  color: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
`
