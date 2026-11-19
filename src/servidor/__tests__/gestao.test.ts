import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caracterizacaoVazia } from "@/domain/metodologia/caracterizacao";
import { ITENS_DO_CHECKLIST } from "@/domain/metodologia/checklist";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { comoUsuario, usarDriver } from "../db.server";
import { adicionarMembro, criarEvento } from "../servicos/eventos.server";
import { confirmarEnquadramento, salvarFicha } from "../servicos/governanca.server";
import { salvarInventario } from "../servicos/inventario.server";
import {
  listarAcoes,
  listarTemas,
  marcarItemDoChecklist,
  obterChecklist,
  obterLinhaDoTempo,
  obterPlanoDeReducao,
  removerItemDeGestao,
  salvarAcao,
  salvarMedida,
  salvarTema,
} from "../servicos/gestao.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let admin: { id: string; email: string };
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let eventoId: string;

const medida = {
  categoria: "5 Alimentação",
  acao: "Trocar parte dos almoços com carne bovina",
  objetivo: "Substituir" as const,
  metaPct: 30,
  responsavel: "Coordenação de alimentação",
  prazo: "2026-08-20",
  resultado: null,
  evidencia: null,
};

const acao = {
  acao: "Contratar buffet com cardápio vegetariano",
  descricao: null,
  temaId: null,
  medidaId: null,
  responsavel: "Compras",
  prazo: "2026-08-01",
  status: "pendente" as const,
  prioridade: "alta" as const,
  evidenciaEsperada: "Contrato",
  progresso: 0,
};

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  admin = await banco.conta("Admin", { admin: true });
  gestora = await banco.conta("Gestora");
  equipe = await banco.conta("Equipe");
  leitor = await banco.conta("Leitor");
  ({ id: eventoId } = await criarEvento(admin.id, {
    nome: "Seminário",
    instituicao: "Instituto",
    cidade: "Goiânia",
    uf: "GO",
    dataInicio: "2026-09-15",
    dataFim: "2026-09-17",
    cor: "#1e6f5c",
    descricao: null,
    gestorId: gestora.id,
  }));
  await adicionarMembro(gestora.id, { eventoId, email: equipe.email, papel: "equipe" });
  await adicionarMembro(gestora.id, { eventoId, email: leitor.email, papel: "leitor" });
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("checklist", () => {
  it("sem nível confirmado não há lista e não se marca nada", async () => {
    const c = await obterChecklist(leitor.id, eventoId);
    expect(c.fases.every((f) => f.itens.length === 0)).toBe(true);
    await expect(
      marcarItemDoChecklist(equipe.id, { eventoId, chave: "A|1", feito: "Sim", observacao: null }),
    ).rejects.toThrow(/Confirme o nível/);
  });

  it("depois do nível confirmado, a equipe marca; item de nível acima é recusado", async () => {
    const ficha = {
      ...caracterizacaoVazia(),
      participantesDia: 150,
      pctLocal: 100,
      complexidade: V3_16.criteriosComplexidade.map((c) => c.opcoes[1]!),
    };
    await salvarFicha(equipe.id, { eventoId, versao: 0, dados: ficha });
    await confirmarEnquadramento(gestora.id, {
      eventoId,
      nivelVisto: 2,
      responsavel: "Comissão",
      oQueMudou: null,
      limitacaoDeclarada: null,
    });
    await marcarItemDoChecklist(equipe.id, {
      eventoId,
      chave: "A|1",
      feito: "Sim",
      observacao: "Ficha salva",
    });
    const nivel4 = ITENS_DO_CHECKLIST.find((i) => i.nivel === 4)!;
    await expect(
      marcarItemDoChecklist(equipe.id, {
        eventoId,
        chave: `${nivel4.fase}|${nivel4.ordem}`,
        feito: "Sim",
        observacao: null,
      }),
    ).rejects.toThrow(/não se aplica/);
    await expect(
      marcarItemDoChecklist(leitor.id, { eventoId, chave: "A|1", feito: "Não", observacao: null }),
    ).rejects.toThrow(/consulta/);
    const c = await obterChecklist(leitor.id, eventoId);
    expect(c.fases[0]!.itens.find((i) => i.chave === "A|1")!.feito).toBe("Sim");
    expect(c.fases[0]!.itens).toHaveLength(23);
  });
});

