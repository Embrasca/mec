/**
 * Painel gerencial do portfólio: um resumo por evento, as metas do portfólio
 * (definidas pela administração, por ano) e a avaliação de cada evento.
 *
 * Comparar eventos de tamanhos diferentes pelo total engana; por isso as
 * comparações usam intensidade (kgCO₂e por participante-dia), como a aba 4.
 */
import { z } from "zod";
import type { Fase } from "./evento";

export interface ResumoDoEvento {
  id: string;
  nome: string;
  cor: string;
  nivel: number | null;
  fase: Fase;
  dataInicio: string;
  dataFim: string;
  /** De onde vem a emissão: ex-post (oficial) ou, sem ele, a estimativa ex-ante. */
  emissoes: {
    fonte: "ex_post" | "ex_ante" | null;
    fechado: boolean;
    total: number | null;
    porParticipanteDia: number | null;
  };
  variacao: number | null;
  primario: number | null;
  compensacaoCompleta: boolean;
  relatorioFinal: boolean;
  esg: {
    essenciaisPendentes: string[];
    maoDeObraLocal: number | null;
    gastoLocal: number | null;
    satisfacao: number | null;
  };
  pendencias: {
    acoesAtrasadas: number;
    ocorrenciasAbertas: number;
    fornecedoresAtrasados: number;
    /** Evento já terminou e o ex-post ainda não foi fechado. */
    inventarioAberto: boolean;
  };
}

export type Direcao = "maximo" | "minimo";

export interface IndicadorDeMeta {
  id: string;
  nome: string;
  unidade: "kgCO₂e" | "%" | "nota";
  /** "maximo": o valor deve ficar até o alvo; "minimo": a partir do alvo. */
  direcao: Direcao;
  valor: (e: ResumoDoEvento) => number | null;
  ajuda: string;
}

/** Metas que o painel sabe avaliar, todas a partir de números que o sistema já calcula. */
export const INDICADORES_DE_META: IndicadorDeMeta[] = [
  {
    id: "intensidade",
    nome: "Emissões por participante-dia",
    unidade: "kgCO₂e",
    direcao: "maximo",
    valor: (e) => (e.emissoes.fonte === "ex_post" ? e.emissoes.porParticipanteDia : null),
    ajuda: "Do inventário ex-post. Compara eventos de tamanhos diferentes.",
  },
  {
    id: "variacao",
    nome: "Diferença do realizado para o previsto",
    unidade: "%",
    direcao: "maximo",
    valor: (e) => e.variacao,
    ajuda: "Ex-post menos ex-ante, em %. Negativo significa que emitiu menos que o previsto.",
  },
  {
    id: "primario",
    nome: "Emissões com dado primário",
    unidade: "%",
    direcao: "minimo",
    valor: (e) => (e.emissoes.fonte === "ex_post" ? e.primario : null),
    ajuda: "Notas 4 e 5 de qualidade do dado (aba 4).",
  },
  {
    id: "mao_de_obra_local",
    nome: "Mão de obra local",
    unidade: "%",
    direcao: "minimo",
    valor: (e) => e.esg.maoDeObraLocal,
    ajuda: "Indicador ML2.",
  },
  {
    id: "gasto_local",
    nome: "Gasto com fornecedores locais",
    unidade: "%",
    direcao: "minimo",
    valor: (e) => e.esg.gastoLocal,
    ajuda: "Indicador CS2.",
  },
  {
    id: "satisfacao",
    nome: "Satisfação geral do público",
    unidade: "nota",
    direcao: "minimo",
    valor: (e) => e.esg.satisfacao,
    ajuda: "Indicador PS2, média de 1 a 5.",
  },
];

