import { z } from "zod";
import {
  CHAVES_DO_CHECKLIST,
  checklistDoNivel,
  ITENS_DO_CHECKLIST,
  type Resposta,
} from "@/domain/metodologia/checklist";
import { prazoDeEntrega } from "@/domain/metodologia/fornecedores";
import { calcularReducao, medidaSchema, type Medida } from "@/domain/metodologia/reducao";
import {
  acaoSchema,
  montarLinhaDoTempo,
  prioridadeDoTema,
  situacaoDaAcao,
  temaSchema,
  NOME_DO_STATUS,
  type Acao,
  type Tema,
} from "@/domain/gestao";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel, type EventoResumo } from "./eventos.server";
import { lerInventario } from "./inventario.server";

const uuid = z.string().uuid();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function exigirEdicao(sql: Sql, eventoId: string): Promise<EventoResumo> {
  const evento = await eventoVisivel(sql, uuid.parse(eventoId));
  if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
  return evento;
}

// ---------------------------------------------------------------------
// Checklist do nível (aba C)
// ---------------------------------------------------------------------

async function lerChecklist(sql: Sql, evento: EventoResumo) {
  const linhas = await sql<{ chave: string; feito: Resposta; observacao: string | null }>(
    "select chave, feito, observacao from checklist_respostas where evento_id = $1",
    [evento.id],
  );
  return checklistDoNivel(evento.nivel, new Map(linhas.map((l) => [l.chave, l])));
}

export async function obterChecklist(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    return { evento, fases: await lerChecklist(sql, evento) };
  });
}

export const marcarItemSchema = z.object({
  eventoId: z.string().uuid(),
  chave: z.string().refine((c) => CHAVES_DO_CHECKLIST.has(c), "Item inexistente."),
  feito: z.enum(["Sim", "Não"]),
  observacao: z.string().trim().max(2000).nullable(),
});

