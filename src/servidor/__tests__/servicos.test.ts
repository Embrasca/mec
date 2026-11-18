import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caracterizacaoVazia, type Caracterizacao } from "@/domain/metodologia/caracterizacao";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { comoUsuario, usarDriver } from "../db.server";
import {
  adicionarMembro,
  arquivarEvento,
  atualizarEvento,
  criarEvento,
  listarEquipe,
  listarEventos,
  obterEvento,
  removerMembro,
} from "../servicos/eventos.server";
import {
  confirmarEnquadramento,
  listarAuditoria,
  listarEnquadramentos,
  marcarRequisito,
  obterAcompanhamento,
  obterFicha,
  salvarFicha,
} from "../servicos/governanca.server";
import {
  alterarUsuario,
  listarUsuarios,
  registrarConta,
  sincronizarSessao,
} from "../servicos/usuarios.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let admin: { id: string; email: string };
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let estranho: { id: string; email: string };
let eventoId: string;

const dadosDoEvento = {
  nome: "Seminário de teste",
  instituicao: "Instituto Exemplo",
  cidade: "Goiânia",
  uf: "GO" as const,
  dataInicio: "2026-09-15",
  dataFim: "2026-09-17",
  cor: "#1E6F5C",
  descricao: null,
};

/** Ficha que dá Nível 3 por participantes (600 por dia) e 2 gatilhos. */
function fichaNivel3(): Caracterizacao {
  return {
    ...caracterizacaoVazia(),
    participantesDia: 600,
    percentualAereo: 15,
    pctOnibus: 25,
    pctCarro: 20,
    pctLocal: 35,
    pctOutros: 5,
    potenciaGeradoresKva: 60,
    numeroGeradores: 1,
    logistica: "Interestadual",
    complexidade: V3_16.criteriosComplexidade.map((c) => c.opcoes[1]!),
  };
}

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  admin = await banco.conta("Admin", { admin: true });
  gestora = await banco.conta("Gestora");
  equipe = await banco.conta("Equipe");
  leitor = await banco.conta("Leitor");
  estranho = await banco.conta("Estranho");
  ({ id: eventoId } = await criarEvento(admin.id, { ...dadosDoEvento, gestorId: gestora.id }));
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("usuários e sessão", () => {
  it("cria o registro na primeira entrada, sem acesso de administração", async () => {
    const nova = await banco.conta("Nova", { registrar: false });
    const perfil = await sincronizarSessao(nova.id);
    expect(perfil).toMatchObject({ email: nova.email, adminPlataforma: false });
    expect(await listarEventos(nova.id)).toEqual([]);
  });

  it("só a administração lista e altera usuários", async () => {
    expect((await listarUsuarios(admin.id)).length).toBeGreaterThanOrEqual(5);
    await expect(listarUsuarios(gestora.id)).rejects.toThrow(/administração/);
    await expect(
      alterarUsuario(gestora.id, { id: gestora.id, adminPlataforma: true }),
    ).rejects.toThrow();
  });

  it("não registra conta que não existe no provedor de identidade", async () => {
    await expect(
      registrarConta(admin.id, {
        id: crypto.randomUUID(),
        email: "fantasma@exemplo.org",
        nome: "Fantasma",
        adminPlataforma: false,
      }),
    ).rejects.toThrow(/provedor/);
  });

  it("admin não tira o próprio acesso", async () => {
    await expect(
      alterarUsuario(admin.id, { id: admin.id, adminPlataforma: false }),
    ).rejects.toThrow(/próprio/);
  });

  it("conta desativada perde o acesso aos eventos", async () => {
    const temp = await banco.conta("Temporaria");
    await adicionarMembro(gestora.id, { eventoId, email: temp.email, papel: "leitor" });
    expect(await listarEventos(temp.id)).toHaveLength(1);
    await alterarUsuario(admin.id, { id: temp.id, ativo: false });
    expect(await listarEventos(temp.id)).toHaveLength(0);
    await expect(sincronizarSessao(temp.id)).rejects.toThrow(/desativada/);
  });
});

