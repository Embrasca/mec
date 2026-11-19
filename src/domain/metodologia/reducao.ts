/**
 * Aba "REDUÇÃO" da Ferramenta v3.16: medidas, metas e resultado alcançado.
 * As colunas de ex-ante e ex-post da categoria vêm do inventário; a meta em
 * tCO₂e é ex-ante × meta % / 100 [H8]; a diferença é ex-post − ex-ante [M8].
 */
import { z } from "zod";
import { CATEGORIAS } from "./inventario";

export const OBJETIVOS = ["Evitar", "Reduzir", "Substituir", "Remover"] as const;
export const RESULTADOS = ["Concluída", "Parcial", "Não realizada", "Substituída"] as const;

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();

export const medidaSchema = z.object({
  categoria: z
    .string()
    .nullable()
    .refine((c) => c === null || CATEGORIAS.includes(c), "Categoria inválida."),
  acao: z.string().trim().max(500).nullable(),
  objetivo: z.enum(OBJETIVOS).nullable(),
  metaPct: z
    .number()
    .finite()
    .min(0, "Meta não pode ser negativa.")
    .max(100, "Meta acima de 100%.")
    .nullable(),
  responsavel: z.string().trim().max(200).nullable(),
  prazo: data,
  resultado: z.enum(RESULTADOS).nullable(),
  evidencia: z.string().trim().max(1000).nullable(),
});
export type Medida = z.infer<typeof medidaSchema>;

export function medidaVazia(): Medida {
  return {
    categoria: null,
    acao: null,
    objetivo: null,
    metaPct: null,
    responsavel: null,
    prazo: null,
    resultado: null,
    evidencia: null,
  };
}

const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);
const preenchido = (v: unknown) => v !== null && v !== undefined && v !== "";

export function calcularReducao(
  medidas: Medida[],
  exAntePorCategoria: Record<string, number> | null,
  exPostPorCategoria: Record<string, number> | null,
  nivel: number | null,
) {
  const linhas = medidas.map((m) => {
    const exAnte =
      m.categoria && exAntePorCategoria ? (exAntePorCategoria[m.categoria] ?? null) : null;
    const exPost =
      m.categoria && exPostPorCategoria ? (exPostPorCategoria[m.categoria] ?? null) : null;
    return {
      exAnte,
      metaT: n(m.metaPct) === 0 || exAnte === null ? null : (exAnte * n(m.metaPct)) / 100,
      exPost,
      diferenca: exAnte === null || exPost === null ? null : exPost - exAnte,
    };
  });
  // [F4] e [G4]: medidas com ação; com ação, responsável e prazo.
  const registradas = medidas.filter((m) => preenchido(m.acao)).length;
  const completas = medidas.filter(
    (m) => preenchido(m.acao) && preenchido(m.responsavel) && preenchido(m.prazo),
  ).length;
  const comMeta = medidas.filter((m) => n(m.metaPct) > 0).length;
  // [I4] e [B5]
  const exigencia = !nivel
    ? "Confirme o nível na caracterização"
    : nivel <= 2
      ? "Pelo menos três medidas, com responsável e prazo"
      : "Metas numéricas para as categorias de maior peso, com responsável e prazo";
  const atendida = !nivel ? false : nivel <= 2 ? completas >= 3 : comMeta >= 1;
  const conferencia = !nivel
    ? null
    : nivel <= 2
      ? atendida
        ? "OK: exigência do nível atendida"
        : "Faltam medidas com responsável e prazo"
      : atendida
        ? "OK: há metas numéricas registradas"
        : "Defina metas numéricas para as categorias de maior peso";
  return { linhas, registradas, completas, exigencia, atendida, conferencia };
}

/** Lembrete da aba [B39]. */
export const NOTA_DIFERENCA =
  "A diferença entre ex-ante e ex-post mistura o efeito da medida com mudanças de escala (mais ou menos público). Para explicar a diferença, use a comparação entre ex-ante e ex-post.";
