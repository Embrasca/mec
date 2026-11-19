/**
 * Inventário de emissões: abas "2 - EX-ANTE" e "3 - EX-POST" da Ferramenta
 * v3.16, colunas E a O (e o alerta da coluna Q do ex-ante).
 *
 *   tCO₂e de CO₂ = quantidade × FE CO₂ / 1000
 *   tCO₂e de CH₄ = quantidade × FE CH₄ × GWP CH₄ / 1000
 *   tCO₂e de N₂O = quantidade × FE N₂O × GWP N₂O / 1000
 *   CO₂ biogênico = quantidade × FE biogênico / 1000   (informado à parte, fora do total)
 *
 * Função pura: o servidor e a tela usam a mesma conta.
 */
import dados from "./v3_16/inventario.json";

export interface RegraDoFator {
  tipo: "fixo" | "sin";
  /** Só para `sin`: o fator é multiplicador × fator do SIN do ano. */
  multiplicador?: number;
}

export interface FatorDoItem {
  codigo: string;
  categoria: string;
  item: string;
  unidade: string;
  escopo: 1 | 2 | 3;
  /** kg por unidade; null quando a regra é `sin`. */
  feCo2: number | null;
  feCh4: number;
  feN2o: number;
  feBiogenico: number;
  regra: RegraDoFator;
  fonte: string;
  situacao: string;
}

export interface BaseDeFatores {
  nome: string;
  gwpCh4: number;
  gwpN2o: number;
  referenciaGwp: string;
  /** Fator médio anual do Sistema Interligado Nacional, kgCO₂/kWh. */
  sin: { ano: number; valor: number }[];
  itens: FatorDoItem[];
}

export const BASE_V3_16 = dados.baseDeFatores as unknown as BaseDeFatores & {
  fonte: string;
  notas: string[];
};
export const ITENS_POR_FORNECEDOR = dados.itensPorFornecedor as Record<string, string[]>;
export const TIPOS_DE_FORNECEDOR = Object.keys(ITENS_POR_FORNECEDOR).filter((t) => t !== "Todos");
export const DESCRICOES_POR_CATEGORIA = dados.descricoesPorCategoria as Record<string, string[]>;
export const CATEGORIAS = Object.keys(DESCRICOES_POR_CATEGORIA);
export const ITEM_SOLAR = "Energia solar gerada no local (kWh)";

/** Fator do SIN do ano; sem fator publicado, usa o último disponível e avisa [FATORES!B8, D8]. */
export function fatorDoSin(base: BaseDeFatores, ano: number | null) {
  const exato = ano === null ? undefined : base.sin.find((s) => s.ano === ano);
  if (exato) return { valor: exato.valor, anoUsado: exato.ano, aviso: null };
  const ultimo = base.sin[base.sin.length - 1];
  if (!ultimo) return { valor: 0, anoUsado: null, aviso: "A base não tem série do fator do SIN." };
  return {
    valor: ultimo.valor,
    anoUsado: ultimo.ano,
    aviso: `Não há fator do SIN publicado para ${ano ?? "o ano do inventário"}. Usando o de ${ultimo.ano}, o último disponível.`,
  };
}

export interface FatorAplicado {
  item: string;
  categoria: string;
  unidade: string;
  escopo: 1 | 2 | 3;
  feCo2: number;
  feCh4: number;
  feN2o: number;
  feBiogenico: number;
  fonte: string;
}

export function fatoresDoAno(base: BaseDeFatores, ano: number | null): Map<string, FatorAplicado> {
  const sin = fatorDoSin(base, ano).valor;
  return new Map(
    base.itens.map((f) => [
      f.item,
      {
        item: f.item,
        categoria: f.categoria,
        unidade: f.unidade,
        escopo: f.escopo,
        feCo2: f.regra.tipo === "sin" ? (f.regra.multiplicador ?? 1) * sin : (f.feCo2 ?? 0),
        feCh4: f.feCh4,
        feN2o: f.feN2o,
        feBiogenico: f.feBiogenico,
        fonte: f.fonte,
      },
    ]),
  );
}

export type Etapa = "ex_ante" | "ex_post";

/** Qualidade do dado no ex-post [LISTAS!I4:I9]: a nota é o primeiro caractere. */
export const QUALIDADES = [
  "5 - Medição própria",
  "4 - Documento do fornecedor",
  "3 - Fonte secundaria",
  "2 - Média ou proxy",
  "1 - Estimativa",
  "0 - Sem fonte",
] as const;
export const rotuloDaQualidade = (nota: number | null | undefined) =>
  nota === null || nota === undefined ? null : (QUALIDADES[5 - nota] ?? null);

