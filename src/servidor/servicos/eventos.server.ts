import { z } from "zod";
import { eventoComMunicipioSchema } from "@/domain/territorio";
import { eventoSchema, PAPEIS, type Papel } from "@/domain/evento";
import { METODOLOGIA_ID, type Nivel } from "@/domain/metodologia/v3_16";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { exigirAdmin } from "./usuarios.server";

export interface EventoResumo {
  id: string;
  nome: string;
  instituicao: string;
  cidade: string;
  uf: string;
  municipioIbge: number | null;
  dataInicio: string;
  dataFim: string;
  cor: string;
  descricao: string | null;
  nivel: Nivel | null;
  metodologia: string;
  baseFatoresId: string | null;
  baseFatoresNome: string | null;
  /** Papel de quem consulta; null para a administração sem vínculo. */
  papel: Papel | null;
  podeEditar: boolean;
  podeGerir: boolean;
  arquivado: boolean;
}

const COLUNAS = `
  e.id::text, e.nome, e.instituicao, e.cidade, e.uf, e.municipio_ibge as "municipioIbge",
  to_char(e.data_inicio, 'YYYY-MM-DD') as "dataInicio",
  to_char(e.data_fim, 'YYYY-MM-DD') as "dataFim",
  e.cor, e.descricao, e.nivel, e.metodologia,
  e.base_fatores_id::text as "baseFatoresId",
  (select b.nome from bases_fatores b where b.id = e.base_fatores_id) as "baseFatoresNome",
  app.papel_no_evento(e.id)::text as papel,
  app.pode_editar_evento(e.id) as "podeEditar",
  app.pode_gerir_evento(e.id) as "podeGerir",
  e.arquivado_em is not null as arquivado`;

export async function listarEventos(atorId: string, incluirArquivados = false) {
  return comoUsuario(atorId, (sql) =>
    sql<EventoResumo>(
      `select ${COLUNAS} from eventos e
       where ($1 or e.arquivado_em is null)
       order by e.arquivado_em nulls first, e.data_inicio desc, lower(e.nome)`,
      [incluirArquivados],
    ),
  );
}

/** Eventos ativos visíveis a quem consulta, dentro de uma transação já aberta. */
export async function lerEventosAtivos(sql: Sql): Promise<EventoResumo[]> {
  return sql<EventoResumo>(
    `select ${COLUNAS} from eventos e where e.arquivado_em is null order by e.data_inicio desc, lower(e.nome)`,
  );
}

/** Carrega o evento ou falha. A RLS esconde o que a pessoa não pode ver. */
export async function eventoVisivel(sql: Sql, eventoId: string): Promise<EventoResumo> {
  const [e] = await sql<EventoResumo>(`select ${COLUNAS} from eventos e where e.id = $1`, [
    eventoId,
  ]);
  if (!e) throw new ErroDeNegocio("Evento não encontrado ou sem acesso.");
  return e;
}

export async function obterEvento(atorId: string, eventoId: string) {
  return comoUsuario(atorId, (sql) => eventoVisivel(sql, z.string().uuid().parse(eventoId)));
}

export const novoEventoSchema = eventoComMunicipioSchema.and(
  z.object({ gestorId: z.string().uuid() }),
);

export async function criarEvento(atorId: string, entrada: z.input<typeof novoEventoSchema>) {
  const d = novoEventoSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [gestor] = await sql<{ id: string }>(
      "select id::text from usuarios where id = $1 and ativo",
      [d.gestorId],
    );
    if (!gestor) throw new ErroDeNegocio("Escolha um gestor com conta ativa.");
    const [criado] = await sql<{ id: string }>(
      `insert into eventos (nome, instituicao, cidade, uf, data_inicio, data_fim, cor, descricao,
                            metodologia, criado_por, municipio_ibge, base_fatores_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               (select id from bases_fatores where situacao = 'publicada' order by publicada_em desc limit 1))
       returning id::text`,
      [
        d.nome,
        d.instituicao,
        d.cidade,
        d.uf,
        d.dataInicio,
        d.dataFim,
        d.cor,
        d.descricao,
        METODOLOGIA_ID,
        atorId,
        d.municipioIbge,
      ],
    );
    await sql(
      `insert into evento_membros (evento_id, usuario_id, papel, criado_por) values ($1,$2,'gestor',$3)`,
      [criado!.id, d.gestorId, atorId],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: criado!.id,
      acao: "criar_evento",
      entidade: "evento",
      entidadeId: criado!.id,
      detalhes: { nome: d.nome, gestorId: d.gestorId },
    });
    return { id: criado!.id };
  });
}