describe("eventos e equipe", () => {
  it("só a administração cria eventos", async () => {
    await expect(
      criarEvento(gestora.id, { ...dadosDoEvento, gestorId: gestora.id }),
    ).rejects.toThrow(/administração/);
  });

  it("recusa cor clara demais e período invertido", async () => {
    await expect(
      criarEvento(admin.id, { ...dadosDoEvento, cor: "#f5f5f5", gestorId: gestora.id }),
    ).rejects.toThrow(/clara demais/);
    await expect(
      criarEvento(admin.id, { ...dadosDoEvento, dataFim: "2026-09-01", gestorId: gestora.id }),
    ).rejects.toThrow(/término/);
  });

  it("quem não é da equipe não vê o evento", async () => {
    expect(await listarEventos(estranho.id)).toEqual([]);
    await expect(obterEvento(estranho.id, eventoId)).rejects.toThrow(/sem acesso/);
  });

  it("a gestora monta a equipe; quem é da equipe não", async () => {
    await adicionarMembro(gestora.id, { eventoId, email: equipe.email, papel: "equipe" });
    await adicionarMembro(gestora.id, { eventoId, email: leitor.email, papel: "leitor" });
    await expect(
      adicionarMembro(equipe.id, { eventoId, email: estranho.email, papel: "leitor" }),
    ).rejects.toThrow(/gestor/);
    const nomes = (await listarEquipe(leitor.id, eventoId)).map((m) => m.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Gestora", "Equipe", "Leitor"]));
  });

  it("o evento não fica sem gestor", async () => {
    await expect(removerMembro(gestora.id, eventoId, gestora.id)).rejects.toThrow(
      /pelo menos um gestor/,
    );
  });

  it("e-mail sem conta ativa não entra na equipe", async () => {
    await expect(
      adicionarMembro(gestora.id, { eventoId, email: "ninguem@exemplo.org", papel: "leitor" }),
    ).rejects.toThrow(/Não há conta/);
  });

  it("só o gestor altera o cadastro; só a administração arquiva", async () => {
    await atualizarEvento(gestora.id, eventoId, { ...dadosDoEvento, cor: "#7a2e8c" });
    expect((await obterEvento(leitor.id, eventoId)).cor).toBe("#7a2e8c");
    await expect(atualizarEvento(equipe.id, eventoId, dadosDoEvento)).rejects.toThrow(/gestor/);
    await expect(arquivarEvento(gestora.id, eventoId, true)).rejects.toThrow(/administração/);
  });

  it("a RLS barra escrita direta mesmo sem passar pelo serviço", async () => {
    await expect(
      comoUsuario(estranho.id, (sql) =>
        sql("update eventos set nome = 'invadido' where id = $1 returning id", [eventoId]),
      ),
    ).resolves.toEqual([]);
    await expect(
      comoUsuario(equipe.id, (sql) =>
        sql(
          "insert into enquadramentos (evento_id, tipo, nivel, metodologia, entradas, resultado, responsavel, registrado_por) values ($1,'inicial',4,'x','{}','{}','x',$2)",
          [eventoId, equipe.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("caracterização e enquadramento", () => {
  it("leitor consulta mas não edita a ficha", async () => {
    const ficha = await obterFicha(leitor.id, eventoId);
    expect(ficha.versao).toBe(0);
    await expect(
      salvarFicha(leitor.id, { eventoId, versao: 0, dados: fichaNivel3() }),
    ).rejects.toThrow(/consulta/);
  });

  it("a equipe salva a ficha e o nível é calculado no servidor", async () => {
    const ficha = await salvarFicha(equipe.id, { eventoId, versao: 0, dados: fichaNivel3() });
    expect(ficha.versao).toBe(1);
    expect(ficha.resultado.nivelFinal).toBe(3);
    expect(ficha.resultado.gatilhosAcionados).toBe(2);
  });

  it("recusa salvar por cima da versão de outra pessoa", async () => {
    await expect(
      salvarFicha(gestora.id, { eventoId, versao: 0, dados: fichaNivel3() }),
    ).rejects.toThrow(/Outra pessoa/);
  });

  it("recusa ficha com opção inexistente", async () => {
    await expect(
      salvarFicha(equipe.id, {
        eventoId,
        versao: 1,
        dados: { ...fichaNivel3(), formato: "Telepresença" },
      }),
    ).rejects.toThrow();
  });

  it("só o gestor confirma, e o nível visto precisa bater", async () => {
    const base = { eventoId, responsavel: "Comissão", oQueMudou: null, limitacaoDeclarada: null };
    await expect(confirmarEnquadramento(equipe.id, { ...base, nivelVisto: 3 })).rejects.toThrow(
      /gestor/,
    );
    await expect(confirmarEnquadramento(gestora.id, { ...base, nivelVisto: 2 })).rejects.toThrow(
      /mudou/,
    );
    expect(await confirmarEnquadramento(gestora.id, { ...base, nivelVisto: 3 })).toEqual({
      nivel: 3,
      tipo: "inicial",
    });
    expect((await obterEvento(leitor.id, eventoId)).nivel).toBe(3);
  });

  it("o nível não desce quando a ficha muda para menos", async () => {
    const menor = {
      ...fichaNivel3(),
      participantesDia: 100,
      potenciaGeradoresKva: 0,
      logistica: "Municipal",
    };
    const ficha = await salvarFicha(equipe.id, { eventoId, versao: 1, dados: menor });
    expect(ficha.resultado.nivelFinal).toBe(2);
    await expect(
      confirmarEnquadramento(gestora.id, {
        eventoId,
        nivelVisto: 2,
        responsavel: "Comissão",
        oQueMudou: "Público menor",
        limitacaoDeclarada: null,
      }),
    ).rejects.toThrow(/continua 3/);
    // Nem escrevendo direto no banco.
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql("update eventos set nivel = 2 where id = $1", [eventoId]),
      ),
    ).rejects.toThrow(/só sobe/);
  });

  it("subir de nível exige registro de reenquadramento", async () => {
    const maior = { ...fichaNivel3(), participantesDia: 1500 };
    await salvarFicha(equipe.id, { eventoId, versao: 2, dados: maior });
    const base = { eventoId, nivelVisto: 4, responsavel: "Comissão", limitacaoDeclarada: null };
    await expect(confirmarEnquadramento(gestora.id, { ...base, oQueMudou: null })).rejects.toThrow(
      /o que mudou/,
    );
    await confirmarEnquadramento(gestora.id, {
      ...base,
      oQueMudou: "Inscrições passaram de 1.000 por dia",
      limitacaoDeclarada: "Plano de coleta refeito em prazo curto",
    });
    const historico = await listarEnquadramentos(leitor.id, eventoId);
    expect(historico.map((h) => [h.tipo, h.nivelAnterior, h.nivel])).toEqual([
      ["reenquadramento", 3, 4],
      ["inicial", null, 3],
    ]);
  });

  it("nível não muda por escrita direta sem enquadramento", async () => {
    const outro = await criarEvento(admin.id, { ...dadosDoEvento, gestorId: gestora.id });
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql("update eventos set nivel = 4 where id = $1", [outro.id]),
      ),
    ).rejects.toThrow(/registro do enquadramento/);
  });
});

describe("acompanhamento e auditoria", () => {
  it("mostra a exigência do nível oficial e registra o que foi feito", async () => {
    await marcarRequisito(equipe.id, {
      eventoId,
      requisito: "Plano de coleta",
      feito: "Sim",
      observacao: null,
    });
    const a = await obterAcompanhamento(leitor.id, eventoId);
    expect(a.total).toBe(18);
    expect(a.cumpridos).toBe(1);
    const plano = a.linhas.find((l) => l.requisito === "Plano de coleta")!;
    expect(plano.exigencia).toBe("Matriz completa, contingencias e versões"); // nível 4
    await expect(
      marcarRequisito(leitor.id, {
        eventoId,
        requisito: "Plano de coleta",
        feito: "Não",
        observacao: null,
      }),
    ).rejects.toThrow(/consulta/);
  });

  it("auditoria: gestora vê a do evento; equipe não vê nada", async () => {
    const daGestora = await listarAuditoria(gestora.id, eventoId);
    expect(daGestora.map((l) => l.acao)).toEqual(
      expect.arrayContaining(["criar_evento", "salvar_caracterizacao", "reenquadrar"]),
    );
    expect(await listarAuditoria(equipe.id, eventoId)).toEqual([]);
    await expect(comoUsuario(admin.id, (sql) => sql("delete from auditoria"))).rejects.toThrow(
      /permission denied/,
    );
  });
});
