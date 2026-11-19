/**
 * Pós-evento da Ferramenta v3.16: abas "4 - RESULTADOS", "5 - COMPARAÇÃO",
 * "6 - EMISSÕES RESIDUAIS" e "OCORRÊNCIAS". Funções puras; as referências
 * entre colchetes apontam a célula reproduzida.
 */
import { z } from "zod";
import { CATEGORIAS, type LinhaDeInventario, type ResultadoDoInventario } from "./inventario";

const div = (a: number, b: number | null | undefined) =>
  b === null || b === undefined || b === 0 || !Number.isFinite(b) ? null : a / b;

// ---------------------------------------------------------------------
// 4 - RESULTADOS
// ---------------------------------------------------------------------

export interface DadosDePublico {
  participantes: number | null; // [1 - EVENTO!C7]
  participantesDia: number | null; // [C8]
  dias: number | null; // [C9]
  participantesDiaSoma: number | null; // [A - CARACTERIZAÇÃO!C41]
}

/** Mínimo de emissões com dado primário por nível [D40]. */
export const minimoPrimario = (nivel: number | null) =>
  nivel === 1 ? 0.2 : nivel === 2 ? 0.4 : 0.5;

export function calcularResultados(
  exAnte: ResultadoDoInventario | null,
  exPost: ResultadoDoInventario,
  linhasExPost: LinhaDeInventario[],
  publico: DadosDePublico,
  nivel: number | null,
) {
  const total = exPost.totais.total;
  const totalAnte = exAnte?.totais.total ?? null;
  const pd =
    (publico.participantesDiaSoma ?? 0) > 0
      ? publico.participantesDiaSoma
      : (publico.participantesDia ?? 0) * (publico.dias ?? 0);
  const principais = {
    total, // [C5]
    exAnte: totalAnte, // [C6]
    variacao: totalAnte === null ? null : div(total - totalAnte, totalAnte), // [C7]
    biogenico: exPost.totais.biogenico, // [C8]
    porParticipante: div(total * 1000, publico.participantes), // [C9]
    porParticipanteDia: div(total * 1000, pd), // [C10]
  };

  const categorias = CATEGORIAS.map((categoria) => {
    const ante = exAnte?.porCategoria.find((c) => c.categoria === categoria)?.total ?? null;
    const post = exPost.porCategoria.find((c) => c.categoria === categoria)?.total ?? 0;
    const participacao = div(post, total); // [E14]
    return {
      categoria,
      exAnte: ante, // [C14]
      exPost: post, // [D14]
      participacao,
      variacao: ante === null ? null : div(post - ante, ante), // [F14]
      material: participacao !== null && participacao >= 0.05, // [G14]
      prioritaria: false,
    };
  });
  // Texto da aba [B25]: as categorias que somam 80% do total são prioritárias.
  // A planilha não calcula; o sistema marca, do maior para o menor, as que
  // entram até a soma alcançar 80%.
  if (total > 0) {
    let acumulado = 0;
    for (const c of [...categorias].sort((a, b) => b.exPost - a.exPost)) {
      if (acumulado >= 0.8 || c.exPost <= 0) break;
      c.prioritaria = true;
      acumulado += c.exPost / total;
    }
  }

  const escopos = exPost.porEscopo.map((v, i) => ({
    recorte: [
      "Escopo 1 - fontes próprias ou controladas",
      "Escopo 2 - energia elétrica adquirida",
      "Escopo 3 - demais fontes da cadeia",
    ][i]!,
    valor: v,
    participacao: div(v, total),
  }));
  const gases = (
    [
      ["Contribuição do CO₂", exPost.totais.co2],
      ["Contribuição do CH₄", exPost.totais.ch4],
      ["Contribuição do N₂O", exPost.totais.n2o],
    ] as const
  ).map(([recorte, valor]) => ({ recorte, valor, participacao: div(valor, total) }));

  // Qualidade [C38:E43]
  const somaPorNota = [0, 0, 0, 0, 0, 0];
  linhasExPost.forEach((l, i) => {
    const nota = l.qualidade;
    const t = exPost.linhas[i]?.total;
    if (nota !== null && nota !== undefined && t !== null && t !== undefined)
      somaPorNota[nota] = somaPorNota[nota]! + t;
  });
  const comItem = exPost.linhas.filter((l) => l.alerta !== null);
  const primario = div(somaPorNota[5]! + somaPorNota[4]!, total);
  const minimo = minimoPrimario(nivel);
  const fontes5 = comItem.filter((l) => l.tipoAlerta === "medido5").length;
  const qualidade = {
    linhas: linhasExPost.filter((l) => l.item).length, // [C38]
    pendentes: comItem.filter((l) => l.alerta !== "OK").length, // [C39]
    primario, // [C40]
    minimoPrimario: minimo, // [D40]
    situacaoPrimario: primario === null ? null : primario >= minimo ? "OK" : "ABAIXO DO MÍNIMO", // [E40]
    notaMedia: div(
      somaPorNota.reduce((a, v, nota) => a + nota * v, 0),
      total,
    ), // [C41]
    estimadas: div(somaPorNota[2]! + somaPorNota[1]! + somaPorNota[0]!, total), // [C42]
    fontes5, // [C43]
    situacaoFontes5:
      (nivel ?? 0) < 3 ? "Não exigido neste nível" : fontes5 === 0 ? "OK" : "ABAIXO DO MÍNIMO", // [E43]
  };

  // Completude por categoria [B51:G60]
  const completude = CATEGORIAS.map((categoria) => {
    const idx = exPost.linhas
      .map((l, i) => (l.categoria === categoria ? i : -1))
      .filter((i) => i >= 0);
    const linhas = idx.length;
    const alertas = idx.filter((i) => exPost.linhas[i]!.alerta !== "OK").length;
    const semEvidencia = idx.filter((i) => !linhasExPost[i]!.evidencia?.trim()).length;
    return {
      categoria,
      linhas,
      alertas,
      semEvidencia,
      situacao:
        linhas === 0
          ? "Sem dados: confirme se não se aplica"
          : alertas > 0
            ? "Incompleta: resolva os alertas"
            : semEvidencia > 0 && (nivel ?? 0) >= 2
              ? "Pendente de evidência"
              : "Completa",
    };
  });

  return { principais, categorias, escopos, gases, qualidade, completude };
}

