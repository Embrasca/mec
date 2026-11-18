import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coletaSchema } from "@/domain/metodologia/coleta";
import casoColeta from "@/domain/metodologia/__tests__/fixtures/coleta-exemplo.json";
import casoInventario from "@/domain/metodologia/__tests__/fixtures/inventario-exemplo.json";
import { comoUsuario, usarDriver } from "../db.server";
import { adicionarMembro, criarEvento, obterEvento } from "../servicos/eventos.server";
import {
  alterarFator,
  criarVersaoDaBase,
  definirBaseDoEvento,
  fecharInventario,
  lancarColetaNoInventario,
  listarBases,
  listarFornecedores,
  obterBase,
  obterInventario,
  publicarBase,
  removerFornecedor,
  salvarColeta,
  salvarFornecedor,
  salvarInventario,
} from "../servicos/inventario.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let admin: { id: string; email: string };
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let eventoId: string;
let baseOficial: string;

const evento = {
  nome: "Seminário",
  instituicao: "Instituto",
  cidade: "Goiânia",
  uf: "GO" as const,
  dataInicio: "2026-09-15",
  dataFim: "2026-09-17",
  cor: "#1e6f5c",
  descricao: null,
};

const linhasDoExemplo = casoInventario.exAnte.linhas.map((l) => ({
  fornecedor: l.fornecedor ?? null,
  item: l.item,
  descricao: l.descricao ?? null,
  quantidade: l.quantidade as number,
  premissa: (l.premissa as string | null) ?? null,
}));

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  admin = await banco.conta("Admin", { admin: true });
  gestora = await banco.conta("Gestora");
  equipe = await banco.conta("Equipe");
  leitor = await banco.conta("Leitor");
  ({ id: eventoId } = await criarEvento(admin.id, { ...evento, gestorId: gestora.id }));
  await adicionarMembro(gestora.id, { eventoId, email: equipe.email, papel: "equipe" });
  await adicionarMembro(gestora.id, { eventoId, email: leitor.email, papel: "leitor" });
  baseOficial = (await listarBases(leitor.id))[0]!.id;
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("base de fatores", () => {
  it("evento novo já usa a base oficial publicada", async () => {
    const e = await obterEvento(leitor.id, eventoId);
    expect(e.baseFatoresNome).toBe("GHG Protocol Brasil 2026.0.1");
    const b = await obterBase(leitor.id, baseOficial);
    expect(b.situacao).toBe("publicada");
    expect(b.itens).toHaveLength(44);
    expect(b.gwpCh4).toBe(28);
  });

  it("base publicada não muda, nem pela administração", async () => {
    const f = (await obterBase(admin.id, baseOficial)).itens[1]!;
    await expect(
      alterarFator(admin.id, {
        baseId: baseOficial,
        item: f.item,
        feCo2: 9,
        feCh4: 0,
        feN2o: 0,
        feBiogenico: 0,
        fonte: "x",
        situacao: "x",
      }),
    ).rejects.toThrow(/publicada não muda/);
  });

  it("nova versão: rascunho editável só pela administração, depois publicada e congelada", async () => {
    const { id } = await criarVersaoDaBase(admin.id, {
      deBaseId: baseOficial,
      nome: "Teste 2027",
      observacao: null,
    });
    const alteracao = {
      baseId: id,
      item: "Tecido (kg)",
      feCo2: 20,
      feCh4: 0,
      feN2o: 0,
      feBiogenico: 0,
      fonte: "Fonte nova",
      situacao: "Referência",
    };
    await expect(alterarFator(gestora.id, alteracao)).rejects.toThrow(/administração/);
    await alterarFator(admin.id, alteracao);
    expect((await obterBase(admin.id, id)).itens.find((i) => i.item === "Tecido (kg)")!.feCo2).toBe(
      20,
    );
    await publicarBase(admin.id, id);
    await expect(alterarFator(admin.id, alteracao)).rejects.toThrow(/publicada não muda/);
  });

  it("gestor escolhe a base do evento; equipe não", async () => {
    await expect(definirBaseDoEvento(equipe.id, eventoId, baseOficial)).rejects.toThrow(/gestor/);
    await definirBaseDoEvento(gestora.id, eventoId, baseOficial);
  });
});

