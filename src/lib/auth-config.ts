/**
 * Endereço do Neon Auth do projeto. Não é segredo: o navegador fala direto com
 * ele. Segredo é a DATABASE_URL, que só existe no servidor.
 */
export function neonAuthUrl(): string {
  const url =
    (typeof process !== "undefined" ? process.env?.["NEON_AUTH_URL"] : undefined) ??
    (import.meta.env["VITE_NEON_AUTH_URL"] as string | undefined) ??
    "";
  return url.replace(/\/$/, "");
}