export interface LinhaDeInventario {
  fornecedor: string | null;
  item: string | null;
  descricao: string | null;
  quantidade: number | null;
  premissa: string | null;
  /** Só no ex-post: nota de 0 a 5. */
  qualidade?: number | null;
  /** Só no ex-post: arquivo ou referência do comprovante. */
  evidencia?: string | null;
}

export interface LinhaCalculada {
  unidade: string | null;
  categoria: string | null;
  escopo: 1 | 2 | 3 | null;
  feCo2: number | null;
  feCh4: number | null;
  feN2o: number | null;
  tco2eCo2: number | null;
  tco2eCh4: number | null;
  tco2eN2o: number | null;
  total: number | null;
  biogenico: number | null;
  /** null quando a linha não tem item; "OK" quando está completa. */
  alerta: string | null;
}

export type TipoDeAlerta =
  | "ok"
  | "quantidade"
  | "fator_obrigatorio"
  | "sem_fator"
  | "premissa"
  | "item"
  | "qualidade"
  | "evidencia"
  | "medido5";

export const ALERTAS: Record<Exclude<TipoDeAlerta, "ok">, string> = {
  quantidade: "Falta a quantidade",
  fator_obrigatorio: "ALERTA: defina o fator na base de fatores (obrigatório neste nível)",
  sem_fator: "Sem fator nacional: declare como limitação",
  premissa: "Falta a premissa: de onde veio o número",
  item: "Item fora da base de fatores do evento",
  qualidade: "Falta a qualidade do dado",
  evidencia: "Falta a evidência",
  medido5: "ALERTA: fonte com 5% ou mais exige dado medido neste nível",
};
/** Nome antigo, mantido para o ex-ante. */
export const ALERTAS_EX_ANTE = ALERTAS;

function tipoDoAlertaExAnte(
  l: LinhaDeInventario,
  f: FatorAplicado | undefined,
  nivel: number | null,
): TipoDeAlerta | null {
  if (!l.item) return null;
  if (!f) return "item";
  if (l.quantidade === null) return "quantidade";
  if (f.feCo2 === 0 && f.feCh4 === 0 && f.feN2o === 0 && l.item !== ITEM_SOLAR)
    return (nivel ?? 0) >= 3 ? "fator_obrigatorio" : "sem_fator";
  if (!l.premissa?.trim()) return "premissa";
  return "ok";
}

/**
 * Alerta da coluna S do ex-post. A regra dos 5% compara a linha com o total
 * do inventário [N51], por isso recebe o total já somado.
 */
function tipoDoAlertaExPost(
  l: LinhaDeInventario,
  f: FatorAplicado | undefined,
  nivel: number | null,
  totalDaLinha: number,
  totalDoInventario: number,
): TipoDeAlerta | null {
  if (!l.item) return null;
  if (!f) return "item";
  if (l.quantidade === null) return "quantidade";
  const nv = nivel ?? 0;
  if (f.feCo2 === 0 && f.feCh4 === 0 && f.feN2o === 0 && l.item !== ITEM_SOLAR)
    return nv >= 3 ? "fator_obrigatorio" : "sem_fator";
  const nota = l.qualidade ?? null;
  if (nota === null) return "qualidade";
  if (nota <= 2 && !l.premissa?.trim()) return "premissa";
  if (nv >= 2 && !l.evidencia?.trim()) return "evidencia";
  if (nv >= 3 && totalDaLinha >= 0.05 * totalDoInventario && nota < 4) return "medido5";
  return "ok";
}

export function calcularLinha(
  l: LinhaDeInventario,
  fatores: Map<string, FatorAplicado>,
  base: Pick<BaseDeFatores, "gwpCh4" | "gwpN2o">,
  nivel: number | null,
): LinhaCalculada & { tipoAlerta: TipoDeAlerta | null } {
  const f = l.item ? fatores.get(l.item) : undefined;
  const conta = Boolean(l.item) && l.quantidade !== null;
  const q = l.quantidade ?? 0;
  const co2 = conta ? (q * (f?.feCo2 ?? 0)) / 1000 : null;
  const ch4 = conta ? (q * (f?.feCh4 ?? 0) * base.gwpCh4) / 1000 : null;
  const n2o = conta ? (q * (f?.feN2o ?? 0) * base.gwpN2o) / 1000 : null;
  const tipoAlerta = tipoDoAlertaExAnte(l, f, nivel);
  return {
    unidade: f?.unidade ?? null,
    categoria: f?.categoria ?? null,
    escopo: f?.escopo ?? null,
    feCo2: f?.feCo2 ?? null,
    feCh4: f?.feCh4 ?? null,
    feN2o: f?.feN2o ?? null,
    tco2eCo2: co2,
    tco2eCh4: ch4,
    tco2eN2o: n2o,
    total: co2 === null ? null : co2 + (ch4 ?? 0) + (n2o ?? 0),
    biogenico: conta ? (q * (f?.feBiogenico ?? 0)) / 1000 : null,
    alerta: tipoAlerta === null ? null : tipoAlerta === "ok" ? "OK" : ALERTAS[tipoAlerta],
    tipoAlerta,
  };
}

