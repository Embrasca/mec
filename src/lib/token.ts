/**
 * JWT curto do Neon Auth, emitido a partir do cookie de sessão (HttpOnly).
 * Fica só em memória, nunca em localStorage, e é renovado antes de expirar.
 */
import { neonAuthUrl } from "./auth-config";

let cache: { token: string; expiraEm: number } | null = null;
let pedido: Promise<string> | null = null;

function expiracao(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function emitir(): Promise<string> {
  const resposta = await fetch(`${neonAuthUrl()}/token`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!resposta.ok) throw new Error("Sessão expirada. Entre novamente.");
  const corpo = (await resposta.json()) as { token?: unknown; data?: { token?: unknown } };
  const token = typeof corpo.token === "string" ? corpo.token : corpo.data?.token;
  if (typeof token !== "string" || token.split(".").length !== 3)
    throw new Error("O provedor de identidade não devolveu um token válido.");
  cache = { token, expiraEm: expiracao(token) };
  return token;
}

export async function obterToken(): Promise<string> {
  if (cache && cache.expiraEm - Date.now() > 30_000) return cache.token;
  pedido ??= emitir().finally(() => {
    pedido = null;
  });
  return pedido;
}

export function esquecerToken() {
  cache = null;
}
