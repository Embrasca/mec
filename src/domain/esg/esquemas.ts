/**
 * Etapa 6, ESG além do GEE: o que se registra em cada eixo. Os 27 indicadores
 * e as cinco decisões foram aprovados pela equipe (proposta da Etapa 6).
 * Diversidade é sempre total autodeclarado, nunca dado por pessoa (D4).
 */
import { z } from "zod";

const inteiro = (max = 1_000_000) => z.number().int().min(0).max(max).nullable();
const numero = (max = 1e9) => z.number().finite().min(0).max(max).nullable();
const texto = (max: number) => z.string().trim().max(max).nullable();
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();

// ---------------------------------------------------------------------
// Mão de obra local (ML1 a ML7)
// ---------------------------------------------------------------------

export const VINCULOS = ["Própria", "Terceirizada", "Voluntária"] as const;
export const FASES_DE_TRABALHO = ["Montagem", "Realização", "Desmontagem"] as const;
/** ML3, "duas maneiras": pessoas × horas médias, ou o total da escala. */
export const MODOS_DE_HORAS = ["Pessoas × horas médias", "Total da escala"] as const;

export const equipeSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe a equipe ou o fornecedor.").max(200),
    vinculo: z.enum(VINCULOS),
    fase: z.enum(FASES_DE_TRABALHO),
    pessoas: z.number().int().min(1, "Informe quantas pessoas.").max(1_000_000),
    pessoasLocais: inteiro(),
    modoHoras: z.enum(MODOS_DE_HORAS).nullable(),
    horasPorPessoa: numero(24 * 60),
    horasTotais: numero(),
    horasLocais: numero(),
    formalizadas: inteiro(),
    mulheres: inteiro(),
    negras: inteiro(),
    pcd: inteiro(),
    jovens: inteiro(),
    capacitadas: inteiro(),
    horasCapacitacao: numero(),
    acidentesComAfastamento: inteiro(10_000),
    acidentesSemAfastamento: inteiro(10_000),
    evidencia: texto(1000),
  })
  .superRefine((e, ctx) => {
    for (const k of [
      "pessoasLocais",
      "formalizadas",
      "mulheres",
      "negras",
      "pcd",
      "jovens",
      "capacitadas",
    ] as const) {
      const v = e[k];
      if (v !== null && v > e.pessoas)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: "Não pode passar do número de pessoas.",
        });
    }
    if (
      e.modoHoras === "Total da escala" &&
      e.horasLocais !== null &&
      e.horasTotais !== null &&
      e.horasLocais > e.horasTotais
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["horasLocais"],
        message: "As horas locais não podem passar do total.",
      });
  });
export type Equipe = z.infer<typeof equipeSchema>;

export const equipeVazia = (): Equipe => ({
  nome: "",
  vinculo: "Própria",
  fase: "Realização",
  pessoas: 0,
  pessoasLocais: null,
  modoHoras: null,
  horasPorPessoa: null,
  horasTotais: null,
  horasLocais: null,
  formalizadas: null,
  mulheres: null,
  negras: null,
  pcd: null,
  jovens: null,
  capacitadas: null,
  horasCapacitacao: null,
  acidentesComAfastamento: null,
  acidentesSemAfastamento: null,
  evidencia: null,
});

/** Horas da linha: total e parcela local (ML3). null quando não informadas. */
export function horasDaEquipe(e: Equipe): { total: number | null; locais: number | null } {
  if (e.modoHoras === "Pessoas × horas médias" && e.horasPorPessoa !== null)
    return {
      total: e.pessoas * e.horasPorPessoa,
      locais: e.pessoasLocais === null ? null : e.pessoasLocais * e.horasPorPessoa,
    };
  if (e.modoHoras === "Total da escala") return { total: e.horasTotais, locais: e.horasLocais };
  return { total: null, locais: null };
}

// ---------------------------------------------------------------------
// Cadeia de suprimentos (CS1 a CS8): dados a mais de cada fornecedor
// ---------------------------------------------------------------------

export const PORTES = ["MEI", "ME", "EPP", "Demais"] as const;
export const LIDERANCAS = ["Mulheres", "Pessoas negras", "Pessoas indígenas"] as const;

export const fornecedorEsgSchema = z.object({
  municipioIbge: z.number().int().nullable(),
  porte: z.enum(PORTES).nullable(),
  valorContratado: numero(1e12),
  lideranca: z.array(z.enum(LIDERANCAS)).max(3),
  clausulaSocioambiental: z.boolean().nullable(),
  consultaTrabalhoEscravo: data,
  consultaIbama: data,
  consultaRegularidade: data,
  certificacoes: texto(500),
  valorCertificado: numero(1e12),
});
export type FornecedorEsg = z.infer<typeof fornecedorEsgSchema>;

export const fornecedorEsgVazio = (): FornecedorEsg => ({
  municipioIbge: null,
  porte: null,
  valorContratado: null,
  lideranca: [],
  clausulaSocioambiental: null,
  consultaTrabalhoEscravo: null,
  consultaIbama: null,
  consultaRegularidade: null,
  certificacoes: null,
  valorCertificado: null,
});