export const metaSchema = z
  .object({
    ano: z.number().int().min(2020).max(2100),
    indicador: z
      .string()
      .refine((i) => INDICADORES_DE_META.some((x) => x.id === i), "Indicador inválido."),
    /** Percentuais em fração (0,5 = 50%). */
    alvo: z.number().finite(),
    observacao: z.string().trim().max(500).nullable(),
  })
  .superRefine((m, ctx) => {
    const ind = INDICADORES_DE_META.find((x) => x.id === m.indicador);
    if (!ind) return;
    const ok =
      ind.unidade === "nota"
        ? m.alvo >= 1 && m.alvo <= 5
        : ind.unidade === "%"
          ? ind.id === "variacao"
            ? m.alvo >= -1 && m.alvo <= 1
            : m.alvo >= 0 && m.alvo <= 1
          : m.alvo >= 0 && m.alvo <= 100000;
    if (!ok)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alvo"],
        message: "Valor fora da faixa do indicador.",
      });
  });
export type Meta = z.infer<typeof metaSchema>;

export type ResultadoDaMeta = "atinge" | "nao_atinge" | "sem_dado";

export function avaliarMeta(meta: Pick<Meta, "indicador" | "alvo">, e: ResumoDoEvento) {
  const ind = INDICADORES_DE_META.find((x) => x.id === meta.indicador);
  const valor = ind ? ind.valor(e) : null;
  const resultado: ResultadoDaMeta =
    valor === null || !ind
      ? "sem_dado"
      : (ind.direcao === "maximo" ? valor <= meta.alvo : valor >= meta.alvo)
        ? "atinge"
        : "nao_atinge";
  return { valor, resultado };
}

/** Eventos do ano que a meta alcança: os que começam naquele ano. */
export const eventosDoAno = (eventos: ResumoDoEvento[], ano: number) =>
  eventos.filter((e) => Number(e.dataInicio.slice(0, 4)) === ano);

export function avaliarPortfolio(metas: Meta[], eventos: ResumoDoEvento[]) {
  return metas.map((m) => {
    const doAno = eventosDoAno(eventos, m.ano);
    const avaliacoes = doAno.map((e) => ({ eventoId: e.id, ...avaliarMeta(m, e) }));
    const comDado = avaliacoes.filter((a) => a.resultado !== "sem_dado");
    return {
      meta: m,
      eventos: avaliacoes,
      atingem: comDado.filter((a) => a.resultado === "atinge").length,
      comDado: comDado.length,
      total: doAno.length,
    };
  });
}

/** Números do topo do painel. */
export function consolidar(eventos: ResumoDoEvento[]) {
  const oficiais = eventos.filter((e) => e.emissoes.fonte === "ex_post" && e.emissoes.fechado);
  const soma = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  return {
    eventos: eventos.length,
    porFase: {
      "Pré-evento": eventos.filter((e) => e.fase === "Pré-evento").length,
      Execução: eventos.filter((e) => e.fase === "Execução").length,
      "Pós-evento": eventos.filter((e) => e.fase === "Pós-evento").length,
    },
    porNivel: [1, 2, 3, 4].map((n) => eventos.filter((e) => e.nivel === n).length),
    semNivel: eventos.filter((e) => e.nivel === null).length,
    emissoesOficiais: soma(oficiais.map((e) => e.emissoes.total)),
    eventosComInventarioOficial: oficiais.length,
    compensacaoCompleta: eventos.filter((e) => e.compensacaoCompleta).length,
    relatoriosFinais: eventos.filter((e) => e.relatorioFinal).length,
    pendencias: {
      acoesAtrasadas: soma(eventos.map((e) => e.pendencias.acoesAtrasadas)),
      ocorrenciasAbertas: soma(eventos.map((e) => e.pendencias.ocorrenciasAbertas)),
      fornecedoresAtrasados: soma(eventos.map((e) => e.pendencias.fornecedoresAtrasados)),
      inventariosAbertos: eventos.filter((e) => e.pendencias.inventarioAberto).length,
      esgPendente: eventos.filter(
        (e) => e.esg.essenciaisPendentes.length > 0 && e.fase === "Pós-evento",
      ).length,
    },
  };
}
