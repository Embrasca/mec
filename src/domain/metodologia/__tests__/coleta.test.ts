import { describe, expect, it } from "vitest";
import { calcularColeta, coletaSchema, coletaVazia } from "../coleta";
import { BASE_V3_16 } from "../inventario";
import caso from "./fixtures/coleta-exemplo.json";

const { esperado, ...entrada } = caso;
const dados = coletaSchema.parse(entrada);
const r = calcularColeta(dados);

const vazio = (v: unknown) => v === null || v === undefined || v === "";
const igual = (a: unknown, b: unknown) => {
  if (vazio(b)) return expect(vazio(a)).toBe(true);
  if (typeof b === "number") return expect(a as number).toBeCloseTo(b, 9);
  expect(a).toBe(b);
};

describe("paridade com a aba COLETA (exemplo Nível 3)", () => {
  it("quadro 1: consumo medido e atribuído ao evento", () => {
    igual(r.q1.medido, esperado.q1.medido);
    igual(r.q1.atribuido, esperado.q1.atribuido);
  });

  it("quadro 2: origem do dado, quantidade considerada e alerta", () => {
    esperado.q2.forEach((e, i) => {
      igual(r.q2[i]!.origem, e.origem);
      igual(r.q2[i]!.considerada, e.considerada);
      igual(r.q2[i]!.alerta, e.alerta);
    });
  });

  it("quadros 3, 4 e 6", () => {
    esperado.q3.forEach((e, i) => {
      igual(r.q3[i]!.consideradas, e.consideradas);
      igual(r.q3[i]!.origem, e.origem);
    });
    esperado.q4.forEach((e, i) => {
      igual(r.q4[i]!.considerados, e.considerados);
      igual(r.q4[i]!.forma, e.forma);
    });
    esperado.q6.forEach((e, i) => igual(r.q6[i], e));
  });

  it("quadro 7: faixa do voo, passageiro.km e litros de carro", () => {
    esperado.q7.forEach((e, i) => {
      const v = r.q7[i]!;
      igual(v.faixa, e.faixa);
      igual(v.aviao, e.aviao);
      igual(v.onibus, e.onibus);
      igual(v.carro, e.carro);
      igual(v.conferencia, e.conferencia);
    });
  });

  it("quadro 8: transporte no destino", () => {
    esperado.q8transporte.forEach((e, i) => {
      igual(r.q8[i]!.passageiroKm, e.passageiroKm);
      igual(r.q8[i]!.litros, e.litros);
    });
  });

  it("resumo para lançar no inventário: mesmos itens, na mesma ordem e quantidade", () => {
    const planilha = Object.entries(esperado.resumo);
    expect(r.resumo.map((x) => x.item)).toEqual(planilha.map(([item]) => item));
    planilha.forEach(([, q], i) => igual(r.resumo[i]!.quantidade, q));
  });

  it("todo item do resumo existe na base de fatores", () => {
    const nomes = new Set(BASE_V3_16.itens.map((i) => i.item));
    for (const x of r.resumo) expect(nomes.has(x.item)).toBe(true);
  });
});

describe("regras da coleta", () => {
  it("leituras sem parcela contam zero e geram pendência", () => {
    const c = coletaVazia();
    c.q1.leituras = [
      { data: null, momento: null, leitura: 100, documento: null },
      { data: null, momento: null, leitura: 160, documento: null },
    ];
    const x = calcularColeta(c);
    expect(x.q1.medido).toBe(60);
    expect(x.q1.atribuido).toBe(0);
    expect(x.pendencias[0]).toMatch(/parcela/);
  });

  it("gerador sem litros usa horas × consumo da ficha e pede a fonte", () => {
    const c = coletaVazia();
    c.q2 = [
      {
        identificacao: "G1",
        funcao: "Principal",
        kva: 60,
        combustivel: "Diesel (litros)",
        abastecido: null,
        horas: 10,
        consumoHora: 12,
        premissa: null,
      },
    ];
    const x = calcularColeta(c);
    expect(x.q2[0]).toEqual({
      origem: "Ficha técnica",
      considerada: 120,
      alerta: "Escreva a fonte da ficha técnica",
    });
  });

  it("refrigerante só entra se houve recarga", () => {
    const c = coletaVazia();
    c.q5 = {
      houveRecarga: "Não",
      linhas: [
        {
          fluido: "Gás refrigerante R-410A (kg reposto)",
          quilos: 2,
          equipamento: null,
          ordemServico: null,
        },
      ],
    };
    expect(calcularColeta(c).resumo.find((x) => x.item.includes("R-410A"))!.quantidade).toBe(0);
    c.q5.houveRecarga = "Sim";
    expect(calcularColeta(c).resumo.find((x) => x.item.includes("R-410A"))!.quantidade).toBe(2);
  });

  it("recusa opção que não existe", () => {
    const c = coletaVazia();
    expect(() =>
      coletaSchema.parse({
        ...c,
        q6: [
          {
            material: "Ouro",
            quilos: 1,
            condicao: "Novo",
            origem: null,
            destinacao: null,
            comprovante: null,
          },
        ],
      }),
    ).toThrow();
  });
});
