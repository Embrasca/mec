import { describe, expect, it } from "vitest";
import { caracterizacaoVazia, type Caracterizacao } from "../caracterizacao";
import { calcularEnquadramento, requisitosDoNivel } from "../nivel";
import { CRITERIO_LOGISTICA, V3_16, type Nivel } from "../v3_16";
import exemplo from "./fixtures/exemplo-nivel3.json";
import demonstracao from "./fixtures/copia-demonstracao.json";

type Fixture = typeof exemplo;

/** Converte as entradas extraídas da planilha para a ficha do sistema. */
function daPlanilha(f: Fixture) {
  const e = f.entradas;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const txt = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const ficha: Caracterizacao = {
    ...caracterizacaoVazia(),
    anoInventario: num(e.ano),
    responsavelGestaoClimatica: txt(e.responsavel),
    formato: txt(e.formato),
    participantesDia: num(e.participantesDia),
    participantesTotal: num(e.participantesTotal),
    percentualAereo: num(e.percentualAereo),
    diariasHospedagem: num(e.diariasHospedagem),
    fornecedores: num(e.fornecedores),
    areaEstruturaM2: num(e.areaEstruturaM2),
    potenciaGeradoresKva: num(e.potenciaGeradoresKva),
    numeroGeradores: num(e.numeroGeradores),
    locaisSimultaneos: num(e.locaisSimultaneos),
    transporteAquaviario: txt(e.transporteAquaviario),
    itinerante: txt(e.itinerante),
    porcoesAlimentacao: num(e.porcoesAlimentacao),
    residuosKg: num(e.residuosKg),
    alegacao: txt(e.alegacao),
    pctOnibus: num(e.pctOnibus),
    pctCarro: num(e.pctCarro),
    pctTrem: num(e.pctTrem),
    pctLocal: num(e.pctLocal),
    pctOutros: num(e.pctOutros),
    participantesDiaSoma: num(e.participantesDiaSoma),
    acessosCredenciamento: num(e.acessosCredenciamento),
    internacionaisPresenciais: num(e.internacionaisPresenciais),
    internacionaisOnline: num(e.internacionaisOnline),
    vooInternacional: num(e.vooInternacional),
    logistica: txt(e.logistica),
    complexidade: e.complexidade.map((v) => txt(v)),
    elevacaoTecnica: num(e.elevacaoTecnica) as Nivel | null,
    justificativaElevacao: txt(e.justificativaElevacao),
  };
  return { ficha, periodo: { dataInicio: e.dataInicio, dataFim: e.dataFim } };
}

describe.each([
  ["exemplo preenchido (Nível 3)", exemplo],
  ["cópia de demonstração", demonstracao as unknown as Fixture],
])("paridade com a planilha: %s", (_nome, fixture) => {
  const { ficha, periodo } = daPlanilha(fixture);
  const r = calcularEnquadramento(ficha, periodo);
  const x = fixture.esperado;
  const simNao = (b: boolean) => (b ? "SIM" : "não");

  it("dias, participação internacional e divisão modal", () => {
    expect(r.dias).toBe(x.dias);
    expect(r.haInternacionaisPresenciais ? "Sim" : "Não").toBe(x.haInternacionais);
    expect(r.totalModal).toBe(x.totalModal);
    expect(r.conferenciaModal).toBe(x.conferenciaModal);
  });

  it("etapas 1, 2 e 3", () => {
    expect(r.etapa1).toBe(x.etapa1);
    expect(r.pontos).toEqual(x.pontos);
    expect(r.totalPontos).toBe(x.totalPontos);
    expect(r.etapa2).toBe(x.etapa2);
    expect(r.gatilhos.map((g) => simNao(g.acionado))).toEqual(x.gatilhos);
    expect(r.gatilhosAcionados).toBe(x.gatilhosAcionados);
    expect(r.etapa3).toBe(x.etapa3);
  });

  it("resultado do enquadramento", () => {
    expect(r.conferenciaElevacao).toBe(x.conferenciaElevacao);
    expect(r.definiu.map((d) => (d ? "SIM" : null))).toEqual(x.definiu);
    expect(r.nivelFinal).toBe(x.nivelFinal);
    expect(r.designacao).toBe(x.designacao);
    expect(r.determinante).toBe(x.determinante);
    expect(r.oQueMudaria.map((m) => (m.jaE ? "já é" : "ainda não"))).toEqual(x.jaE);
  });

  it("requisitos da aba B para o nível", () => {
    expect(requisitosDoNivel(r.nivelFinal).map((q) => q.exigencia)).toEqual(x.requisitosDoNivel);
  });
});