export interface ResultadoDoInventario {
  linhas: ReturnType<typeof calcularLinha>[];
  totais: { co2: number; ch4: number; n2o: number; total: number; biogenico: number };
  porCategoria: { categoria: string; total: number; participacao: number }[];
  porEscopo: [number, number, number];
  pendencias: number;
  avisoSin: string | null;
}

export function calcularInventario(
  linhas: LinhaDeInventario[],
  base: BaseDeFatores,
  ano: number | null,
  nivel: number | null,
  etapa: Etapa = "ex_ante",
): ResultadoDoInventario {
  const fatores = fatoresDoAno(base, ano);
  const calc = linhas.map((l) => calcularLinha(l, fatores, base, nivel));
  const soma = (k: "tco2eCo2" | "tco2eCh4" | "tco2eN2o" | "total" | "biogenico") =>
    calc.reduce((a, l) => a + (l[k] ?? 0), 0);
  const total = soma("total");
  if (etapa === "ex_post")
    calc.forEach((c, i) => {
      const l = linhas[i]!;
      const t = tipoDoAlertaExPost(
        l,
        l.item ? fatores.get(l.item) : undefined,
        nivel,
        c.total ?? 0,
        total,
      );
      c.tipoAlerta = t;
      c.alerta = t === null ? null : t === "ok" ? "OK" : ALERTAS[t];
    });
  const porEscopo: [number, number, number] = [0, 0, 0];
  for (const l of calc)
    if (l.escopo && l.total !== null) porEscopo[l.escopo - 1] = porEscopo[l.escopo - 1]! + l.total;
  const usaSin = linhas.some((l) => {
    const f = base.itens.find((i) => i.item === l.item);
    return f?.regra.tipo === "sin";
  });
  return {
    linhas: calc,
    totais: {
      co2: soma("tco2eCo2"),
      ch4: soma("tco2eCh4"),
      n2o: soma("tco2eN2o"),
      total,
      biogenico: soma("biogenico"),
    },
    porCategoria: CATEGORIAS.map((categoria) => {
      const t = calc.reduce((a, l) => a + (l.categoria === categoria ? (l.total ?? 0) : 0), 0);
      return { categoria, total: t, participacao: total > 0 ? t / total : 0 };
    }),
    porEscopo,
    pendencias: calc.filter((l) => l.tipoAlerta !== null && l.tipoAlerta !== "ok").length,
    avisoSin: usaSin ? fatorDoSin(base, ano).aviso : null,
  };
}

/** Mensagem do topo da aba 2 conforme o nível [2 - EX-ANTE!A3]. */
export function orientacaoExAnte(nivel: number | null): string {
  if (!nivel) return "Confirme o nível na caracterização para ver o que ele exige nesta etapa.";
  return `NÍVEL ${nivel}: escolha o item e digite a quantidade. Escreva de onde veio cada número na premissa. ${
    nivel <= 2
      ? "Neste nível, estimativas com premissa escrita bastam."
      : "Neste nível, separe a estimativa por categoria e trate primeiro as que mais pesam."
  }`;
}

/** Mensagem do topo da aba 3 conforme o nível [3 - EX-POST!A3]. */
export function orientacaoExPost(nivel: number | null): string {
  if (!nivel) return "Confirme o nível na caracterização para ver o que ele exige nesta etapa.";
  return `NÍVEL ${nivel}: item, quantidade e qualidade do dado são obrigatórios. Toda estimativa (nota 2 ou menos) exige a premissa. ${
    nivel === 1
      ? "A evidência é opcional neste nível. Sem fator nacional, declare como limitação."
      : nivel === 2
        ? "A evidência é obrigatória. Sem fator nacional, declare como limitação."
        : "A evidência é obrigatória, toda fonte com 5% ou mais do total exige dado medido e o fator precisa estar definido."
  }`;
}

/** Itens que o tipo de fornecedor entrega; sem fornecedor, todos [LISTAS ITENS]. */
export function itensDoFornecedor(fornecedor: string | null): string[] {
  return ITENS_POR_FORNECEDOR[fornecedor ?? "Todos"] ?? ITENS_POR_FORNECEDOR["Todos"] ?? [];
}