export async function atualizarEvento(
  atorId: string,
  eventoId: string,
  entrada: z.input<typeof eventoSchema>,
) {
  const d = eventoComMunicipioSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const atual = await eventoVisivel(sql, eventoId);
    if (!atual.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento pode alterar o cadastro.");
    await sql(
      `update eventos set nome=$2, instituicao=$3, cidade=$4, uf=$5, data_inicio=$6, data_fim=$7,
              cor=$8, descricao=$9, municipio_ibge=$10 where id=$1`,
      [
        eventoId,
        d.nome,
        d.instituicao,
        d.cidade,
        d.uf,
        d.dataInicio,
        d.dataFim,
        d.cor,
        d.descricao,
        d.municipioIbge,
      ],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "alterar_evento",
      entidade: "evento",
      entidadeId: eventoId,
      detalhes: d,
    });
    return { ok: true };
  });
}

export async function arquivarEvento(atorId: string, eventoId: string, arquivar: boolean) {
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    await eventoVisivel(sql, eventoId);
    await sql(
      "update eventos set arquivado_em = case when $2 then now() else null end where id = $1",
      [eventoId, arquivar],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: arquivar ? "arquivar_evento" : "reabrir_evento",
      entidade: "evento",
      entidadeId: eventoId,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------

export interface Membro {
  usuarioId: string;
  nome: string;
  email: string;
  papel: Papel;
}

export async function listarEquipe(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    await eventoVisivel(sql, eventoId);
    return sql<Membro>(
      `select m.usuario_id::text as "usuarioId", u.nome, u.email, m.papel::text as papel
       from evento_membros m join usuarios u on u.id = m.usuario_id
       where m.evento_id = $1
       order by array_position(array['gestor','equipe','revisor','leitor'], m.papel::text), lower(u.nome)`,
      [eventoId],
    );
  });
}

export const membroSchema = z.object({
  eventoId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  papel: z.enum(PAPEIS),
});

export async function adicionarMembro(atorId: string, entrada: z.infer<typeof membroSchema>) {
  const d = membroSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeGerir) throw new ErroDeNegocio("Apenas o gestor do evento monta a equipe.");
    const [achado] = await sql<{ id: string | null }>(
      "select app.usuario_por_email($1, $2)::text as id",
      [d.eventoId, d.email],
    );
    if (!achado?.id)
      throw new ErroDeNegocio(
        "Não há conta ativa com este e-mail. Peça à administração para criar a conta.",
      );
    await sql(
      `insert into evento_membros (evento_id, usuario_id, papel, criado_por) values ($1,$2,$3,$4)
       on conflict (evento_id, usuario_id) do update set papel = excluded.papel`,
      [d.eventoId, achado.id, d.papel, atorId],
    );
    await garantirUmGestor(sql, d.eventoId);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "definir_membro",
      entidade: "evento_membro",
      entidadeId: achado.id,
      detalhes: { papel: d.papel },
    });
    return { ok: true };
  });
}

export async function removerMembro(atorId: string, eventoId: string, usuarioId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, eventoId);
    if (!evento.podeGerir) throw new ErroDeNegocio("Apenas o gestor do evento monta a equipe.");
    await sql("delete from evento_membros where evento_id = $1 and usuario_id = $2", [
      eventoId,
      usuarioId,
    ]);
    await garantirUmGestor(sql, eventoId);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "remover_membro",
      entidade: "evento_membro",
      entidadeId: usuarioId,
    });
    return { ok: true };
  });
}

async function garantirUmGestor(sql: Sql, eventoId: string) {
  const [r] = await sql<{ n: number }>(
    "select count(*)::int as n from evento_membros where evento_id = $1 and papel = 'gestor'",
    [eventoId],
  );
  if (!r || r.n < 1) throw new ErroDeNegocio("O evento precisa de pelo menos um gestor.");
}