export const DESTINOS = ["Reutilizado", "Doado", "Devolvido ao fornecedor", "Descartado"] as const;
export const UNIDADES_DE_MATERIAL = ["itens", "kg", "m²", "m³"] as const;

export const materialSchema = z.object({
  material: z.string().trim().min(1, "Informe o material.").max(200),
  quantidade: z.number().finite().min(0).max(1e9),
  unidade: z.enum(UNIDADES_DE_MATERIAL),
  destino: z.enum(DESTINOS),
  receptor: texto(200),
  evidencia: texto(1000),
});
export type Material = z.infer<typeof materialSchema>;

// ---------------------------------------------------------------------
// Responsabilidade social (RS1 a RS5)
// ---------------------------------------------------------------------

export const TIPOS_DE_ACAO = [
  "Capacitação",
  "Doação",
  "Acessibilidade",
  "Inclusão",
  "Engajamento comunitário",
  "Voluntariado",
] as const;

export const acaoSocialSchema = z.object({
  tipo: z.enum(TIPOS_DE_ACAO),
  descricao: z.string().trim().min(1, "Descreva a ação.").max(1000),
  parceiro: texto(200),
  local: texto(200),
  data,
  pessoasBeneficiadas: inteiro(100_000_000),
  alimentosKg: numero(1e8),
  itensDoados: inteiro(100_000_000),
  instituicaoReceptora: texto(200),
  evidencia: texto(1000),
});
export type AcaoSocial = z.infer<typeof acaoSocialSchema>;

/** RS4. Piso tátil entra "quando a estrutura do evento suporta" (comentário da revisão). */
export const RECURSOS_DE_ACESSIBILIDADE = [
  "Intérprete de Libras",
  "Audiodescrição",
  "Legendas",
  "Rotas acessíveis",
  "Assentos reservados",
  "Piso tátil",
] as const;

const recurso = z.object({
  oferecido: z.boolean().nullable(),
  pessoas: inteiro(100_000_000),
});

export const naoSeAplicaSchema = z
  .record(
    z.string(),
    z.object({ justificativa: z.string().trim().min(5, "Justifique.").max(1000) }),
  )
  .refine((r) => Object.keys(r).length <= 30, "Indicadores demais.");

export const registroEsgSchema = z.object({
  acessibilidade: z.record(z.enum(RECURSOS_DE_ACESSIBILIDADE), recurso),
  pisoTatilViavel: z.boolean().nullable(),
  bemEstar: z.object({
    protocoloAssedio: z.boolean().nullable(),
    atendimentoSaude: z.boolean().nullable(),
    aguaGratuita: z.boolean().nullable(),
    atendimentosDeSaude: inteiro(1_000_000),
    casosRegistrados: inteiro(1_000_000),
  }),
  /** Indicador essencial que não se aplica ao evento, com a justificativa. */
  naoSeAplica: naoSeAplicaSchema,
});
export type RegistroEsg = z.infer<typeof registroEsgSchema>;

export const registroEsgVazio = (): RegistroEsg => ({
  acessibilidade: {},
  pisoTatilViavel: null,
  bemEstar: {
    protocoloAssedio: null,
    atendimentoSaude: null,
    aguaGratuita: null,
    atendimentosDeSaude: null,
    casosRegistrados: null,
  },
  naoSeAplica: {},
});

// ---------------------------------------------------------------------
// Pesquisa de satisfação (PS1 a PS7)
// ---------------------------------------------------------------------

export const ASPECTOS = [
  ["organizacao", "Organização"],
  ["conteudo", "Conteúdo"],
  ["alimentacao", "Alimentação"],
  ["acessibilidade", "Acessibilidade"],
  ["sustentabilidade", "Ações de sustentabilidade"],
] as const;
export type Aspecto = (typeof ASPECTOS)[number][0];

export const MEIOS_DE_TRANSPORTE = [
  "A pé ou bicicleta",
  "Ônibus ou metrô",
  "Carro",
  "Táxi ou aplicativo",
  "Avião",
  "Ônibus fretado ou rodoviário",
  "Outro",
] as const;

const nota15 = z.number().int().min(1).max(5).nullable();

export const respostaSchema = z.object({
  satisfacao: z.number().int().min(1, "Responda a satisfação geral.").max(5),
  nps: z.number().int().min(0).max(10).nullable(),
  organizacao: nota15,
  conteudo: nota15,
  alimentacao: nota15,
  acessibilidade: nota15,
  sustentabilidade: nota15,
  notouSustentabilidade: z.boolean().nullable(),
  meioTransporte: z.enum(MEIOS_DE_TRANSPORTE).nullable(),
  municipioOrigem: z.number().int().nullable(),
  comentario: texto(1000),
});
export type Resposta = z.infer<typeof respostaSchema>;
