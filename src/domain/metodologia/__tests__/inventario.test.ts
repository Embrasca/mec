import { describe, expect, it } from "vitest";
import {
  BASE_V3_16,
  calcularInventario,
  fatorDoSin,
  itensDoFornecedor,
  orientacaoExAnte,
  type LinhaDeInventario,
} from "../inventario";
import caso from "./fixtures/inventario-exemplo.json";

const perto = (a: number | null, b: unknown) => {
  if (b === null || b === undefined || b === "") return expect(a).toBeNull();
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - (b as number))).toBeLessThan(
    1e-9 * Math.max(1, Math.abs(b as number)),
  );
};

type Etapa = typeof caso.exAnte;

function entradas(etapa: Etapa): LinhaDeInventario[] {
  return etapa.linhas.map((l) => ({
    fornecedor: l.fornecedor ?? null,
    item: l.item,
    descricao: l.descricao ?? null,
    quantidade: typeof l.quantidade === "number" ? l.quantidade : null,
    premissa: (l.premissa as string | null) ?? null,
  }));
}

describe.each([
  ["ex-ante", caso.exAnte],
  ["ex-post", caso.exPost as unknown as Etapa],
])("paridade com a planilha (exemplo Nível 3): %s", (_nome, etapa) => {
  const r = calcularInventario(entradas(etapa), BASE_V3_16, caso.ano, caso.nivel);

  it("cada linha: unidade, categoria, escopo e emissões por gás", () => {
    etapa.linhas.forEach((l, i) => {
      const c = r.linhas[i]!;
      expect(c.unidade).toBe(l.esperado.unidade);
      expect(c.categoria).toBe(l.esperado.categoria);
      expect(String(c.escopo)).toBe(String(l.esperado.escopo));
      perto(c.tco2eCo2, l.esperado.tco2eCo2);
      perto(c.tco2eCh4, l.esperado.tco2eCh4);
      perto(c.tco2eN2o, l.esperado.tco2eN2o);
      perto(c.total, l.esperado.total);
      perto(c.biogenico, l.esperado.biogenico);
    });
  });

  it("totais do evento, por categoria e por escopo", () => {
    const t = etapa.totais;
    perto(r.totais.co2, t.co2);
    perto(r.totais.ch4, t.ch4);
    perto(r.totais.n2o, t.n2o);
    perto(r.totais.total, t.total);
    perto(r.totais.biogenico, t.biogenico);
    for (const { categoria, total } of r.porCategoria)
      perto(total, (t.porCategoria as Record<string, number>)[categoria]);
    r.porEscopo.forEach((v, i) => perto(v, t.porEscopo[i]));
  });
});

describe("ex-ante: alertas e orientação", () => {
  const r = calcularInventario(entradas(caso.exAnte), BASE_V3_16, caso.ano, caso.nivel);

  it("todas as linhas do exemplo estão OK, como na planilha", () => {
    caso.exAnte.linhas.forEach((l) => expect(l.esperado.alerta).toBe("OK"));
    expect(r.linhas.every((l) => l.alerta === "OK")).toBe(true);
    expect(r.pendencias).toBe(0);
  });

  it("orientação do nível igual à da planilha (sem a referência às colunas)", () => {
    expect(caso.exAnte.mensagemNivel).toContain("separe a estimativa por categoria");
    expect(orientacaoExAnte(3)).toContain("separe a estimativa por categoria");
    expect(orientacaoExAnte(2)).toContain("estimativas com premissa escrita bastam");
  });

  it("falta de quantidade, de premissa e item desconhecido", () => {
    const base = { fornecedor: null, descricao: null };
    const x = calcularInventario(
      [
        { ...base, item: "Diesel em gerador (litro)", quantidade: null, premissa: "x" },
        { ...base, item: "Diesel em gerador (litro)", quantidade: 10, premissa: " " },
        { ...base, item: "Item que não existe", quantidade: 10, premissa: "x" },
        { ...base, item: null, quantidade: 10, premissa: null },
      ],
      BASE_V3_16,
      2026,
      2,
    );
    expect(x.linhas.map((l) => l.tipoAlerta)).toEqual(["quantidade", "premissa", "item", null]);
    expect(x.linhas[0]!.total).toBeNull();
    expect(x.pendencias).toBe(3);
  });

  it("fator zerado: limitação até o Nível 2; obrigatório a partir do 3; solar não alerta", () => {
    const zerado = {
      ...BASE_V3_16,
      itens: BASE_V3_16.itens.map((i) =>
        i.item === "Tecido (kg)" ? { ...i, feCo2: 0, feCh4: 0, feN2o: 0 } : i,
      ),
    };
    const linha = (item: string) => ({
      fornecedor: null,
      descricao: null,
      item,
      quantidade: 5,
      premissa: "p",
    });
    expect(calcularInventario([linha("Tecido (kg)")], zerado, 2026, 2).linhas[0]!.tipoAlerta).toBe(
      "sem_fator",
    );
    expect(calcularInventario([linha("Tecido (kg)")], zerado, 2026, 3).linhas[0]!.tipoAlerta).toBe(
      "fator_obrigatorio",
    );
    expect(
      calcularInventario([linha("Energia solar gerada no local (kWh)")], zerado, 2026, 4).linhas[0]!
        .tipoAlerta,
    ).toBe("ok");
  });
});

describe("base de fatores", () => {
  it("fator do SIN: ano publicado ou o último disponível, com aviso", () => {
    expect(fatorDoSin(BASE_V3_16, 2024)).toMatchObject({ anoUsado: 2024, aviso: null });
    const r = fatorDoSin(BASE_V3_16, 2026);
    expect(r.anoUsado).toBe(2025);
    expect(r.valor).toBeCloseTo(0.0460833, 10);
    expect(r.aviso).toMatch(/2026/);
  });

  it("os itens são únicos pelo nome (o código E04 se repete na planilha)", () => {
    const nomes = BASE_V3_16.itens.map((i) => i.item);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(BASE_V3_16.itens.filter((i) => i.codigo === "E04")).toHaveLength(2);
  });

  it("lista de itens por fornecedor", () => {
    expect(itensDoFornecedor("Locadora de gerador")).toEqual(["Diesel em gerador (litro)"]);
    const nomes = new Set(BASE_V3_16.itens.map((i) => i.item));
    for (const item of itensDoFornecedor(null)) expect(nomes.has(item)).toBe(true);
  });
});