describe("plano de redução", () => {
  it("usa o ex-ante da categoria e calcula a meta em tCO₂e", async () => {
    await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_ante",
      versao: 0,
      linhas: [
        {
          fornecedor: null,
          item: "Refeição com carne bovina (porção)",
          descricao: null,
          quantidade: 1200,
          premissa: "Cardápio",
        },
      ],
    });
    const { id } = await salvarMedida(equipe.id, { eventoId, id: null, dados: medida });
    const p = await obterPlanoDeReducao(leitor.id, eventoId);
    expect(p.medidas.map((m) => m.id)).toEqual([id]);
    expect(p.calculo.linhas[0]!.exAnte).toBeCloseTo(14.9532, 9);
    expect(p.calculo.linhas[0]!.metaT).toBeCloseTo(4.48596, 9);
    expect(p.calculo.conferencia).toBe("Faltam medidas com responsável e prazo");
  });

  it("leitor não salva; meta acima de 100% é recusada", async () => {
    await expect(salvarMedida(leitor.id, { eventoId, id: null, dados: medida })).rejects.toThrow(
      /consulta/,
    );
    await expect(
      salvarMedida(equipe.id, { eventoId, id: null, dados: { ...medida, metaPct: 130 } }),
    ).rejects.toThrow(/100%/);
  });
});

describe("matriz e plano de ação", () => {
  it("tema com prioridade calculada; ação ligada ao tema e à medida; atrasada pelo prazo", async () => {
    const { id: temaId } = await salvarTema(equipe.id, {
      eventoId,
      id: null,
      dados: {
        tema: "Alimentação",
        categoria: "5 Alimentação",
        descricao: null,
        impacto: 5,
        relevancia: 4,
        stakeholders: "Participantes",
        fonte: null,
      },
    });
    expect((await listarTemas(leitor.id, eventoId)).temas[0]!.prioridade).toBe("alta");
    const medidaId = (await obterPlanoDeReducao(leitor.id, eventoId)).medidas[0]!.id;
    await salvarAcao(equipe.id, { eventoId, id: null, dados: { ...acao, temaId, medidaId } });
    const l = await listarAcoes(leitor.id, eventoId, "2026-08-02");
    expect(l.acoes[0]).toMatchObject({ tema: "Alimentação", situacao: "atrasada" });
    expect(l.acoes[0]!.medida).toMatch(/carne bovina/);
  });

  it("não aceita vincular tema de outro evento", async () => {
    const { id: outro } = await criarEvento(admin.id, {
      nome: "Outro",
      instituicao: "X",
      cidade: "Anápolis",
      uf: "GO",
      dataInicio: "2026-10-01",
      dataFim: "2026-10-02",
      cor: "#1e6f5c",
      descricao: null,
      gestorId: gestora.id,
    });
    const { id: temaDeOutro } = await salvarTema(gestora.id, {
      eventoId: outro,
      id: null,
      dados: {
        tema: "Água",
        categoria: null,
        descricao: null,
        impacto: 2,
        relevancia: 2,
        stakeholders: null,
        fonte: null,
      },
    });
    await expect(
      salvarAcao(equipe.id, { eventoId, id: null, dados: { ...acao, temaId: temaDeOutro } }),
    ).rejects.toThrow();
  });

  it("apagar o tema solta o vínculo da ação, sem apagar a ação", async () => {
    const tema = (await listarTemas(equipe.id, eventoId)).temas[0]!;
    await removerItemDeGestao(equipe.id, eventoId, "tema", tema.id);
    const l = await listarAcoes(equipe.id, eventoId, "2026-08-02");
    expect(l.acoes).toHaveLength(1);
    expect(l.acoes[0]!.temaId).toBeNull();
  });

  it("quem não é da equipe não lê nada", async () => {
    const estranho = await banco.conta("Estranho");
    await expect(listarAcoes(estranho.id, eventoId, "2026-08-02")).rejects.toThrow(/sem acesso/);
    expect(await comoUsuario(estranho.id, (sql) => sql("select * from plano_acoes"))).toEqual([]);
  });
});

describe("linha do tempo", () => {
  it("junta medidas, ações e prazo de fornecedores nas três fases", async () => {
    const t = await obterLinhaDoTempo(leitor.id, eventoId, "2026-08-02");
    expect(t.linha["Pré-evento"].map((m) => m.origem)).toEqual([
      "Plano de ação",
      "Plano de redução",
    ]);
    expect(t.linha["Pré-evento"][0]!.atrasado).toBe(true);
    expect(t.linha.Execução.map((m) => m.titulo)).toEqual([
      "Abertura do evento",
      "Encerramento do evento",
    ]);
    expect(t.checklist.map((c) => c.total)).toEqual([23, 22, 28]);
  });
});
