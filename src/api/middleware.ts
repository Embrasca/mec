import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { obterToken } from "@/lib/token";

/**
 * Exigido em toda função de servidor. No navegador, anexa o JWT; no servidor,
 * confere a assinatura e entrega o id da conta para a função.
 */
export const autenticado = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = await obterToken();
    return next({ headers: { Authorization: `Bearer ${token}` } });
  })
  .server(async ({ next }) => {
    const { verificarToken } = await import("@/servidor/identidade.server");
    const cabecalho = getRequest()?.headers.get("authorization") ?? "";
    if (!cabecalho.startsWith("Bearer ")) throw new Error("Entre novamente para continuar.");
    let usuarioId: string;
    try {
      usuarioId = await verificarToken(cabecalho.slice(7));
    } catch {
      throw new Error("Sessão expirada. Entre novamente.");
    }
    try {
      return await next({ context: { usuarioId } });
    } catch (erro) {
      // Só mensagens pensadas para a pessoa saem do servidor; o resto vai ao log.
      const { mensagemSegura } = await import("@/servidor/erros");
      throw new Error(mensagemSegura(erro));
    }
  });
