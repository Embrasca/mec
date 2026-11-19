import { describe, expect, it } from "vitest";
import {
  BASE_V3_16,
  calcularInventario,
  orientacaoExPost,
  type LinhaDeInventario,
} from "../inventario";
import {
  calcularComparacao,
  calcularCompensacao,
  calcularResultados,
  ocorrenciaSchema,
  resumirOcorrencias,
  type Desvio,
} from "../posEvento";
import inv from "./fixtures/inventario-exemplo.json";
import caso from "./fixtures/pos-evento-exemplo.json";

const perto = (a: number | null | undefined, b: unknown) => {
  if (b === null || b === undefined || b === "") return expect(a ?? null).toBeNull();
  expect(Math.abs((a as number) - (b as number))).toBeLessThan(
    1e-9 * Math.max(1, Math.abs(b as number)),
  );
};

const nota = (q: unknown) => (typeof q === "string" ? Number(q.slice(0, 1)) : null);

function entradas(linhas: (typeof inv.exPost.linhas)[number][]): LinhaDeInventario[] {
  return linhas.map((l) => ({
    fornecedor: l.fornecedor ?? null,
    item: l.item,
    descricao: l.descricao ?? null,
    quantidade: typeof l.quantidade === "number" ? l.quantidade : null,
    premissa: (l.premissa as string | null) ?? null,
    qualidade: nota(l.qualidade),
    evidencia: (l.evidencia as string | null) ?? null,
  }));
}

const exAnteEntradas = inv.exAnte.linhas.map((l) => ({
  fornecedor: l.fornecedor ?? null,
  item: l.item,
  descricao: l.descricao ?? null,
  quantidade: l.quantidade as number,
  premissa: (l.premissa as string | null) ?? null,
}));
const postEntradas = entradas(inv.exPost.linhas);
const exAnte = calcularInventario(exAnteEntradas, BASE_V3_16, inv.ano, inv.nivel);
const exPost = calcularInventario(postEntradas, BASE_V3_16, inv.ano, inv.nivel, "ex_post");

describe("ex-post: alertas da coluna S", () => {
  it("todas as linhas do exemplo estão OK, como na planilha", () => {
    inv.exPost.linhas.forEach((l, i) => expect(exPost.linhas[i]!.alerta).toBe(l.esperado.alerta));
    expect(exPost.pendencias).toBe(0);
  });

  const base = { fornecedor: null, descricao: null, premissa: null, evidencia: "nf.pdf" };
  const diesel = "Diesel em gerador (litro)";
  const tipos = (linhas: LinhaDeInventario[], nivel: number) =>
    calcularInventario(linhas, BASE_V3_16, 2026, nivel, "ex_post").linhas.map((l) => l.tipoAlerta);

  it("qualidade, premissa da estimativa e evidência", () => {
    expect(
      tipos(
        [
          { ...base, item: diesel, quantidade: 1, qualidade: null },
          { ...base, item: diesel, quantidade: 1, qualidade: 2 },
          { ...base, item: diesel, quantidade: 1, qualidade: 0, premissa: "media" },
          { ...base, item: diesel, quantidade: 1, qualidade: 3, evidencia: null },
        ],
        2,
      ),
    ).toEqual(["qualidade", "premissa", "ok", "evidencia"]);
  });

  it("evidência opcional no Nível 1", () => {
    expect(
      tipos([{ ...base, item: diesel, quantidade: 1, qualidade: 3, evidencia: null }], 1),
    ).toEqual(["ok"]);
  });

  it("Nível 3: fonte com 5% ou mais do total exige nota 4 ou 5", () => {
    const linhas = [
      { ...base, item: diesel, quantidade: 1000, qualidade: 3 },
      { ...base, item: diesel, quantidade: 10, qualidade: 3 },
    ];
    expect(tipos(linhas, 3)).toEqual(["medido5", "ok"]);
    expect(tipos(linhas, 2)).toEqual(["ok", "ok"]);
  });

  it("orientação do nível igual à da planilha", () => {
    expect(orientacaoExPost(3)).toBe(inv.exPost.mensagemNivel);
  });
});

