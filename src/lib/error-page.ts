// The four words "This page didn't load" are identical for every cause, which
// makes an intermittent failure in an editor preview impossible to tell apart
// from a cold database, a failed build or a bad query. Reveal the recovered
// cause everywhere except the live production site.
import { revealsErrorDetail } from "./error-detail-policy";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderErrorPage(detail?: string, hostname?: string): string {
  const visible = detail && revealsErrorDetail(hostname) ? detail : undefined;
  const details = visible
    ? `
      <details open>
        <summary>Detalhes técnicos</summary>
        <pre>${escapeHtml(visible)}</pre>
      </details>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
      details { margin-top: 1.5rem; text-align: left; }
      summary { cursor: pointer; font-size: 0.75rem; color: #6b7280; }
      pre { margin: 0.5rem 0 0; max-height: 18rem; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 0.75rem; font-size: 11px; line-height: 1.5; color: #111; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>${details}
    </div>
  </body>
</html>`;
}
