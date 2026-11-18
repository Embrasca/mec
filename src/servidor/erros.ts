import { ZodError } from "zod";

/** Erro com mensagem pensada para a pessoa que usa o sistema. */
export class ErroDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
  }
}

/**
 * Traduz falhas do banco em mensagens úteis sem vazar detalhes internos.
 * Erros de negócio passam como estão; o resto vira mensagem genérica e o
 * detalhe fica só no log do servidor.
 */
export function mensagemSegura(erro: unknown): string {
  if (erro instanceof ErroDeNegocio) return erro.message;
  if (erro instanceof ZodError) return erro.issues[0]?.message ?? "Dados inválidos.";
  const e = erro as { code?: string; message?: string };
  if (e?.code === "42501") return "Você não tem permissão para esta ação.";
  if (e?.code === "23505") return "Já existe um registro com estes dados.";
  if (e?.code === "23514" && e.message && /nível|Autor e metodologia/.test(e.message))
    return e.message;
  if (e?.code === "23514" || e?.code === "22P02" || e?.code === "23502")
    return "Dados inválidos. Revise o formulário.";
  console.error(erro);
  return "Não foi possível concluir a operação. Tente novamente.";
}
