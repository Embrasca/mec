import { describe, expect, it } from "vitest";
import {
  avaliarMeta,
  avaliarPortfolio,
  consolidar,
  metaSchema,
  type ResumoDoEvento,
} from "../painel";

const evento = (r: Partial<ResumoDoEvento> & { id: string }): ResumoDoEvento => ({
  nome: r.id,
  cor: "#1e6f5c",
  nivel: 2,
  fase: "Pós-evento",
  dataInicio: "2026-05-10",
  dataFim: "2026-05-12",
  emissoes: { fonte: "ex_post", fechado: true, total: 10, porParticipanteDia: 20 },
  variacao: -0.1,
  primario: 0.6,
  compensacaoCompleta: false,
  relatorioFinal: false,
  esg: { essenciaisPendentes: [], maoDeObraLocal: 0.7, gastoLocal: 0.4, satisfacao: 4.2 },
  pendencias: {
    acoesAtrasadas: 0,
    ocorrenciasAbertas: 0,
    fornecedoresAtrasados: 0,
    inventarioAberto: false,
  },
  ...r,
});

describe("metas do portfólio", () => {
  it("meta de máximo e de mínimo", () => {
    const e = evento({ id: "a" });
    expect(avaliarMeta({ indicador: "intensidade", alvo: 25 }, e)).toEqual({
      valor: 20,
      resultado: "atinge",
    });
    expect(avaliarMeta({ indicador: "intensidade", alvo: 15 }, e).resultado).toBe("nao_atinge");
    expect(avaliarMeta({ indicador: "primario", alvo: 0.5 }, e).resultado).toBe("atinge");
    expect(avaliarMeta({ indicador: "gasto_local", alvo: 0.5 }, e).resultado).toBe("nao_atinge");
  });

  it("intensidade e qualidade só valem com o ex-post; sem ele, sem dado", () => {
    const e = evento({
      id: "b",
      emissoes: { fonte: "ex_ante", fechado: true, total: 10, porParticipanteDia: 5 },
    });
    expect(avaliarMeta({ indicador: "intensidade", alvo: 25 }, e).resultado).toBe("sem_dado");
    expect(avaliarMeta({ indicador: "primario", alvo: 0.1 }, e).resultado).toBe("sem_dado");
  });

  it("portfólio: só os eventos que começam no ano da meta", () => {
    const eventos = [
      evento({ id: "a" }),
      evento({
        id: "b",
        esg: { essenciaisPendentes: [], maoDeObraLocal: 0.3, gastoLocal: null, satisfacao: null },
      }),
      evento({ id: "c", dataInicio: "2025-12-01" }),
    ];
    const [r] = avaliarPortfolio(
      [{ ano: 2026, indicador: "mao_de_obra_local", alvo: 0.5, observacao: null }],
      eventos,
    );
    expect(r).toMatchObject({ atingem: 1, comDado: 2, total: 2 });
  });

  it("validação do alvo pela unidade do indicador", () => {
    const m = (indicador: string, alvo: number) =>
      metaSchema.safeParse({ ano: 2026, indicador, alvo, observacao: null }).success;
    expect(m("primario", 0.5)).toBe(true);
    expect(m("primario", 50)).toBe(false);
    expect(m("satisfacao", 6)).toBe(false);
    expect(m("variacao", -0.1)).toBe(true);
    expect(m("inexistente", 1)).toBe(false);
  });
});

describe("consolidação", () => {
  it("soma só as emissões oficiais e conta as pendências", () => {
    const c = consolidar([
      evento({ id: "a", relatorioFinal: true, compensacaoCompleta: true }),
      evento({
        id: "b",
        emissoes: { fonte: "ex_ante", fechado: false, total: 99, porParticipanteDia: null },
        fase: "Pré-evento",
      }),
      evento({
        id: "c",
        pendencias: {
          acoesAtrasadas: 2,
          ocorrenciasAbertas: 1,
          fornecedoresAtrasados: 0,
          inventarioAberto: true,
        },
        esg: {
          essenciaisPendentes: ["ML1"],
          maoDeObraLocal: null,
          gastoLocal: null,
          satisfacao: null,
        },
      }),
    ]);
    expect(c.emissoesOficiais).toBe(20);
    expect(c.eventosComInventarioOficial).toBe(2);
    expect(c.porFase["Pré-evento"]).toBe(1);
    expect(c.pendencias).toMatchObject({
      acoesAtrasadas: 2,
      ocorrenciasAbertas: 1,
      inventariosAbertos: 1,
      esgPendente: 1,
    });
    expect(c.relatoriosFinais).toBe(1);
  });
});
