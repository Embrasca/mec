import { z } from "zod";
import { normalizarCor, problemaDaCor } from "./cor";

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const texto = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, `Informe ${campo}.`)
    .max(max, `${campo[0]!.toUpperCase()}${campo.slice(1)} muito longo.`);

export const eventoSchema = z
  .object({
    nome: texto(1, 200, "o nome do evento"),
    instituicao: texto(1, 200, "a instituição responsável"),
    cidade: z.string().trim().max(120),
    /** Código IBGE do município. Sem ele, o nome digitado é procurado na lista do IBGE. */
    municipioIbge: z.number().int().nullable().default(null),
    uf: z.enum(UFS, { errorMap: () => ({ message: "Escolha a UF." }) }),
    dataInicio: data,
    dataFim: data,
    cor: z
      .string()
      .transform(normalizarCor)
      .superRefine((cor, ctx) => {
        const p = problemaDaCor(cor);
        if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
      }),
    descricao: z.string().trim().max(2000, "Descrição muito longa.").nullable(),
  })
  .refine((e) => e.dataFim >= e.dataInicio, {
    message: "A data de término não pode ser anterior à de início.",
    path: ["dataFim"],
  });

export type DadosDoEvento = z.input<typeof eventoSchema>;
// A conferência do município com a lista do IBGE fica em `territorio`
// (eventoComMunicipioSchema), para a lista não ir a todas as telas.

export const PAPEIS = ["gestor", "equipe", "revisor", "leitor"] as const;
export type Papel = (typeof PAPEIS)[number];

export const NOME_DO_PAPEL: Record<Papel, string> = {
  gestor: "Gestor do evento",
  equipe: "Equipe",
  revisor: "Revisor",
  leitor: "Leitor",
};

export const DESCRICAO_DO_PAPEL: Record<Papel, string> = {
  gestor: "Edita tudo, monta a equipe e confirma o enquadramento.",
  equipe: "Preenche a caracterização e o acompanhamento.",
  revisor: "Consulta tudo, sem editar.",
  leitor: "Consulta tudo, sem editar.",
};

export type Fase = "Pré-evento" | "Execução" | "Pós-evento";

/** Fase pela data de hoje (AAAA-MM-DD), comparada ao período do evento. */
export function faseDoEvento(hoje: string, inicio: string, fim: string): Fase {
  if (hoje < inicio) return "Pré-evento";
  if (hoje > fim) return "Pós-evento";
  return "Execução";
}
