import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { gerarXlsx } from "@/lib/xlsx";
import { BASE_V3_16, calcularInventario, type LinhaDeInventario } from "../inventario";
import { calcularCompensacao, calcularResultados } from "../posEvento";
import { avisoDaAlegacao, FRASES, fraseAutorizada, memoriaDeCalculo } from "../relatorio";
import inv from "./fixtures/inventario-exemplo.json";
import caso from "./fixtures/pos-evento-exemplo.json";

const linhas: LinhaDeInventario[] = inv.exPost.linhas.map((l) => ({
  fornecedor: l.fornecedor ?? null,
  item: l.item,
  descricao: l.descricao ?? null,
  quantidade: l.quantidade as number,
  premissa: (l.premissa as string | null) ?? null,
  qualidade: typeof l.qualidade === "string" ? Number(l.qualidade.slice(0, 1)) : null,
  evidencia: (l.evidencia as string | null) ?? null,
}));
const exPost = calcularInventario(linhas, BASE_V3_16, inv.ano, inv.nivel, "ex_post");

describe("7 - RELATÓRIO", () => {
  const res = calcularResultados(
    null,
    exPost,
    linhas,
    {
      participantes: caso.participantes,
      participantesDia: caso.participantesDia,
      dias: caso.dias,
      participantesDiaSoma: caso.participantesDiaSoma,
    },
    caso.nivel,
  );
  const comp = calcularCompensacao(exPost.totais.total, {
    omissaoT: 0,
    omissaoDescricao: null,
    aposentadaT: caso.residuais.aposentada,
    comprovante: "x",
  });

  it("frase igual à da planilha no exemplo", () => {
    expect(
      fraseAutorizada({
        totalExPost: exPost.totais.total,
        aCompensar: comp.aCompensar,
        aposentada: caso.residuais.aposentada,
        situacaoPrimario: res.qualidade.situacaoPrimario,
      }),
    ).toBe(caso.relatorio.frase);
  });

  it("números do resumo iguais aos da aba", () => {
    const v = caso.relatorio.valores as unknown as Record<string, number>;
    const perto = (a: number | null, b: number | undefined) =>
      expect(Math.abs((a ?? NaN) - (b ?? NaN))).toBeLessThan(1e-6);
    perto(res.principais.total, v["EMISSÕES BRUTAS DO EVENTO (tCO₂e)"]);
    perto(res.escopos[0]!.valor, v["Escopo 1 (tCO₂e)"]);
    perto(res.principais.porParticipanteDia, v["Emissões por participante-dia (kgCO₂e)"]);
    perto(res.qualidade.primario, v["Emissões com dado primário"]);
    perto(comp.saldo, v["Saldo não compensado (tCO₂e)"]);
  });

  it("todos os ramos da fórmula; carbono neutro nunca é liberado (E41 é texto fixo)", () => {
    const f = (aCompensar: number, aposentada: number, total = 10) =>
      fraseAutorizada({ totalExPost: total, aCompensar, aposentada, situacaoPrimario: "OK" });
    expect(f(10, 0, 0)).toBe(FRASES.vazio);
    expect(f(10, 10)).toBe(FRASES.compensadas);
    expect(f(10, 4)).toBe(FRASES.parcial);
    expect(f(10, 0)).toBe(FRASES.quantificadas);
  });

  it("avisa quando a alegação pretendida vai além da frase", () => {
    expect(avisoDaAlegacao("Evento carbono neutro", FRASES.compensadas)).toMatch(/vai além/);
    expect(avisoDaAlegacao("Emissões residuais compensadas", FRASES.parcial)).toMatch(/vai além/);
    expect(avisoDaAlegacao("Emissões quantificadas", FRASES.compensadas)).toBeNull();
    expect(avisoDaAlegacao(null, FRASES.compensadas)).toBeNull();
  });
});

describe("memória de cálculo", () => {
  const m = memoriaDeCalculo(linhas, exPost, BASE_V3_16, inv.ano);
  it("uma linha por item, com a conta e a fonte do fator", () => {
    expect(m).toHaveLength(inv.exPost.linhas.length);
    m.forEach((x, i) =>
      expect(x.total).toBeCloseTo(inv.exPost.linhas[i]!.esperado.total as number, 6),
    );
    const energia = m.find((x) => x.item === "Energia elétrica da rede (kWh)")!;
    expect(energia.formula).toBe(
      "CO₂: 8200 × 0.0460833 ÷ 1000 + CH₄: 8200 × 0 × 28 ÷ 1000 + N₂O: 8200 × 0 × 265 ÷ 1000",
    );
    expect(energia.fonteDoFator).toMatch(/SIN de 2025/);
    expect(energia.qualidade).toBe("5 - Medição própria");
  });
});

describe("XLSX", () => {
  it("gera um pacote válido, com texto escapado e conteúdo sempre como texto", () => {
    const bytes = gerarXlsx([
      {
        nome: "Resumo: teste/1",
        linhas: [
          ["Campo", "Valor"],
          ["A & B <c>", 1.5],
          ["=1+1", null],
        ],
      },
      { nome: "Resumo: teste/1", linhas: [["x"]] },
    ]);
    const z = unzipSync(bytes);
    expect(Object.keys(z)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    const wb = strFromU8(z["xl/workbook.xml"]!);
    expect(wb).toContain('name="Resumo  teste 1"');
    expect(wb).toContain('name="Resumo  teste 1 2"');
    const s1 = strFromU8(z["xl/worksheets/sheet1.xml"]!);
    expect(s1).toContain("A &amp; B &lt;c&gt;");
    expect(s1).toContain('<c r="B2"><v>1.5</v></c>');
    expect(s1).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(s1).not.toContain("<f>");
  });
});
