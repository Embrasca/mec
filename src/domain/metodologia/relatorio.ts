/**
 * Aba "7 - RELATÓRIO" da Ferramenta v3.16 e memória de cálculo do inventário.
 * Funções puras: o servidor congela o resultado em cada versão do relatório.
 */
import {
  fatoresDoAno,
  fatorDoSin,
  rotuloDaQualidade,
  type BaseDeFatores,
  type LinhaDeInventario,
  type ResultadoDoInventario,
} from "./inventario";

/**
 * [4 - RESULTADOS!E41] é texto fixo, e a fórmula de [B25] exige que seja "OK".
 * Com isso, "Evento carbono neutro" nunca é liberado (ponto 1 a confirmar
 * com a coordenação da metodologia). O sistema segue a planilha.
 */
export const E41 = "Não há mínimo exigido";

export const FRASES = {
  vazio: "Preencha o inventário ex-post para gerar a frase.",
  neutro: "Evento carbono neutro (confira o dossiê de compensação)",
  compensadas: "Emissões residuais compensadas",
  parcial: "Emissões parcialmente compensadas",
  quantificadas: "Evento com emissões quantificadas",
} as const;

/** [7 - RELATÓRIO!B25] */
export function fraseAutorizada(e: {
  totalExPost: number;
  aCompensar: number;
  aposentada: number;
  situacaoPrimario: string | null;
}): string {
  if (e.totalExPost === 0) return FRASES.vazio;
  const compensou = e.aposentada >= e.aCompensar;
  if (compensou && e.situacaoPrimario === "OK" && (E41 as string) === "OK") return FRASES.neutro;
  if (compensou) return FRASES.compensadas;
  if (e.aposentada > 0) return FRASES.parcial;
  return FRASES.quantificadas;
}

/** Ordem das alegações, da mais modesta à mais forte, para comparar com a pretendida. */
const FORCA: Record<string, number> = {
  [FRASES.quantificadas]: 0,
  [FRASES.parcial]: 1,
  [FRASES.compensadas]: 2,
  [FRASES.neutro]: 3,
  "Evento carbono neutro": 3,
};

/**
 * Melhoria do sistema: a ficha registra a alegação pretendida (aba A); se ela
 * for mais forte que a frase liberada, o relatório avisa.
 */
export function avisoDaAlegacao(pretendida: string | null, frase: string): string | null {
  if (!pretendida || frase === FRASES.vazio) return null;
  const p = FORCA[pretendida];
  const f = FORCA[frase];
  if (p === undefined || f === undefined || p <= f) return null;
  return `A alegação pretendida na caracterização ("${pretendida}") vai além da frase que o inventário permite. Use a frase permitida.`;
}

export const NOTAS_DA_FRASE = [
  'A frase considera apenas o inventário e a quantidade aposentada. Para dizer "evento carbono neutro" é preciso cumprir também as seis condições da seção 2.5 do Guia, com o dossiê de compensação completo e a conferência exigida pelo seu nível.',
  'Nunca use "impacto zero", "100% sustentável", "sem emissões" ou "amigo do clima". Informe sempre as emissões brutas antes de falar em compensação, e diga o que ficou de fora do cálculo.',
];

// ---------------------------------------------------------------------
// Memória de cálculo
// ---------------------------------------------------------------------

export interface LinhaDaMemoria {
  ordem: number;
  item: string;
  descricao: string | null;
  fornecedor: string | null;
  categoria: string | null;
  escopo: number | null;
  quantidade: number | null;
  unidade: string | null;
  feCo2: number | null;
  feCh4: number | null;
  feN2o: number | null;
  tco2eCo2: number | null;
  tco2eCh4: number | null;
  tco2eN2o: number | null;
  total: number | null;
  biogenico: number | null;
  /** A conta escrita por extenso, com os números usados. */
  formula: string;
  fonteDoFator: string;
  qualidade: string | null;
  evidencia: string | null;
  premissa: string | null;
  alerta: string | null;
}

const fmt = (v: number) => String(Number(v.toPrecision(10)));

export function memoriaDeCalculo(
  linhas: LinhaDeInventario[],
  resultado: ResultadoDoInventario,
  base: BaseDeFatores,
  ano: number | null,
): LinhaDaMemoria[] {
  const fatores = fatoresDoAno(base, ano);
  const sin = fatorDoSin(base, ano);
  return linhas
    .map((l, i) => ({ l, c: resultado.linhas[i]!, ordem: i + 1 }))
    .filter(({ l }) => l.item)
    .map(({ l, c, ordem }) => {
      const f = fatores.get(l.item!);
      const regra = base.itens.find((x) => x.item === l.item)?.regra;
      const q = l.quantidade;
      const formula =
        q === null || !f
          ? "—"
          : [
              `CO₂: ${fmt(q)} × ${fmt(f.feCo2)} ÷ 1000`,
              `CH₄: ${fmt(q)} × ${fmt(f.feCh4)} × ${base.gwpCh4} ÷ 1000`,
              `N₂O: ${fmt(q)} × ${fmt(f.feN2o)} × ${base.gwpN2o} ÷ 1000`,
            ].join(" + ");
      const fonte = f
        ? regra?.tipo === "sin"
          ? `${f.fonte} (fator médio do SIN de ${sin.anoUsado ?? "—"}${
              (regra.multiplicador ?? 1) !== 1 ? ` × ${regra.multiplicador}` : ""
            })`
          : f.fonte
        : "Item fora da base de fatores";
      return {
        ordem,
        item: l.item!,
        descricao: l.descricao,
        fornecedor: l.fornecedor,
        categoria: c.categoria,
        escopo: c.escopo,
        quantidade: q,
        unidade: c.unidade,
        feCo2: c.feCo2,
        feCh4: c.feCh4,
        feN2o: c.feN2o,
        tco2eCo2: c.tco2eCo2,
        tco2eCh4: c.tco2eCh4,
        tco2eN2o: c.tco2eN2o,
        total: c.total,
        biogenico: c.biogenico,
        formula,
        fonteDoFator: fonte,
        qualidade: rotuloDaQualidade(l.qualidade),
        evidencia: l.evidencia ?? null,
        premissa: l.premissa,
        alerta: c.alerta,
      };
    });
}