describe("inventário ex-ante", () => {
  let versao = 0;

  it("a equipe lança as linhas do exemplo e o total confere com a planilha", async () => {
    const inv = await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_ante",
      versao: 0,
      linhas: linhasDoExemplo,
    });
    versao = inv.versao;
    expect(inv.linhas).toHaveLength(17);
    expect(inv.resultado.totais.total).toBeCloseTo(casoInventario.exAnte.totais.total, 7);
    expect(inv.resultado.avisoSin).toMatch(/2025/);
  });

  it("leitor não edita; item fora da base é recusado; versão antiga é recusada", async () => {
    await expect(
      salvarInventario(leitor.id, { eventoId, etapa: "ex_ante", versao, linhas: linhasDoExemplo }),
    ).rejects.toThrow(/consulta/);
    await expect(
      salvarInventario(equipe.id, {
        eventoId,
        etapa: "ex_ante",
        versao,
        linhas: [
          { fornecedor: null, item: "Ouro (kg)", descricao: null, quantidade: 1, premissa: "x" },
        ],
      }),
    ).rejects.toThrow(/não está na base/);
    await expect(
      salvarInventario(equipe.id, {
        eventoId,
        etapa: "ex_ante",
        versao: versao - 1,
        linhas: linhasDoExemplo,
      }),
    ).rejects.toThrow(/mudou/);
  });

  it("não fecha com alerta pendente; só o gestor fecha", async () => {
    const comAlerta = await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_ante",
      versao,
      linhas: [
        ...linhasDoExemplo,
        {
          fornecedor: null,
          item: "Tecido (kg)",
          descricao: null,
          quantidade: null,
          premissa: null,
        },
      ],
    });
    await expect(
      fecharInventario(gestora.id, eventoId, "ex_ante", comAlerta.versao),
    ).rejects.toThrow(/alertas/);
    const ok = await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_ante",
      versao: comAlerta.versao,
      linhas: linhasDoExemplo,
    });
    versao = ok.versao;
    await expect(fecharInventario(equipe.id, eventoId, "ex_ante", versao)).rejects.toThrow(
      /gestor/,
    );
    await fecharInventario(gestora.id, eventoId, "ex_ante", versao);
    const fechado = await obterInventario(leitor.id, eventoId, "ex_ante");
    expect(fechado.fechadoEm).not.toBeNull();
  });

  it("ex-ante fechado é imutável, mesmo por escrita direta, e trava a base do evento", async () => {
    await expect(
      salvarInventario(gestora.id, { eventoId, etapa: "ex_ante", versao, linhas: [] }),
    ).rejects.toThrow(/fechado/);
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql("delete from inventario_linhas where evento_id = $1", [eventoId]),
      ),
    ).rejects.toThrow(/fechado/);
    const outra = (await listarBases(admin.id)).find((b) => b.nome === "Teste 2027")!;
    await expect(definirBaseDoEvento(gestora.id, eventoId, outra.id)).rejects.toThrow(
      /não muda depois/,
    );
  });
});

describe("coleta e lançamento no inventário", () => {
  let outro: string;

  it("salva os quadros do exemplo e lança o resumo no ex-ante", async () => {
    ({ id: outro } = await criarEvento(admin.id, { ...evento, gestorId: gestora.id }));
    const { esperado: _e, ...dados } = casoColeta;
    const c = await salvarColeta(gestora.id, {
      eventoId: outro,
      etapa: "ex_ante",
      versao: 0,
      dados: coletaSchema.parse(dados),
    });
    expect(c.calculo.resumo.find((r) => r.item === "Diesel em gerador (litro)")!.quantidade).toBe(
      410,
    );
    const r1 = await lancarColetaNoInventario(gestora.id, outro, "ex_ante");
    expect(r1.atualizadas).toBe(0);
    const inv = await obterInventario(gestora.id, outro, "ex_ante");
    expect(inv.linhas.length).toBe(r1.novas);
    expect(inv.linhas.every((l) => l.origem === "coleta")).toBe(true);
  });

  it("lançar de novo atualiza as mesmas linhas, sem duplicar", async () => {
    const antes = (await obterInventario(gestora.id, outro, "ex_ante")).linhas.length;
    const r2 = await lancarColetaNoInventario(gestora.id, outro, "ex_ante");
    expect(r2.novas).toBe(0);
    expect((await obterInventario(gestora.id, outro, "ex_ante")).linhas.length).toBe(antes);
  });
});

describe("fornecedores", () => {
  const dados = {
    nome: "Locadora Exemplo",
    tipo: "Locadora de gerador",
    contato: null,
    enviadoEm: "2026-08-10",
    recebidoEm: null,
    haSubcontratados: null,
    subcontratadosIncluidos: null,
    observacao: null,
  };

  it("prazo = término + 5 dias; vencido sem recebimento gera alerta; conta linhas do tipo", async () => {
    const { id } = await salvarFornecedor(equipe.id, { eventoId, id: null, dados });
    const antes = await listarFornecedores(leitor.id, eventoId, "2026-09-20");
    expect(antes.fornecedores[0]).toMatchObject({
      prazo: "2026-09-22",
      situacao: "Aguardando",
      alerta: "OK",
      linhasExAnte: 1,
    });
    const depois = await listarFornecedores(leitor.id, eventoId, "2026-09-23");
    expect(depois.fornecedores[0]!.alerta).toBe("Prazo vencido: cobrar por escrito");
    await salvarFornecedor(equipe.id, {
      eventoId,
      id,
      dados: { ...dados, recebidoEm: "2026-09-21", haSubcontratados: "Sim" },
    });
    const f = (await listarFornecedores(leitor.id, eventoId, "2026-09-23")).fornecedores[0]!;
    expect([f.situacao, f.alerta]).toEqual(["Recebido", "Confirmar inclusão dos subcontratados"]);
    await expect(removerFornecedor(leitor.id, eventoId, id)).rejects.toThrow(/consulta/);
    await removerFornecedor(equipe.id, eventoId, id);
  });

  it("tipo inválido é recusado", async () => {
    await expect(
      salvarFornecedor(equipe.id, { eventoId, id: null, dados: { ...dados, tipo: "Padaria" } }),
    ).rejects.toThrow(/tipo/);
  });
});
