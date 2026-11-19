/**
 * Aba "C - CHECKLIST" da Ferramenta v3.16: listas de verificação do nível,
 * fase por fase. Um item aparece quando o nível mínimo dele é menor ou igual
 * ao do evento; é "NOVO" quando começa exatamente no nível do evento.
 */
import itens from "./v3_16/checklist.json";

export type Fase = "A" | "B" | "C";
export const FASES: { codigo: Fase; nome: string }[] = [
  { codigo: "A", nome: "Pré-evento" },
  { codigo: "B", nome: "Execução" },
  { codigo: "C", nome: "Pós-evento" },
];

export interface ItemDoChecklist {
  fase: Fase;
  nivel: number;
  ordem: number;
  oQueFazer: string;
  quando: string;
  quemFaz: string;
  registro: string;
}

export const ITENS_DO_CHECKLIST = itens as ItemDoChecklist[];

export const chaveDoItem = (i: Pick<ItemDoChecklist, "fase" | "ordem">) => `${i.fase}|${i.ordem}`;
export const CHAVES_DO_CHECKLIST = new Set(ITENS_DO_CHECKLIST.map(chaveDoItem));

export type Resposta = "Sim" | "Não";

export interface ItemVisivel extends ItemDoChecklist {
  chave: string;
  novo: boolean;
  feito: Resposta | null;
  observacao: string | null;
}

export interface FaseDoChecklist {
  codigo: Fase;
  nome: string;
  itens: ItemVisivel[];
  /** Fração de itens visíveis marcados "Sim" [G61, G119, G187]. */
  progresso: number;
  concluida: boolean;
}

export function checklistDoNivel(
  nivel: number | null,
  respostas: Map<string, { feito: Resposta; observacao: string | null }>,
): FaseDoChecklist[] {
  return FASES.map(({ codigo, nome }) => {
    const visiveis = nivel
      ? ITENS_DO_CHECKLIST.filter((i) => i.fase === codigo && i.nivel <= nivel).sort(
          (a, b) => a.ordem - b.ordem,
        )
      : [];
    const lista = visiveis.map((i): ItemVisivel => {
      const chave = chaveDoItem(i);
      const r = respostas.get(chave);
      return {
        ...i,
        chave,
        novo: nivel !== null && nivel > 1 && i.nivel === nivel,
        feito: r?.feito ?? null,
        observacao: r?.observacao ?? null,
      };
    });
    const feitos = lista.filter((i) => i.feito === "Sim").length;
    const progresso = lista.length === 0 ? 0 : feitos / lista.length;
    return {
      codigo,
      nome,
      itens: lista,
      progresso,
      concluida: lista.length > 0 && progresso === 1,
    };
  });
}

/** Texto da situação da fase, como na planilha [H61, H119, H187]. */
export const situacaoDaFase = (f: FaseDoChecklist) =>
  f.concluida ? "FASE CONCLUÍDA" : "Complete antes de avançar";
