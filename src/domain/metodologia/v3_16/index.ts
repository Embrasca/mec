/**
 * Metodologia MEC/GIZ — Ferramenta de Cálculo de Emissões de Eventos, versão 3.16.
 *
 * Os textos vêm de `textos.json`, gerado por `scripts/extrair-metodologia.py`
 * direto da planilha. Não edite o JSON à mão: rode o script de novo.
 *
 * Uma nova versão do Guia vira uma nova pasta (v3_17, …). Cada evento guarda a
 * versão com que foi enquadrado, então mudar a metodologia nunca altera o
 * resultado de um evento já em andamento.
 */
import textos from "./textos.json";

export const METODOLOGIA_ID = "mec-giz-3.16" as const;
export type MetodologiaId = typeof METODOLOGIA_ID;

export type Nivel = 1 | 2 | 3 | 4;
export const NIVEIS: readonly Nivel[] = [1, 2, 3, 4];

export interface CriterioComplexidade {
  rotulo: string;
  opcoes: [string, string, string, string];
  tresPontos: string;
}

export interface RequisitoDoNivel {
  fase: string;
  requisito: string;
  porNivel: [string, string, string, string];
}

export const V3_16 = {
  fonte: textos.fonte,
  formatos: textos.formatos,
  simNao: textos.simNao,
  alegacoes: textos.alegacoes,
  logistica: textos.logistica,
  criteriosComplexidade: textos.criteriosComplexidade as CriterioComplexidade[],
  faixasComplexidade: textos.faixasComplexidade,
  gatilhos: textos.gatilhos as { condicao: string; elevaAte: number }[],
  notaGatilhos: textos.notaGatilhos,
  requisitos: textos.requisitos as RequisitoDoNivel[],
  roteiro: textos.roteiro,
  designacoes: textos.niveis as [string, string, string, string],
  oQueMudaria: textos.oQueMudaria as { seAcontecer: string; nivelMinimo: number }[],
  notaSoSobe: textos.notaSoSobe,
  notaImpacto: textos.notaImpacto,
  notaInternacional: textos.notaInternacional,
  notaParticipantes: textos.notaParticipantes,
  ajudaCampos: textos.ajudaCampos as Record<string, string>,
} as const;

/** Índice do critério de logística na pontuação: ele não é escolhido, vem da célula C49. */
export const CRITERIO_LOGISTICA = 8;

export const ALEGACAO_CARBONO_NEUTRO = "Evento carbono neutro";

export function designacao(nivel: Nivel): string {
  return `Nível ${nivel} - ${V3_16.designacoes[nivel - 1]}`;
}
