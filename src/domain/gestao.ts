/**
 * Ferramentas de gestão do evento que não estão na Ferramenta MEC/GIZ e vêm do
 * EventSustain Hub: matriz impacto × relevância (base para os temas materiais
 * do GRI 3) e plano de ação. E a linha do tempo, que junta os prazos de
 * todas as áreas do evento nas três fases.
 */
import { z } from "zod";
import { CATEGORIAS } from "./metodologia/inventario";

// ---------------------------------------------------------------------
// Matriz impacto × relevância
// ---------------------------------------------------------------------

const escala = z.number().int().min(1, "Use de 1 a 5.").max(5, "Use de 1 a 5.");
const textoOpcional = (max: number) => z.string().trim().max(max).nullable();

export const temaSchema = z.object({
  tema: z.string().trim().min(1, "Informe o tema.").max(200),
  /** Categoria de emissão da Ferramenta, ou null para tema fora do GEE (social, água…). */
  categoria: z
    .string()
    .nullable()
    .refine((c) => c === null || CATEGORIAS.includes(c), "Categoria inválida."),
  descricao: textoOpcional(2000),
  impacto: escala,
  relevancia: escala,
  stakeholders: textoOpcional(500),
  fonte: textoOpcional(300),
});
export type Tema = z.infer<typeof temaSchema>;

export type Prioridade = "alta" | "media" | "baixa";

/** Mesma regra do EventSustain: soma ≥ 8 alta, ≥ 6 média, abaixo disso baixa. */
export function prioridadeDoTema(impacto: number, relevancia: number): Prioridade {
  const soma = impacto + relevancia;
  return soma >= 8 ? "alta" : soma >= 6 ? "media" : "baixa";
}

export const NOME_DA_PRIORIDADE: Record<Prioridade, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

// ---------------------------------------------------------------------
// Plano de ação
// ---------------------------------------------------------------------

export const STATUS_DA_ACAO = ["pendente", "em_andamento", "concluida", "cancelada"] as const;
export type StatusDaAcao = (typeof STATUS_DA_ACAO)[number];
export const NOME_DO_STATUS: Record<StatusDaAcao | "atrasada", string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
};
export const PRIORIDADES_DA_ACAO = ["baixa", "media", "alta", "critica"] as const;
export const NOME_DA_PRIORIDADE_DA_ACAO: Record<(typeof PRIORIDADES_DA_ACAO)[number], string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();

export const acaoSchema = z
  .object({
    acao: z.string().trim().min(1, "Descreva a ação.").max(300),
    descricao: textoOpcional(2000),
    temaId: z.string().uuid().nullable(),
    medidaId: z.string().uuid().nullable(),
    responsavel: textoOpcional(200),
    prazo: data,
    status: z.enum(STATUS_DA_ACAO),
    prioridade: z.enum(PRIORIDADES_DA_ACAO),
    evidenciaEsperada: textoOpcional(500),
    progresso: z.number().int().min(0).max(100),
  })
  .refine((a) => a.status !== "concluida" || a.progresso === 100, {
    message: "Ação concluída tem progresso de 100%.",
    path: ["progresso"],
  });
export type Acao = z.infer<typeof acaoSchema>;

/**
 * No EventSustain "atrasada" era um status escolhido à mão. Aqui ele é
 * calculado: prazo vencido e a ação nem concluída nem cancelada.
 */
export function situacaoDaAcao(
  a: Pick<Acao, "status" | "prazo">,
  hoje: string,
): StatusDaAcao | "atrasada" {
  if ((a.status === "pendente" || a.status === "em_andamento") && a.prazo && a.prazo < hoje)
    return "atrasada";
  return a.status;
}

// ---------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------

export type FaseDoEvento = "Pré-evento" | "Execução" | "Pós-evento";

export interface MarcoDaLinhaDoTempo {
  data: string;
  titulo: string;
  origem: "Plano de redução" | "Plano de ação" | "Fornecedor" | "Evento";
  situacao: string | null;
  atrasado: boolean;
  fase: FaseDoEvento;
}

export function faseDaData(data: string, inicio: string, fim: string): FaseDoEvento {
  if (data < inicio) return "Pré-evento";
  if (data > fim) return "Pós-evento";
  return "Execução";
}

export function montarLinhaDoTempo(
  periodo: { inicio: string; fim: string },
  marcos: Omit<MarcoDaLinhaDoTempo, "fase">[],
): Record<FaseDoEvento, MarcoDaLinhaDoTempo[]> {
  const comFase = [
    ...marcos,
    {
      data: periodo.inicio,
      titulo: "Abertura do evento",
      origem: "Evento" as const,
      situacao: null,
      atrasado: false,
    },
    {
      data: periodo.fim,
      titulo: "Encerramento do evento",
      origem: "Evento" as const,
      situacao: null,
      atrasado: false,
    },
  ]
    .map((m) => ({ ...m, fase: faseDaData(m.data, periodo.inicio, periodo.fim) }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo));
  return {
    "Pré-evento": comFase.filter((m) => m.fase === "Pré-evento"),
    Execução: comFase.filter((m) => m.fase === "Execução"),
    "Pós-evento": comFase.filter((m) => m.fase === "Pós-evento"),
  };
}