export async function marcarItemDoChecklist(
  atorId: string,
  entrada: z.input<typeof marcarItemSchema>,
) {
  const d = marcarItemSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await exigirEdicao(sql, d.eventoId);
    if (evento.nivel === null)
      throw new ErroDeNegocio("Confirme o nível antes de usar o checklist.");
    const item = ITENS_DO_CHECKLIST.find((i) => `${i.fase}|${i.ordem}` === d.chave)!;
    if (item.nivel > evento.nivel)
      throw new ErroDeNegocio("Este item não se aplica ao nível do evento.");
    await sql(
      `insert into checklist_respostas (evento_id, chave, feito, observacao, atualizado_por)
       values ($1,$2,$3,$4,$5)
       on conflict (evento_id, chave) do update set feito = excluded.feito, observacao = excluded.observacao,
         atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [d.eventoId, d.chave, d.feito, d.observacao, atorId],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "marcar_checklist",
      entidade: "checklist",
      entidadeId: d.chave,
      detalhes: { feito: d.feito },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Plano de redução (aba REDUÇÃO)
// ---------------------------------------------------------------------

type MedidaGravada = Medida & { id: string };

async function lerMedidas(sql: Sql, eventoId: string) {
  return sql<MedidaGravada>(
    `select id::text, categoria, acao, objetivo, meta_pct as "metaPct", responsavel,
            to_char(prazo, 'YYYY-MM-DD') as prazo, resultado, evidencia
     from medidas_reducao where evento_id = $1 order by criado_em, id`,
    [eventoId],
  );
}

/** Ex-ante por categoria, do inventário do evento; null se ainda não houver. */
async function exAntePorCategoria(
  sql: Sql,
  eventoId: string,
): Promise<Record<string, number> | null> {
  const evento = await eventoVisivel(sql, eventoId);
  if (!evento.baseFatoresId) return null;
  const inv = await lerInventario(sql, eventoId, "ex_ante");
  if (inv.linhas.length === 0) return null;
  return Object.fromEntries(inv.resultado.porCategoria.map((c) => [c.categoria, c.total]));
}

export async function obterPlanoDeReducao(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const medidas = await lerMedidas(sql, evento.id);
    const porCategoria = await exAntePorCategoria(sql, evento.id);
    return {
      evento,
      medidas,
      exAntePorCategoria: porCategoria,
      calculo: calcularReducao(medidas, porCategoria, null, evento.nivel),
    };
  });
}

export const salvarMedidaSchema = z.object({
  eventoId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  dados: medidaSchema.refine((m) => Boolean(m.acao), {
    message: "Descreva a ação.",
    path: ["acao"],
  }),
});

export async function salvarMedida(atorId: string, entrada: z.input<typeof salvarMedidaSchema>) {
  const d = salvarMedidaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const m = d.dados;
    const valores = [
      m.categoria,
      m.acao,
      m.objetivo,
      m.metaPct,
      m.responsavel,
      m.prazo,
      m.resultado,
      m.evidencia,
      atorId,
    ];
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update medidas_reducao set categoria=$3, acao=$4, objetivo=$5, meta_pct=$6, responsavel=$7, prazo=$8,
                  resultado=$9, evidencia=$10, atualizado_por=$11, atualizado_em=now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores],
        )
      : await sql<{ id: string }>(
          `insert into medidas_reducao (evento_id, categoria, acao, objetivo, meta_pct, responsavel, prazo, resultado,
                                        evidencia, atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id::text`,
          [d.eventoId, ...valores],
        );
    if (!r) throw new ErroDeNegocio("Medida não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_medida",
      entidade: "medida_reducao",
      entidadeId: r.id,
    });
    return { id: r.id };
  });
}

// ---------------------------------------------------------------------
// Matriz impacto × relevância
// ---------------------------------------------------------------------

type TemaGravado = Tema & { id: string; prioridade: ReturnType<typeof prioridadeDoTema> };

export async function listarTemas(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const temas = await sql<Omit<TemaGravado, "prioridade">>(
      `select id::text, tema, categoria, descricao, impacto, relevancia, stakeholders, fonte
       from matriz_temas where evento_id = $1 order by impacto + relevancia desc, lower(tema)`,
      [evento.id],
    );
    return {
      evento,
      temas: temas.map((t): TemaGravado => ({
        ...t,
        prioridade: prioridadeDoTema(t.impacto, t.relevancia),
      })),
    };
  });
}

export const salvarTemaSchema = z.object({
  eventoId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  dados: temaSchema,
});

export async function salvarTema(atorId: string, entrada: z.input<typeof salvarTemaSchema>) {
  const d = salvarTemaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const t = d.dados;
    const valores = [
      t.tema,
      t.categoria,
      t.descricao,
      t.impacto,
      t.relevancia,
      t.stakeholders,
      t.fonte,
      atorId,
    ];
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update matriz_temas set tema=$3, categoria=$4, descricao=$5, impacto=$6, relevancia=$7, stakeholders=$8,
                  fonte=$9, atualizado_por=$10, atualizado_em=now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores],
        )
      : await sql<{ id: string }>(
          `insert into matriz_temas (evento_id, tema, categoria, descricao, impacto, relevancia, stakeholders, fonte,
                                     atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text`,
          [d.eventoId, ...valores],
        );
    if (!r) throw new ErroDeNegocio("Tema não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_tema",
      entidade: "tema_matriz",
      entidadeId: r.id,
    });
    return { id: r.id };
  });
}

// ---------------------------------------------------------------------
// Plano de ação
// ---------------------------------------------------------------------

type AcaoGravada = Acao & { id: string; tema: string | null; medida: string | null };

async function lerAcoes(sql: Sql, eventoId: string) {
  return sql<AcaoGravada>(
    `select a.id::text, a.acao, a.descricao, a.tema_id::text as "temaId", a.medida_id::text as "medidaId",
            a.responsavel, to_char(a.prazo, 'YYYY-MM-DD') as prazo, a.status, a.prioridade,
            a.evidencia_esperada as "evidenciaEsperada", a.progresso, t.tema, m.acao as medida
     from plano_acoes a
     left join matriz_temas t on t.id = a.tema_id
     left join medidas_reducao m on m.id = a.medida_id
     where a.evento_id = $1
     order by a.prazo nulls last, array_position(array['critica','alta','media','baixa'], a.prioridade), a.criado_em`,
    [eventoId],
  );
}

export async function listarAcoes(atorId: string, eventoId: string, hoje: string) {
  const h = dia.parse(hoje);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const acoes = await lerAcoes(sql, evento.id);
    return { evento, acoes: acoes.map((a) => ({ ...a, situacao: situacaoDaAcao(a, h) })) };
  });
}

export const salvarAcaoSchema = z.object({
  eventoId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  dados: acaoSchema,
});

export async function salvarAcao(atorId: string, entrada: z.input<typeof salvarAcaoSchema>) {
  const d = salvarAcaoSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const a = d.dados;
    const valores = [
      a.acao,
      a.descricao,
      a.temaId,
      a.medidaId,
      a.responsavel,
      a.prazo,
      a.status,
      a.prioridade,
      a.evidenciaEsperada,
      a.progresso,
      atorId,
    ];
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update plano_acoes set acao=$3, descricao=$4, tema_id=$5, medida_id=$6, responsavel=$7, prazo=$8, status=$9,
                  prioridade=$10, evidencia_esperada=$11, progresso=$12, atualizado_por=$13, atualizado_em=now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores],
        )
      : await sql<{ id: string }>(
          `insert into plano_acoes (evento_id, acao, descricao, tema_id, medida_id, responsavel, prazo, status,
                                    prioridade, evidencia_esperada, progresso, atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id::text`,
          [d.eventoId, ...valores],
        );
    if (!r) throw new ErroDeNegocio("Ação não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_acao",
      entidade: "plano_acao",
      entidadeId: r.id,
    });
    return { id: r.id };
  });
}

// ---------------------------------------------------------------------
// Remoção (medida, tema, ação)
// ---------------------------------------------------------------------

const TABELAS = { medida: "medidas_reducao", tema: "matriz_temas", acao: "plano_acoes" } as const;

export async function removerItemDeGestao(
  atorId: string,
  eventoId: string,
  tipo: keyof typeof TABELAS,
  id: string,
) {
  const tabela = TABELAS[z.enum(["medida", "tema", "acao"]).parse(tipo)];
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, eventoId);
    const [r] = await sql<{ id: string }>(
      `delete from ${tabela} where id = $1 and evento_id = $2 returning id::text`,
      [uuid.parse(id), eventoId],
    );
    if (!r) throw new ErroDeNegocio("Item não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: `remover_${tipo}`,
      entidade: tabela,
      entidadeId: id,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------

export async function obterLinhaDoTempo(atorId: string, eventoId: string, hoje: string) {
  const h = dia.parse(hoje);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const medidas = await lerMedidas(sql, evento.id);
    const acoes = await lerAcoes(sql, evento.id);
    const fornecedores = await sql<{ nome: string; recebido: boolean }>(
      "select nome, recebido_em is not null as recebido from fornecedores where evento_id = $1",
      [evento.id],
    );
    const prazoFornecedores = prazoDeEntrega(evento.dataFim);
    const marcos = [
      ...medidas
        .filter((m) => m.prazo)
        .map((m) => ({
          data: m.prazo!,
          titulo: m.acao ?? "Medida de redução",
          origem: "Plano de redução" as const,
          situacao: m.resultado,
          atrasado: !m.resultado && m.prazo! < h,
        })),
      ...acoes
        .filter((a) => a.prazo)
        .map((a) => {
          const s = situacaoDaAcao(a, h);
          return {
            data: a.prazo!,
            titulo: a.acao,
            origem: "Plano de ação" as const,
            situacao: NOME_DO_STATUS[s],
            atrasado: s === "atrasada",
          };
        }),
      ...fornecedores.map((f) => ({
        data: prazoFornecedores,
        titulo: `Entrega de dados: ${f.nome}`,
        origem: "Fornecedor" as const,
        situacao: f.recebido ? "Recebido" : "Aguardando",
        atrasado: !f.recebido && prazoFornecedores < h,
      })),
    ];
    const checklist = await lerChecklist(sql, evento);
    return {
      evento,
      linha: montarLinhaDoTempo({ inicio: evento.dataInicio, fim: evento.dataFim }, marcos),
      checklist: checklist.map((f) => ({
        fase: f.nome,
        total: f.itens.length,
        progresso: f.progresso,
        concluida: f.concluida,
      })),
    };
  });
}
