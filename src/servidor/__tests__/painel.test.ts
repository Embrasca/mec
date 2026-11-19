import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarDriver } from "../db.server";
import { criarEvento } from "../servicos/eventos.server";
import { fecharInventario, salvarInventario } from "../servicos/inventario.server";
import { salvarItem } from "../servicos/esg.server";
import { equipeVazia } from "@/domain/esg/esquemas";
import { obterPainel, removerMeta, salvarMeta } from "../servicos/painel.server";
import { salvarAcao } from "../servicos/gestao.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let admin: { id: string; email: string };
let gestora: { id: string; email: string };
let outra: { id: string; email: string };
let eventoA: string;
let eventoB: string;

const base = {
  instituicao: "Instituto",
  cidade: "Goiânia",
  uf: "GO" as const,
  cor: "#1e6f5c",
  descricao: null,
};

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  admin = await banco.conta("Admin", { admin: true });
  gestora = await banco.conta("Gestora");
  outra = await banco.conta("Outra");
  ({ id: eventoA } = await criarEvento(admin.id, {
    ...base,
    nome: "Evento A",
    dataInicio: "2026-03-10",
    dataFim: "2026-03-11",
    gestorId: gestora.id,
  }));
  ({ id: eventoB } = await criarEvento(admin.id, {
    ...base,
    nome: "Evento B",
    dataInicio: "2026-12-01",
    dataFim: "2026-12-02",
    gestorId: outra.id,
  }));
  const linha = {
    fornecedor: null,
    item: "Refeição com carne bovina (porção)",
    descricao: null,
    premissa: "x",
  };
  await salvarInventario(gestora.id, {
    eventoId: eventoA,
    etapa: "ex_ante",
    versao: 0,
    linhas: [{ ...linha, quantidade: 1000 }],
  });
  await fecharInventario(gestora.id, eventoA, "ex_ante", 1);
  await salvarInventario(gestora.id, {
    eventoId: eventoA,
    etapa: "ex_post",
    versao: 0,
    linhas: [{ ...linha, quantidade: 800, qualidade: 5, evidencia: "nf" }],
  });
  await salvarItem(gestora.id, {
    eventoId: eventoA,
    lista: "equipe",
    id: null,
    dados: { ...equipeVazia(), nome: "Produção", pessoas: 10, pessoasLocais: 6 },
  });
  await salvarAcao(gestora.id, {
    eventoId: eventoA,
    id: null,
    dados: {
      acao: "Contratar buffet",
      descricao: null,
      temaId: null,
      medidaId: null,
      responsavel: null,
      prazo: "2026-02-01",
      status: "pendente",
      prioridade: "alta",
      evidenciaEsperada: null,
      progresso: 0,
    },
  });
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("painel gerencial", () => {
  it("cada pessoa vê só os eventos a que tem acesso", async () => {
    const g = await obterPainel(gestora.id, "2026-11-19");
    expect(g.eventos.map((e) => e.nome)).toEqual(["Evento A"]);
    const a = await obterPainel(admin.id, "2026-11-19");
    expect(a.eventos.map((e) => e.nome).sort()).toEqual(["Evento A", "Evento B"]);
  });

  it("resumo: emissões do ex-post aberto, variação, ESG e pendências de gestão", async () => {
    const [e] = (await obterPainel(gestora.id, "2026-11-19")).eventos;
    expect(e!.fase).toBe("Pós-evento");
    expect(e!.emissoes).toMatchObject({ fonte: "ex_post", fechado: false });
    expect(e!.variacao).toBeCloseTo(-0.2, 10);
    expect(e!.primario).toBe(1);
    expect(e!.esg.maoDeObraLocal).toBeCloseTo(0.6, 10);
    expect(e!.pendencias).toMatchObject({ acoesAtrasadas: 1, inventarioAberto: true });
  });

  it("metas: só a administração define; a avaliação usa os eventos do ano", async () => {
    const meta = { ano: 2026, indicador: "mao_de_obra_local", alvo: 0.5, observacao: null };
    await expect(salvarMeta(gestora.id, { id: null, dados: meta })).rejects.toThrow(
      /administração/,
    );
    const { id } = await salvarMeta(admin.id, { id: null, dados: meta });
    await expect(salvarMeta(admin.id, { id: null, dados: meta })).rejects.toThrow();
    const p = await obterPainel(gestora.id, "2026-11-19");
    expect(p.metas).toHaveLength(1);
    expect(p.avaliacao[0]).toMatchObject({ atingem: 1, comDado: 1, total: 1 });
    await expect(removerMeta(gestora.id, id)).rejects.toThrow(/administração/);
    await removerMeta(admin.id, id);
  });
});
