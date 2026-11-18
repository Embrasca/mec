/**
 * Ficha de caracterização do evento (aba A da Ferramenta, blocos A.2 a A.6).
 *
 * A identificação (nome, instituição, cidade, datas) mora no cadastro do evento
 * e não é repetida aqui: é digitada uma vez só, como a planilha pede.
 *
 * O mesmo esquema valida no navegador e no servidor.
 */
import { z } from "zod";
import { V3_16 } from "./v3_16";

const numero = (max: number) => z.number().finite().min(0).max(max).nullable();
const inteiro = (max: number) => z.number().int().min(0).max(max).nullable();
const umDe = (opcoes: readonly string[]) =>
  z
    .string()
    .nullable()
    .refine((v) => v === null || opcoes.includes(v), { message: "Opção inválida." });

const opcoesComplexidade = V3_16.criteriosComplexidade.map((c) => c.opcoes as readonly string[]);

export const caracterizacaoSchema = z.object({
  /** C7. Define o fator de energia elétrica. */
  anoInventario: z.number().int().min(2000).max(2100).nullable(),
  /** C11 */
  responsavelGestaoClimatica: z.string().trim().max(200).nullable(),
  // A.2 Perfil e operação
  formato: umDe(V3_16.formatos),
  participantesDia: inteiro(10_000_000),
  participantesTotal: inteiro(10_000_000),
  percentualAereo: numero(100),
  diariasHospedagem: inteiro(10_000_000),
  fornecedores: inteiro(100_000),
  areaEstruturaM2: numero(10_000_000),
  potenciaGeradoresKva: numero(1_000_000),
  numeroGeradores: inteiro(10_000),
  locaisSimultaneos: inteiro(10_000),
  transporteAquaviario: umDe(V3_16.simNao),
  itinerante: umDe(V3_16.simNao),
  porcoesAlimentacao: inteiro(100_000_000),
  residuosKg: numero(100_000_000),
  alegacao: umDe(V3_16.alegacoes),
  // A.2.1 Como o público chega (o percentual aéreo vem de percentualAereo)
  pctOnibus: numero(100),
  pctCarro: numero(100),
  pctTrem: numero(100),
  pctLocal: numero(100),
  pctOutros: numero(100),
  participantesDiaSoma: inteiro(100_000_000),
  acessosCredenciamento: inteiro(100_000_000),
  // A.2.2 Participação internacional e logística
  internacionaisPresenciais: inteiro(10_000_000),
  internacionaisOnline: inteiro(10_000_000),
  vooInternacional: inteiro(10_000_000),
  logistica: umDe(V3_16.logistica),
  // A.4 Pontuação de complexidade: uma opção por critério. O 9º (logística) é
  // derivado de `logistica` e o valor guardado aqui é ignorado.
  complexidade: z
    .array(z.string().nullable())
    .length(V3_16.criteriosComplexidade.length)
    .refine((lista) => lista.every((v, i) => v === null || opcoesComplexidade[i]!.includes(v)), {
      message: "Opção de complexidade inválida.",
    }),
  // A.6 Elevação técnica (opcional)
  elevacaoTecnica: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  justificativaElevacao: z.string().trim().max(4000).nullable(),
});

export type Caracterizacao = z.infer<typeof caracterizacaoSchema>;

export function caracterizacaoVazia(): Caracterizacao {
  return {
    anoInventario: null,
    responsavelGestaoClimatica: null,
    formato: null,
    participantesDia: null,
    participantesTotal: null,
    percentualAereo: null,
    diariasHospedagem: null,
    fornecedores: null,
    areaEstruturaM2: null,
    potenciaGeradoresKva: null,
    numeroGeradores: null,
    locaisSimultaneos: null,
    transporteAquaviario: null,
    itinerante: null,
    porcoesAlimentacao: null,
    residuosKg: null,
    alegacao: null,
    pctOnibus: null,
    pctCarro: null,
    pctTrem: null,
    pctLocal: null,
    pctOutros: null,
    participantesDiaSoma: null,
    acessosCredenciamento: null,
    internacionaisPresenciais: null,
    internacionaisOnline: null,
    vooInternacional: null,
    logistica: null,
    complexidade: V3_16.criteriosComplexidade.map(() => null),
    elevacaoTecnica: null,
    justificativaElevacao: null,
  };
}

/** Datas do cadastro do evento, usadas para os dias de evento (C16). */
export interface PeriodoDoEvento {
  dataInicio: string | null;
  dataFim: string | null;
}
