import { createRemoteJWKSet, jwtVerify } from "jose";
import { neonAuthUrl } from "@/lib/auth-config";

let chaves: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

/** Confere o JWT do Neon Auth e devolve o id da conta. Nada vem do navegador sem assinatura. */
export async function verificarToken(token: string): Promise<string> {
  const base = neonAuthUrl();
  if (!base) throw new Error("Autenticação não configurada no servidor (NEON_AUTH_URL).");
  const url = new URL(base);
  if (url.protocol !== "https:") throw new Error("Endereço de autenticação inválido.");
  if (!token || token.length > 16_384) throw new Error("Sessão inválida.");
  if (!chaves || chaves.url !== base)
    chaves = { url: base, jwks: createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)) };
  const { payload } = await jwtVerify(token, chaves.jwks, {
    issuer: url.origin,
    algorithms: ["EdDSA"],
    requiredClaims: ["sub", "exp", "iat"],
  });
  if (!payload.sub || payload["banned"] === true) throw new Error("Sessão sem acesso.");
  return payload.sub;
}