describe("regras de fronteira", () => {
  const periodo = { dataInicio: "2026-01-10", dataFim: "2026-01-10" };
  const base = (over: Partial<Caracterizacao>): Caracterizacao => ({
    ...caracterizacaoVazia(),
    ...over,
  });

  it.each([
    [80, 1],
    [81, 2],
    [250, 2],
    [251, 3],
    [1000, 3],
    [1001, 4],
  ])("etapa 1: %i participantes por dia => nível %i", (pd, nivel) => {
    expect(calcularEnquadramento(base({ participantesDia: pd }), periodo).etapa1).toBe(nivel);
  });

  it("sem participantes por dia o nível fica vazio", () => {
    const r = calcularEnquadramento(base({ diariasHospedagem: 900 }), periodo);
    expect(r.nivelFinal).toBeNull();
    expect(r.pendencias).toContain("Informe os participantes previstos por dia.");
  });

  it.each([
    [6, 1],
    [7, 2],
    [13, 2],
    [14, 3],
    [21, 3],
    [22, 4],
  ])("etapa 2: %i pontos => nível %i", (total, nivel) => {
    // Distribui os pontos pelos critérios escolhíveis (o de logística fica em 0: Municipal).
    let resto = total;
    const complexidade = V3_16.criteriosComplexidade.map((c, i) => {
      if (i === CRITERIO_LOGISTICA) return null;
      const p = Math.min(3, resto);
      resto -= p;
      return c.opcoes[p]!;
    });
    const r = calcularEnquadramento(base({ participantesDia: 10, complexidade }), periodo);
    expect(r.totalPontos).toBe(total);
    expect(r.etapa2).toBe(nivel);
  });

  it("a logística da etapa 2 vem do campo de logística, não da escolha", () => {
    const complexidade: (string | null)[] = V3_16.criteriosComplexidade.map(() => null);
    complexidade[CRITERIO_LOGISTICA] = "Internacional";
    const r = calcularEnquadramento(base({ participantesDia: 10, complexidade }), periodo);
    expect(r.pontos[CRITERIO_LOGISTICA]).toBe(0);
    expect(r.opcaoLogistica).toBe("Municipal");
  });

  it("um gatilho eleva a 3; três gatilhos elevam a 4", () => {
    const um = calcularEnquadramento(base({ participantesDia: 50, percentualAereo: 21 }), periodo);
    expect(um.etapa3).toBe(3);
    expect(um.nivelFinal).toBe(3);
    expect(um.determinante).toBe("Gatilho automático");
    const tres = calcularEnquadramento(
      base({
        participantesDia: 50,
        percentualAereo: 21,
        diariasHospedagem: 501,
        itinerante: "Sim",
      }),
      periodo,
    );
    expect(tres.gatilhosAcionados).toBe(3);
    expect(tres.nivelFinal).toBe(4);
  });

  it("limites dos gatilhos são estritos (mais de 10, mais de 20%, mais de 500…)", () => {
    const r = calcularEnquadramento(
      base({
        participantesDia: 50,
        internacionaisPresenciais: 10,
        percentualAereo: 20,
        vooInternacional: 10,
        locaisSimultaneos: 2,
        potenciaGeradoresKva: 50,
        numeroGeradores: 1,
        diariasHospedagem: 500,
        areaEstruturaM2: 1000,
      }),
      periodo,
    );
    expect(r.gatilhosAcionados).toBe(0);
  });

  it("cinco dias aciona o gatilho de duração", () => {
    const r = calcularEnquadramento(base({ participantesDia: 50 }), {
      dataInicio: "2026-03-01",
      dataFim: "2026-03-05",
    });
    expect(r.dias).toBe(5);
    expect(r.gatilhos[5]!.acionado).toBe(true);
  });

  it("elevação técnica sem justificativa fica pendente", () => {
    const r = calcularEnquadramento(base({ participantesDia: 50, elevacaoTecnica: 3 }), periodo);
    expect(r.conferenciaElevacao).toBe("FALTA A JUSTIFICATIVA");
    expect(r.pendencias).toContain("A elevação técnica exige justificativa.");
    // Como na planilha, o número entra no máximo; quem bloqueia é a confirmação.
    expect(r.nivelFinal).toBe(3);
    expect(r.determinante).toBe("Elevação técnica");
  });

  it("elevação abaixo do nível calculado não muda nada", () => {
    const r = calcularEnquadramento(base({ participantesDia: 600, elevacaoTecnica: 2 }), periodo);
    expect(r.conferenciaElevacao).toBe("SEM ELEVAÇÃO");
    expect(r.nivelFinal).toBe(3);
  });

  it("aponta opção de complexidade abaixo do que os dados indicam", () => {
    const complexidade = V3_16.criteriosComplexidade.map((c) => c.opcoes[0]!);
    const r = calcularEnquadramento(
      base({ participantesDia: 50, diariasHospedagem: 420, complexidade }),
      { dataInicio: "2026-03-01", dataFim: "2026-03-03" },
    );
    const criterios = r.divergencias.map((d) => d.criterio);
    expect(criterios).toContain("Duração");
    expect(criterios).toContain("Hospedagem");
    expect(r.divergencias.find((d) => d.criterio === "Hospedagem")!.indicadaPelosDados).toBe(
      "De 101 a 500 diárias",
    );
  });
});