describe("4 - RESULTADOS: paridade com o exemplo Nível 3", () => {
  const r = calcularResultados(
    exAnte,
    exPost,
    postEntradas,
    {
      participantes: caso.participantes,
      participantesDia: caso.participantesDia,
      dias: caso.dias,
      participantesDiaSoma: caso.participantesDiaSoma,
    },
    caso.nivel,
  );
  const e = caso.resultados;

  it("números principais", () => {
    for (const [k, v] of Object.entries(e.principais))
      perto(r.principais[k as keyof typeof r.principais], v);
  });

  it("de onde vem a emissão: ex-ante, ex-post, %, variação e materialidade", () => {
    e.categorias.forEach((c, i) => {
      const x = r.categorias[i]!;
      expect(x.categoria).toBe(c.categoria);
      perto(x.exAnte, c.exAnte);
      perto(x.exPost, c.exPost);
      perto(x.participacao, c.participacao);
      perto(x.variacao, c.variacao);
      expect(x.material).toBe(c.material === "SIM - material");
    });
  });

  it("prioritárias: as maiores até somar 80% (texto da aba)", () => {
    expect(r.categorias.filter((c) => c.prioritaria).map((c) => c.categoria)).toEqual([
      "2 Deslocamento",
      "5 Alimentação",
    ]);
  });

  it("por escopo e por gás", () => {
    [...r.escopos, ...r.gases].forEach((x, i) => {
      perto(x.valor, e.escoposEGases[i]![0]);
      perto(x.participacao, e.escoposEGases[i]![1]);
    });
  });

  it("qualidade do inventário", () => {
    const q = e.qualidade;
    expect(r.qualidade.linhas).toBe(q.linhas);
    expect(r.qualidade.pendentes).toBe(q.pendentes);
    perto(r.qualidade.primario, q.primario);
    expect(r.qualidade.minimoPrimario).toBe(q.minimoPrimario);
    expect(r.qualidade.situacaoPrimario).toBe(q.situacaoPrimario);
    perto(r.qualidade.notaMedia, q.notaMedia);
    perto(r.qualidade.estimadas, q.estimadas);
    expect(r.qualidade.fontes5).toBe(q.fontes5);
    expect(r.qualidade.situacaoFontes5).toBe(q.situacaoFontes5);
  });

  it("completude por categoria", () => {
    e.completude.forEach((c, i) => {
      expect(r.completude[i]).toEqual({
        categoria: c.categoria,
        linhas: c.linhas,
        alertas: c.alertas,
        semEvidencia: c.semEvidencia,
        situacao: c.situacao,
      });
    });
  });

  it("sem público informado, os indicadores por participante ficam vazios", () => {
    const x = calcularResultados(
      null,
      exPost,
      postEntradas,
      { participantes: null, participantesDia: null, dias: null, participantesDiaSoma: null },
      3,
    );
    expect(x.principais.porParticipante).toBeNull();
    expect(x.principais.porParticipanteDia).toBeNull();
    expect(x.principais.variacao).toBeNull();
  });
});

describe("5 - COMPARAÇÃO: paridade com o exemplo", () => {
  const desvios: Desvio[] = caso.comparacao.categorias.map((c) => ({
    categoria: c.categoria,
    origem: c.origem as Desvio["origem"],
    explicacao: c.explicacao,
  }));
  const r = calcularComparacao(exAnte, exPost, desvios);

  it("diferença por categoria e total", () => {
    caso.comparacao.categorias.forEach((c, i) => {
      const x = r.categorias[i]!;
      perto(x.exAnte, c.exAnte);
      perto(x.exPost, c.exPost);
      perto(x.diferenca, c.diferenca);
      perto(x.pct, c.pct);
      expect(x.origem).toBe(c.origem);
    });
    const [a, p, d, pct] = caso.comparacao.total;
    perto(r.total.exAnte, a);
    perto(r.total.exPost, p);
    perto(r.total.diferenca, d);
    perto(r.total.pct, pct);
    expect(r.semOrigem).toBe(0);
  });

  it("conta as diferenças sem origem classificada", () => {
    expect(calcularComparacao(exAnte, exPost, []).semOrigem).toBe(8);
  });
});

describe("6 - EMISSÕES RESIDUAIS", () => {
  it("paridade com o exemplo", () => {
    const e = caso.residuais;
    const r = calcularCompensacao(exPost.totais.total, {
      omissaoT: e.omissao,
      omissaoDescricao: null,
      aposentadaT: e.aposentada,
      comprovante: "certificado.pdf",
    });
    perto(r.brutas, e.brutas);
    perto(r.residuais, e.residuais);
    expect(r.aCompensar).toBe(e.aCompensar);
    expect(r.saldo).toBe(e.saldo);
    expect(r.completa).toBe(e.completa);
    expect(r.pendencias).toEqual([]);
  });

  it("arredonda para cima, saldo e pendências", () => {
    const vazio = { omissaoT: null, omissaoDescricao: null, aposentadaT: null, comprovante: null };
    expect(calcularCompensacao(0, vazio).completa).toBe("Preencha o inventário");
    expect(calcularCompensacao(12, vazio).aCompensar).toBe(12);
    const r = calcularCompensacao(12.01, { ...vazio, aposentadaT: 5, omissaoT: 1 });
    expect(r).toMatchObject({ aCompensar: 13, saldo: 8, completa: "AINDA NÃO" });
    expect(r.pendencias).toHaveLength(2);
  });
});

describe("OCORRÊNCIAS", () => {
  it("o exemplo valida e não tem ocorrência aberta", () => {
    for (const o of caso.ocorrencias.linhas) expect(() => ocorrenciaSchema.parse(o)).not.toThrow();
    const r = resumirOcorrencias(caso.ocorrencias.linhas as { situacao: "Resolvida" }[]);
    expect(r.registradas).toBe(caso.ocorrencias.registradas);
    expect(r.abertas).toBe(caso.ocorrencias.abertas);
    expect(r.alerta).toBeNull();
  });

  it("aberta ou em tratamento gera o alerta da aba", () => {
    const r = resumirOcorrencias([{ situacao: "Aberta" }, { situacao: "Em tratamento" }]);
    expect(r.abertas).toBe(2);
    expect(r.alerta).toMatch(/antes de fechar o inventário/);
  });
});
