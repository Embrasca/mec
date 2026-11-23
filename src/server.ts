import "./lib/error-capture";

import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
function hostnameOf(request: Request): string | undefined {
  try {
    return new URL(request.url).hostname;
  } catch {
    return undefined;
  }
}

async function normalizeCatastrophicSsrResponse(
  response: Response,
  hostname: string | undefined,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const recovered = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(recovered);
  return new Response(renderErrorPage(describeError(recovered), hostname), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Cabeçalhos de segurança em toda resposta. A CSP só admite o próprio site, as
 * fontes do Google e o Neon (login); scripts de outros domínios são bloqueados.
 * Os scripts em linha continuam permitidos porque a hidratação do TanStack e o
 * script do tema os usam.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' https://*.neon.tech${import.meta.env.DEV ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function comCabecalhos(response: Response): Response {
  // Algumas respostas têm cabeçalhos imutáveis; nesse caso copia.
  const r = new Response(response.body, response);
  const h = r.headers;
  h.set("Content-Security-Policy", CSP);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!import.meta.env.DEV)
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return r;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const hostname = hostnameOf(request);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return comCabecalhos(await normalizeCatastrophicSsrResponse(response, hostname));
    } catch (error) {
      console.error(error);
      return comCabecalhos(
        new Response(renderErrorPage(describeError(error), hostname), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