// ---------------------------------------------------------------------
// 5 - COMPARAÇÃO
// ---------------------------------------------------------------------

export const ORIGENS = [
  "Desempenho",
  "Escala",
  "Premissa",
  "Método",
  "Sem desvio relevante",
] as const;
export type Origem = (typeof ORIGENS)[number];

/** Significado de cada origem [B19:C22]. */
export const SIGNIFICADO_DA_ORIGEM: Record<Exclude<Origem, "Sem desvio relevante">, string> = {
  Desempenho:
    "A medida de redução foi implementada e produziu o efeito. É a única origem que pode ser comunicada como redução.",
  Escala:
    "O evento foi maior ou menor que o previsto. Normalize por participante-dia antes de concluir.",
  Premissa: "A hipótese do ex-ante estava errada. Corrija o parâmetro para as próximas edições.",
  Método: "Mudou o fator, a fonte do fator, a fórmula ou o escopo da categoria. Não é desempenho.",
};

export const desvioSchema = z.object({
  categoria: z.string().refine((c) => CATEGORIAS.includes(c), "Categoria inválida."),
  origem: z.enum(ORIGENS).nullable(),
  explicacao: z.string().trim().max(2000).nullable(),
});
export type Desvio = z.infer<typeof desvioSchema>;

export function calcularComparacao(
  exAnte: ResultadoDoInventario,
  exPost: ResultadoDoInventario,
  desvios: Desvio[],
) {
  const categorias = CATEGORIAS.map((categoria) => {
    const ante = exAnte.porCategoria.find((c) => c.categoria === categoria)?.total ?? 0;
    const post = exPost.porCategoria.find((c) => c.categoria === categoria)?.total ?? 0;
    const d = desvios.find((x) => x.categoria === categoria);
    return {
      categoria,
      exAnte: ante, // [C5]
      exPost: post, // [D5]
      diferenca: post - ante, // [E5]
      pct: div(post - ante, ante), // [F5]
      origem: d?.origem ?? null,
      explicacao: d?.explicacao ?? null,
    };
  });
  const ta = exAnte.totais.total;
  const tp = exPost.totais.total;
  return {
    categorias,
    total: { exAnte: ta, exPost: tp, diferenca: tp - ta, pct: div(tp - ta, ta) }, // [C16:F16]
    /** Categorias com diferença e sem a origem classificada ("Classifique a causa de cada diferença"). */
    semOrigem: categorias.filter((c) => c.diferenca !== 0 && !c.origem).length,
  };
}

export const NOTA_PRESERVE_EX_ANTE =
  "Preserve o ex-ante original. Não o corrija depois do evento para aproximar do resultado: a diferença entre os dois é a informação de gestão mais valiosa do ciclo.";

