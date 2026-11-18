/** Aba FORNECEDORES da Ferramenta v3.16: o que pedir e o que já chegou. */
import { z } from "zod";
import dados from "./v3_16/inventario.json";
import { TIPOS_DE_FORNECEDOR } from "./inventario";

export const TIPOS = dados.fornecedores.tipos as {
  tipo: string;
  oQuePedir: string;
  unidade: string;
  comprovante: string;
}[];
export const NOTA_PRAZO = dados.fornecedores.notaPrazo;
export const DIAS_DE_PRAZO = 5;

/** O que o fornecedor entrega no nível do evento [FORNECEDORES!C5]. */
export function entregaNoNivel(nivel: number | null): string | null {
  if (!nivel) return null;
  return dados.fornecedores.entregaPorNivel[nivel - 1] ?? null;
}

/** Prazo de entrega: término do evento + 5 dias [G23]. */
export function prazoDeEntrega(dataFim: string): string {
  const d = new Date(`${dataFim}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DIAS_DE_PRAZO);
  return d.toISOString().slice(0, 10);
}

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();
const simNao = z.enum(["Sim", "Não"]).nullable();

export const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Informe o fornecedor.").max(200),
  tipo: z.string().refine((t) => TIPOS_DE_FORNECEDOR.includes(t), "Escolha o tipo de fornecedor."),
  contato: z.string().trim().max(200).nullable(),
  enviadoEm: data,
  recebidoEm: data,
  haSubcontratados: simNao,
  subcontratadosIncluidos: simNao,
  observacao: z.string().trim().max(2000).nullable(),
});
export type DadosDoFornecedor = z.infer<typeof fornecedorSchema>;

export type Situacao = "Recebido" | "Aguardando" | "Não enviado";

/** Situação e alerta [I23, L23]. `hoje` no formato AAAA-MM-DD. */
export function acompanhar(f: DadosDoFornecedor, dataFim: string, hoje: string) {
  const prazo = prazoDeEntrega(dataFim);
  const situacao: Situacao = f.recebidoEm ? "Recebido" : f.enviadoEm ? "Aguardando" : "Não enviado";
  const alerta =
    situacao !== "Recebido" && hoje > prazo
      ? "Prazo vencido: cobrar por escrito"
      : f.haSubcontratados === "Sim" && f.subcontratadosIncluidos !== "Sim"
        ? "Confirmar inclusão dos subcontratados"
        : "OK";
  return { prazo, situacao, alerta };
}
