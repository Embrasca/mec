import { describe, expect, it } from "vitest";
import { checklistDoNivel, situacaoDaFase, type Resposta } from "../checklist";
import { calcularReducao, medidaSchema } from "../reducao";
import { acaoSchema, montarLinhaDoTempo, prioridadeDoTema, situacaoDaAcao } from "../../gestao";
import nivel2 from "./fixtures/checklist-nivel2.json";
import nivel3 from "./fixtures/checklist-nivel3.json";
import reducao from "./fixtures/reducao-exemplo.json";
import inventario from "./fixtures/inventario-exemplo.json";

describe.each([
  ["Nível 3 (exemplo)", nivel3],
  ["Nível 2 (cópia de demonstração)", nivel2],
])("checklist igual à aba C: %s", (_n, caso) => {
  const respostas = new Map<string, { feito: Resposta; observacao: string | null }>();
  for (const [fase, f] of Object.entries(caso.fases))
    for (const [ordem, feito] of Object.entries(f.feitos))
      if (feito === "Sim" || feito === "Não")
        respostas.set(`${fase}|${ordem}`, { feito, observacao: null });
  const fases = checklistDoNivel(caso.nivel, respostas);

  it("mesmos itens em cada fase, na mesma ordem", () => {
    for (const f of fases)
      expect(f.itens.map((i) => i.ordem)).toEqual(caso.fases[f.codigo].visiveis);
  });

  it("mesmos itens marcados como NOVO", () => {
    for (const f of fases)
      expect(f.itens.filter((i) => i.novo).map((i) => i.ordem)).toEqual(caso.fases[f.codigo].novos);
  });

  it("mesmo progresso e situação por fase", () => {
    for (const f of fases) {
      expect(f.progresso).toBeCloseTo(caso.fases[f.codigo].progresso, 10);
      expect(situacaoDaFase(f)).toBe(caso.fases[f.codigo].situacao);
    }
  });
});

describe("checklist: regras", () => {
  it("sem nível confirmado, nenhuma lista aparece", () => {
    expect(checklistDoNivel(null, new Map()).every((f) => f.itens.length === 0)).toBe(true);
  });
  it("no Nível 1 nada é marcado como novo; no 4 aparecem todos os 170 itens", () => {
    expect(
      checklistDoNivel(1, new Map())
        .flatMap((f) => f.itens)
        .some((i) => i.novo),
    ).toBe(false);
    expect(checklistDoNivel(4, new Map()).flatMap((f) => f.itens)).toHaveLength(170);
  });
});

describe("plano de redução igual à aba REDUÇÃO (exemplo Nível 3)", () => {
  const medidas = reducao.medidas.map((m) =>
    medidaSchema.parse({
      categoria: m.categoria,
      acao: m.acao,
      objetivo: m.objetivo,
      metaPct: m.metaPct,
      responsavel: m.responsavel,
      prazo: m.prazo,
      resultado: m.resultado,
      evidencia: m.evidencia,
    }),
  );
  const r = calcularReducao(
    medidas,
    inventario.exAnte.totais.porCategoria,
    inventario.exPost.totais.porCategoria,
    reducao.nivel,
  );

  it("ex-ante, meta em tCO₂e, ex-post e diferença de cada medida", () => {
    reducao.medidas.forEach((m, i) => {
      const l = r.linhas[i]!;
      expect(l.exAnte).toBeCloseTo(m.esperado.exAnte, 7);
      if (m.esperado.metaT === null) expect(l.metaT).toBeNull();
      else expect(l.metaT).toBeCloseTo(m.esperado.metaT as number, 7);
      expect(l.exPost).toBeCloseTo(m.esperado.exPost, 7);
      expect(l.diferenca).toBeCloseTo(m.esperado.diferenca, 7);
    });
  });

  it("contagens, exigência e conferência do nível", () => {
    expect(r.registradas).toBe(reducao.esperado.registradas);
    expect(r.completas).toBe(reducao.esperado.completas);
    expect(r.exigencia).toBe(reducao.esperado.exigencia);
    expect(r.conferencia).toBe(reducao.esperado.conferencia);
  });

  it("nos Níveis 1 e 2 a exigência é ter três medidas com responsável e prazo", () => {
    const duas = medidas.slice(0, 2);
    expect(calcularReducao(duas, null, null, 2).conferencia).toBe(
      "Faltam medidas com responsável e prazo",
    );
    expect(calcularReducao(medidas.slice(0, 3), null, null, 2).conferencia).toBe(
      "OK: exigência do nível atendida",
    );
  });
});

describe("gestão: matriz, plano de ação e linha do tempo", () => {
  it("prioridade do tema pela soma de impacto e relevância", () => {
    expect([prioridadeDoTema(4, 4), prioridadeDoTema(3, 3), prioridadeDoTema(2, 3)]).toEqual([
      "alta",
      "media",
      "baixa",
    ]);
  });

  it("ação atrasada é calculada pelo prazo", () => {
    expect(situacaoDaAcao({ status: "pendente", prazo: "2026-09-01" }, "2026-09-02")).toBe(
      "atrasada",
    );
    expect(situacaoDaAcao({ status: "concluida", prazo: "2026-09-01" }, "2026-09-02")).toBe(
      "concluida",
    );
    expect(situacaoDaAcao({ status: "em_andamento", prazo: null }, "2026-09-02")).toBe(
      "em_andamento",
    );
  });

  it("ação concluída precisa de 100% de progresso", () => {
    const base = {
      acao: "x",
      descricao: null,
      temaId: null,
      medidaId: null,
      responsavel: null,
      prazo: null,
      prioridade: "media" as const,
      evidenciaEsperada: null,
    };
    expect(acaoSchema.safeParse({ ...base, status: "concluida", progresso: 80 }).success).toBe(
      false,
    );
    expect(acaoSchema.safeParse({ ...base, status: "concluida", progresso: 100 }).success).toBe(
      true,
    );
  });

  it("linha do tempo separa os marcos nas três fases pelo período do evento", () => {
    const t = montarLinhaDoTempo({ inicio: "2026-09-15", fim: "2026-09-17" }, [
      {
        data: "2026-08-20",
        titulo: "Trocar cardápio",
        origem: "Plano de redução",
        situacao: null,
        atrasado: false,
      },
      {
        data: "2026-09-16",
        titulo: "Ler medidor",
        origem: "Plano de ação",
        situacao: null,
        atrasado: false,
      },
      {
        data: "2026-09-22",
        titulo: "Locadora",
        origem: "Fornecedor",
        situacao: null,
        atrasado: false,
      },
    ]);
    expect(t["Pré-evento"].map((m) => m.titulo)).toEqual(["Trocar cardápio"]);
    expect(t.Execução.map((m) => m.titulo)).toEqual([
      "Abertura do evento",
      "Ler medidor",
      "Encerramento do evento",
    ]);
    expect(t["Pós-evento"].map((m) => m.titulo)).toEqual(["Locadora"]);
  });
});