// ---------------------------------------------------------------------
// 6 - EMISSÕES RESIDUAIS
// ---------------------------------------------------------------------

export const compensacaoSchema = z.object({
  omissaoT: z.number().finite().min(0, "Valor não pode ser negativo.").max(1e9).nullable(),
  omissaoDescricao: z.string().trim().max(2000).nullable(),
  aposentadaT: z.number().finite().min(0, "Valor não pode ser negativo.").max(1e9).nullable(),
  comprovante: z.string().trim().max(2000).nullable(),
});
export type Compensacao = z.infer<typeof compensacaoSchema>;

export const compensacaoVazia = (): Compensacao => ({
  omissaoT: null,
  omissaoDescricao: null,
  aposentadaT: null,
  comprovante: null,
});

/** ROUNDUP(x, 0) com o arredondamento a 15 dígitos que o Excel aplica antes. */
const arredondarParaCima = (x: number) => Math.ceil(Number(x.toPrecision(15)));

export function calcularCompensacao(totalExPost: number, c: Compensacao) {
  const aCompensar = arredondarParaCima(totalExPost); // [C9]
  const aposentada = c.aposentadaT ?? 0;
  return {
    brutas: totalExPost, // [C5]
    residuais: totalExPost, // [C7]
    aCompensar,
    saldo: Math.max(0, aCompensar - aposentada), // [C11]
    completa:
      aCompensar === 0
        ? "Preencha o inventário"
        : aposentada >= aCompensar
          ? "SIM - quantidade suficiente"
          : "AINDA NÃO", // [C13]
    pendencias: [
      ...((c.omissaoT ?? 0) > 0 && !c.omissaoDescricao
        ? ["Descreva a medida viável que não foi adotada (parcela não abatida por omissão)."]
        : []),
      ...(aposentada > 0 && !c.comprovante
        ? ["Informe o comprovante da aposentadoria dos créditos."]
        : []),
    ],
  };
}

export const AVISOS_DA_COMPENSACAO = [
  "As medidas aplicadas já aparecem no total. NÃO desconte de novo.",
  "A quantidade compensada NÃO é descontada das emissões do evento. No relatório, os dois números aparecem separados: quanto o evento emitiu e quanto foi compensado. Comprar crédito não é compensar: o que vale é a aposentadoria.",
  "PLANTIO DE MUDAS NÃO COMPENSA EMISSÕES. Ele é uma ação ambiental e educativa valiosa, mas não entra nesta conta. Registre a ação à parte, em mudas, área e espécies. Para compensar, use créditos de projeto certificado.",
];

// ---------------------------------------------------------------------
// OCORRÊNCIAS
// ---------------------------------------------------------------------

export const FASES = ["Pré-evento", "Execução", "Pós-evento"] as const;
export const CATEGORIAS_DE_OCORRENCIA = [...CATEGORIAS, "Participantes", "Outra"];
export const IMPACTOS = [
  "Sem impacto nos dados",
  "Dado medido substituído por estimativa",
  "Dado perdido",
  "Dado atrasado",
  "Mudança de escopo",
  "Outro",
] as const;
export const SITUACOES = ["Aberta", "Em tratamento", "Resolvida"] as const;

const texto = (max: number) => z.string().trim().max(max).nullable();

export const ocorrenciaSchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .nullable(),
  fase: z.enum(FASES).nullable(),
  categoria: z
    .string()
    .nullable()
    .refine((c) => c === null || CATEGORIAS_DE_OCORRENCIA.includes(c), "Categoria inválida."),
  ocorrencia: z.string().trim().min(1, "Descreva a ocorrência.").max(1000),
  impacto: z.enum(IMPACTOS).nullable(),
  acao: texto(1000),
  responsavel: texto(200),
  situacao: z.enum(SITUACOES),
  premissa: texto(2000),
});
export type Ocorrencia = z.infer<typeof ocorrenciaSchema>;

export const ocorrenciaVazia = (): Ocorrencia => ({
  data: null,
  fase: null,
  categoria: null,
  ocorrencia: "",
  impacto: null,
  acao: null,
  responsavel: null,
  situacao: "Aberta",
  premissa: null,
});

/** [D4], [F4] e [G4]. */
export function resumirOcorrencias(lista: Pick<Ocorrencia, "situacao">[]) {
  const abertas = lista.filter((o) => o.situacao !== "Resolvida").length;
  return {
    registradas: lista.length,
    abertas,
    alerta:
      abertas > 0 ? "ALERTA: resolva as ocorrências abertas antes de fechar o inventário" : null,
  };
}
