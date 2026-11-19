import { z } from "zod";
import {
  calcularColeta,
  coletaSchema,
  coletaVazia,
  type Coleta,
} from "@/domain/metodologia/coleta";
import {
  acompanhar,
  fornecedorSchema,
  type DadosDoFornecedor,
} from "@/domain/metodologia/fornecedores";
import {
  calcularInventario,
  type BaseDeFatores,
  type FatorDoItem,
  type LinhaDeInventario,
} from "@/domain/metodologia/inventario";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel, type EventoResumo } from "./eventos.server";
import { exigirAdmin } from "./usuarios.server";

const uuid = z.string().uuid();
const ETAPA = z.enum(["ex_ante", "ex_post"]);
type Etapa = z.infer<typeof ETAPA>;

// ---------------------------------------------------------------------
// Base de fatores
// ---------------------------------------------------------------------

export interface ResumoDaBase {
  id: string;
  nome: string;
  situacao: "rascunho" | "publicada";
  referenciaGwp: string;
  gwpCh4: number;
  gwpN2o: number;
  observacao: string | null;
  derivadaDe: string | null;
  publicadaEm: string | null;
  eventos: number;
}

const COLUNAS_BASE = `b.id::text, b.nome, b.situacao, b.referencia_gwp as "referenciaGwp", b.gwp_ch4 as "gwpCh4",
  b.gwp_n2o as "gwpN2o", b.observacao, d.nome as "derivadaDe",
  to_char(b.publicada_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "publicadaEm",
  (select count(*)::int from eventos e where e.base_fatores_id = b.id) as eventos`;

export async function listarBases(atorId: string) {
  return comoUsuario(atorId, (sql) =>
    sql<ResumoDaBase>(
      `select ${COLUNAS_BASE} from bases_fatores b left join bases_fatores d on d.id = b.derivada_de
       order by b.situacao desc, b.publicada_em desc nulls first, b.nome`,
    ),
  );
}

/** Carrega a base no formato do motor de cálculo. */
export async function carregarBase(
  sql: Sql,
  baseId: string,
): Promise<ResumoDaBase & BaseDeFatores> {
  const [b] = await sql<ResumoDaBase>(
    `select ${COLUNAS_BASE} from bases_fatores b left join bases_fatores d on d.id = b.derivada_de where b.id = $1`,
    [baseId],
  );
  if (!b) throw new ErroDeNegocio("Base de fatores não encontrada.");
  const itens = await sql<{
    codigo: string;
    categoria: string;
    item: string;
    unidade: string;
    escopo: 1 | 2 | 3;
    fe_co2: number | null;
    fe_ch4: number;
    fe_n2o: number;
    fe_biogenico: number;
    regra: "fixo" | "sin";
    multiplicador: number | null;
    fonte: string;
    situacao: string;
  }>(
    `select codigo, categoria, item, unidade, escopo, fe_co2, fe_ch4, fe_n2o, fe_biogenico, regra,
            multiplicador, fonte, situacao
     from fatores where base_id = $1
     order by split_part(categoria, ' ', 1)::int, codigo, item`,
    [baseId],
  );
  const sin = await sql<{ ano: number; valor: number }>(
    "select ano, valor from fatores_sin where base_id = $1 order by ano",
    [baseId],
  );
  return {
    ...b,
    sin,
    itens: itens.map((i): FatorDoItem => ({
      codigo: i.codigo,
      categoria: i.categoria,
      item: i.item,
      unidade: i.unidade,
      escopo: i.escopo,
      feCo2: i.fe_co2,
      feCh4: i.fe_ch4,
      feN2o: i.fe_n2o,
      feBiogenico: i.fe_biogenico,
      regra:
        i.regra === "sin" ? { tipo: "sin", multiplicador: i.multiplicador ?? 1 } : { tipo: "fixo" },
      fonte: i.fonte,
      situacao: i.situacao,
    })),
  };
}

export async function obterBase(atorId: string, baseId: string) {
  return comoUsuario(atorId, (sql) => carregarBase(sql, uuid.parse(baseId)));
}

export const novaVersaoSchema = z.object({
  deBaseId: z.string().uuid(),
  nome: z.string().trim().min(3, "Dê um nome à nova versão.").max(120),
  observacao: z.string().trim().max(2000).nullable(),
});

/** Nova versão em rascunho, copiada de outra base. */
export async function criarVersaoDaBase(atorId: string, entrada: z.input<typeof novaVersaoSchema>) {
  const d = novaVersaoSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [nova] = await sql<{ id: string }>(
      `insert into bases_fatores (nome, gwp_ch4, gwp_n2o, referencia_gwp, observacao, derivada_de, criada_por)
       select $2, gwp_ch4, gwp_n2o, referencia_gwp, $3, id, $4 from bases_fatores where id = $1
       returning id::text`,
      [d.deBaseId, d.nome, d.observacao, atorId],
    );
    if (!nova) throw new ErroDeNegocio("Base de origem não encontrada.");
    await sql(
      `insert into fatores (base_id, item, codigo, categoria, unidade, escopo, fe_co2, fe_ch4, fe_n2o,
                            fe_biogenico, regra, multiplicador, fonte, situacao)
       select $2, item, codigo, categoria, unidade, escopo, fe_co2, fe_ch4, fe_n2o, fe_biogenico, regra,
              multiplicador, fonte, situacao from fatores where base_id = $1`,
      [d.deBaseId, nova.id],
    );
    await sql(
      "insert into fatores_sin (base_id, ano, valor) select $2, ano, valor from fatores_sin where base_id = $1",
      [d.deBaseId, nova.id],
    );
    await auditar(sql, {
      usuarioId: atorId,
      acao: "criar_versao_base",
      entidade: "base_fatores",
      entidadeId: nova.id,
      detalhes: d,
    });
    return { id: nova.id };
  });
}

export const alteracaoDeFatorSchema = z.object({
  baseId: z.string().uuid(),
  item: z.string().min(1).max(200),
  feCo2: z.number().finite().min(0).nullable(),
  feCh4: z.number().finite().min(0),
  feN2o: z.number().finite().min(0),
  feBiogenico: z.number().finite().min(0),
  fonte: z.string().trim().min(1, "Informe a fonte do fator.").max(2000),
  situacao: z.string().trim().min(1).max(300),
});

export async function alterarFator(
  atorId: string,
  entrada: z.input<typeof alteracaoDeFatorSchema>,
) {
  const d = alteracaoDeFatorSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [l] = await sql<{ item: string }>(
      `update fatores set fe_co2 = case when regra = 'sin' then null else $3::double precision end, fe_ch4 = $4, fe_n2o = $5,
              fe_biogenico = $6, fonte = $7, situacao = $8
       where base_id = $1 and item = $2 returning item`,
      [d.baseId, d.item, d.feCo2, d.feCh4, d.feN2o, d.feBiogenico, d.fonte, d.situacao],
    );
    if (!l) throw new ErroDeNegocio("Fator não encontrado nesta base.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "alterar_fator",
      entidade: "fator",
      entidadeId: d.item,
      detalhes: d,
    });
    return { ok: true };
  });
}

export const sinSchema = z.object({
  baseId: z.string().uuid(),
  ano: z.number().int().min(2000).max(2100),
  valor: z.number().finite().min(0).max(5),
});

export async function definirFatorSin(atorId: string, entrada: z.input<typeof sinSchema>) {
  const d = sinSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    await sql(
      `insert into fatores_sin (base_id, ano, valor) values ($1, $2, $3)
       on conflict (base_id, ano) do update set valor = excluded.valor`,
      [d.baseId, d.ano, d.valor],
    );
    await auditar(sql, {
      usuarioId: atorId,
      acao: "definir_fator_sin",
      entidade: "base_fatores",
      entidadeId: d.baseId,
      detalhes: d,
    });
    return { ok: true };
  });
}

export async function publicarBase(atorId: string, baseId: string) {
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [b] = await sql<{ id: string }>(
      "update bases_fatores set situacao = 'publicada' where id = $1 and situacao = 'rascunho' returning id::text",
      [uuid.parse(baseId)],
    );
    if (!b) throw new ErroDeNegocio("Só um rascunho pode ser publicado.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "publicar_base",
      entidade: "base_fatores",
      entidadeId: baseId,
    });
    return { ok: true };
  });
}

export async function excluirRascunho(atorId: string, baseId: string) {
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [b] = await sql<{ id: string }>(
      "delete from bases_fatores where id = $1 and situacao = 'rascunho' returning id::text",
      [uuid.parse(baseId)],
    );
    if (!b) throw new ErroDeNegocio("Só um rascunho pode ser excluído.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "excluir_rascunho_base",
      entidade: "base_fatores",
      entidadeId: baseId,
    });
    return { ok: true };
  });
}

/** Base publicada mais recente, usada por padrão em evento novo. */
export async function basePadrao(sql: Sql): Promise<string | null> {
  const [b] = await sql<{ id: string }>(
    "select id::text from bases_fatores where situacao = 'publicada' order by publicada_em desc limit 1",
  );
  return b?.id ?? null;
}

export async function definirBaseDoEvento(atorId: string, eventoId: string, baseId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    if (!evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento escolhe a base de fatores.");
    await sql("update eventos set base_fatores_id = $2 where id = $1", [
      eventoId,
      uuid.parse(baseId),
    ]);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "definir_base_fatores",
      entidade: "evento",
      entidadeId: eventoId,
      detalhes: { baseId },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Inventário
// ---------------------------------------------------------------------

async function anoDoInventario(sql: Sql, evento: EventoResumo): Promise<number> {
  const [c] = await sql<{ ano: number | null }>(
    "select (dados->>'anoInventario')::int as ano from caracterizacoes where evento_id = $1",
    [evento.id],
  );
  return c?.ano ?? Number(evento.dataInicio.slice(0, 4));
}

async function baseDoEvento(sql: Sql, evento: EventoResumo) {
  if (!evento.baseFatoresId) throw new ErroDeNegocio("O evento ainda não tem base de fatores.");
  return carregarBase(sql, evento.baseFatoresId);
}

interface LinhaGravada extends LinhaDeInventario {
  id: string;
  origem: "manual" | "coleta";
}

export async function lerInventario(sql: Sql, eventoId: string, etapa: Etapa) {
  const evento = await eventoVisivel(sql, eventoId);
  const base = await baseDoEvento(sql, evento);
  const ano = await anoDoInventario(sql, evento);
  const [cab] = await sql<{
    versao: number;
    fechado_em: string | null;
    fechado_por: string | null;
    atualizado_em: string;
    atualizado_por: string;
  }>(
    `select i.versao, to_char(i.fechado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fechado_em,
            uf.nome as fechado_por, to_char(i.atualizado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as atualizado_em,
            ua.nome as atualizado_por
     from inventarios i left join usuarios uf on uf.id = i.fechado_por left join usuarios ua on ua.id = i.atualizado_por
     where i.evento_id = $1 and i.etapa = $2`,
    [eventoId, etapa],
  );
  const linhas = await sql<LinhaGravada>(
    `select id::text, fornecedor, item, descricao, quantidade, premissa, origem
     from inventario_linhas where evento_id = $1 and etapa = $2 order by ordem`,
    [eventoId, etapa],
  );
  return {
    evento,
    base: { id: base.id, nome: base.nome, referenciaGwp: base.referenciaGwp },
    baseCompleta: base,
    ano,
    versao: cab?.versao ?? 0,
    atualizadoEm: cab?.atualizado_em ?? null,
    atualizadoPor: cab?.atualizado_por ?? null,
    fechadoEm: cab?.fechado_em ?? null,
    fechadoPor: cab?.fechado_por ?? null,
    linhas,
    resultado: calcularInventario(linhas, base, ano, evento.nivel),
  };
}

export async function obterInventario(atorId: string, eventoId: string, etapa: Etapa) {
  return comoUsuario(atorId, (sql) => lerInventario(sql, uuid.parse(eventoId), ETAPA.parse(etapa)));
}

const linhaSchema = z.object({
  fornecedor: z.string().trim().max(120).nullable(),
  item: z.string().trim().max(200).nullable(),
  descricao: z.string().trim().max(200).nullable(),
  quantidade: z.number().finite().min(0, "Quantidade não pode ser negativa.").max(1e12).nullable(),
  premissa: z.string().trim().max(2000).nullable(),
  origem: z.enum(["manual", "coleta"]).default("manual"),
});

export const salvarInventarioSchema = z.object({
  eventoId: z.string().uuid(),
  etapa: ETAPA,
  versao: z.number().int().min(0),
  linhas: z.array(linhaSchema).max(500),
});

async function gravarLinhas(
  sql: Sql,
  atorId: string,
  eventoId: string,
  etapa: Etapa,
  versao: number,
  linhas: z.infer<typeof linhaSchema>[],
) {
  const gravado =
    versao === 0
      ? await sql(
          `insert into inventarios (evento_id, etapa, atualizado_por) values ($1, $2, $3)
           on conflict (evento_id, etapa) do nothing returning versao`,
          [eventoId, etapa, atorId],
        )
      : await sql(
          `update inventarios set versao = versao + 1, atualizado_por = $3, atualizado_em = now()
           where evento_id = $1 and etapa = $2 and versao = $4 and fechado_em is null returning versao`,
          [eventoId, etapa, atorId, versao],
        );
  if (gravado.length === 0)
    throw new ErroDeNegocio(
      "O inventário mudou enquanto você editava, ou já foi fechado. Recarregue para ver a versão atual.",
    );
  await sql("delete from inventario_linhas where evento_id = $1 and etapa = $2", [eventoId, etapa]);
  const uteis = linhas.filter((l) => l.item || l.quantidade !== null || l.premissa);
  if (uteis.length > 0)
    await sql(
      `insert into inventario_linhas (evento_id, etapa, ordem, fornecedor, item, descricao, quantidade, premissa, origem)
       select $1, $2, x.ordem, x.fornecedor, x.item, x.descricao, x.quantidade, x.premissa, x.origem
       from jsonb_to_recordset($3::jsonb)
         as x(ordem int, fornecedor text, item text, descricao text, quantidade double precision, premissa text, origem text)`,
      [eventoId, etapa, JSON.stringify(uteis.map((l, ordem) => ({ ...l, ordem })))],
    );
}

export async function salvarInventario(
  atorId: string,
  entrada: z.input<typeof salvarInventarioSchema>,
) {
  const d = salvarInventarioSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const base = await baseDoEvento(sql, evento);
    const nomes = new Set(base.itens.map((i) => i.item));
    const fora = d.linhas.find((l) => l.item && !nomes.has(l.item));
    if (fora)
      throw new ErroDeNegocio(`O item “${fora.item}” não está na base de fatores do evento.`);
    await gravarLinhas(sql, atorId, d.eventoId, d.etapa, d.versao, d.linhas);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_inventario",
      entidade: "inventario",
      entidadeId: d.etapa,
      detalhes: { linhas: d.linhas.length },
    });
    return lerInventario(sql, d.eventoId, d.etapa);
  });
}

export async function fecharInventario(
  atorId: string,
  eventoId: string,
  etapa: Etapa,
  versao: number,
) {
  return comoUsuario(atorId, async (sql) => {
    const atual = await lerInventario(sql, uuid.parse(eventoId), ETAPA.parse(etapa));
    if (!atual.evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento fecha o inventário.");
    if (atual.fechadoEm) throw new ErroDeNegocio("O inventário já está fechado.");
    if (atual.versao !== versao)
      throw new ErroDeNegocio("O inventário mudou. Recarregue antes de fechar.");
    if (atual.linhas.length === 0) throw new ErroDeNegocio("O inventário está vazio.");
    if (atual.resultado.pendencias > 0)
      throw new ErroDeNegocio(`Resolva os ${atual.resultado.pendencias} alertas antes de fechar.`);
    await sql(
      `update inventarios set fechado_em = now(), fechado_por = $3, base_fatores_id = $4, resultado = $5
       where evento_id = $1 and etapa = $2`,
      [
        eventoId,
        etapa,
        atorId,
        atual.base.id,
        JSON.stringify({ ano: atual.ano, ...atual.resultado }),
      ],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "fechar_inventario",
      entidade: "inventario",
      entidadeId: etapa,
      detalhes: { total: atual.resultado.totais.total, base: atual.base.nome },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------

async function lerColeta(sql: Sql, eventoId: string, etapa: Etapa) {
  const evento = await eventoVisivel(sql, eventoId);
  const [c] = await sql<{ dados: unknown; versao: number; em: string; por: string }>(
    `select c.dados, c.versao, to_char(c.atualizado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as em,
            u.nome as por
     from coletas c left join usuarios u on u.id = c.atualizado_por where c.evento_id = $1 and c.etapa = $2`,
    [eventoId, etapa],
  );
  const dados: Coleta = c ? coletaSchema.parse(c.dados) : coletaVazia();
  return {
    evento,
    dados,
    versao: c?.versao ?? 0,
    atualizadoEm: c?.em ?? null,
    atualizadoPor: c?.por ?? null,
    calculo: calcularColeta(dados),
  };
}

export async function obterColeta(atorId: string, eventoId: string, etapa: Etapa) {
  return comoUsuario(atorId, (sql) => lerColeta(sql, uuid.parse(eventoId), ETAPA.parse(etapa)));
}

export const salvarColetaSchema = z.object({
  eventoId: z.string().uuid(),
  etapa: ETAPA,
  versao: z.number().int().min(0),
  dados: coletaSchema,
});

export async function salvarColeta(atorId: string, entrada: z.input<typeof salvarColetaSchema>) {
  const d = salvarColetaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const json = JSON.stringify(d.dados);
    const r =
      d.versao === 0
        ? await sql(
            `insert into coletas (evento_id, etapa, dados, atualizado_por) values ($1,$2,$3,$4)
             on conflict (evento_id, etapa) do nothing returning versao`,
            [d.eventoId, d.etapa, json, atorId],
          )
        : await sql(
            `update coletas set dados = $3, versao = versao + 1, atualizado_por = $4, atualizado_em = now()
             where evento_id = $1 and etapa = $2 and versao = $5 returning versao`,
            [d.eventoId, d.etapa, json, atorId, d.versao],
          );
    if (r.length === 0)
      throw new ErroDeNegocio("Outra pessoa salvou a coleta enquanto você editava. Recarregue.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_coleta",
      entidade: "coleta",
      entidadeId: d.etapa,
    });
    return lerColeta(sql, d.eventoId, d.etapa);
  });
}

/**
 * Leva o resumo da coleta para o inventário da mesma etapa: atualiza as linhas
 * que vieram da coleta e acrescenta as que faltam. Linhas digitadas à mão ficam.
 */
export async function lancarColetaNoInventario(atorId: string, eventoId: string, etapa: Etapa) {
  return comoUsuario(atorId, async (sql) => {
    const coleta = await lerColeta(sql, uuid.parse(eventoId), ETAPA.parse(etapa));
    if (!coleta.evento.podeEditar)
      throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const inv = await lerInventario(sql, eventoId, etapa);
    if (inv.fechadoEm) throw new ErroDeNegocio("O inventário está fechado.");
    const doResumo = coleta.calculo.resumo.filter((r) => r.quantidade > 0);
    if (doResumo.length === 0)
      throw new ErroDeNegocio("A coleta ainda não tem quantidades para lançar.");
    const linhas = inv.linhas.map((l) => ({ ...l }));
    let atualizadas = 0;
    let novas = 0;
    for (const r of doResumo) {
      const existente = linhas.find((l) => l.origem === "coleta" && l.item === r.item);
      if (existente) {
        existente.quantidade = r.quantidade;
        atualizadas++;
      } else {
        linhas.push({
          id: "",
          fornecedor: null,
          item: r.item,
          descricao: null,
          quantidade: r.quantidade,
          premissa: `Calculado na coleta (${r.quadro})`,
          origem: "coleta",
        });
        novas++;
      }
    }
    await gravarLinhas(sql, atorId, eventoId, etapa, inv.versao, linhas);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "lancar_coleta",
      entidade: "inventario",
      entidadeId: etapa,
      detalhes: { atualizadas, novas },
    });
    return { atualizadas, novas };
  });
}

// ---------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------

export interface FornecedorAcompanhado extends DadosDoFornecedor {
  id: string;
  prazo: string;
  situacao: string;
  alerta: string;
  linhasExAnte: number;
  linhasExPost: number;
}

export async function listarFornecedores(atorId: string, eventoId: string, hoje: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const linhas = await sql<DadosDoFornecedor & { id: string; ante: number; post: number }>(
      `select f.id::text, f.nome, f.tipo, f.contato,
              to_char(f.enviado_em, 'YYYY-MM-DD') as "enviadoEm", to_char(f.recebido_em, 'YYYY-MM-DD') as "recebidoEm",
              f.ha_subcontratados as "haSubcontratados", f.subcontratados_incluidos as "subcontratadosIncluidos",
              f.observacao,
              (select count(*)::int from inventario_linhas l where l.evento_id = f.evento_id and l.etapa = 'ex_ante' and l.fornecedor = f.tipo) as ante,
              (select count(*)::int from inventario_linhas l where l.evento_id = f.evento_id and l.etapa = 'ex_post' and l.fornecedor = f.tipo) as post
       from fornecedores f where f.evento_id = $1 order by lower(f.nome)`,
      [evento.id],
    );
    const dia = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(hoje);
    return {
      evento,
      fornecedores: linhas.map(({ ante, post, ...f }): FornecedorAcompanhado => ({
        ...f,
        ...acompanhar(f, evento.dataFim, dia),
        linhasExAnte: ante,
        linhasExPost: post,
      })),
    };
  });
}

export const salvarFornecedorSchema = z.object({
  eventoId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  dados: fornecedorSchema,
});

export async function salvarFornecedor(
  atorId: string,
  entrada: z.input<typeof salvarFornecedorSchema>,
) {
  const d = salvarFornecedorSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const f = d.dados;
    const valores = [
      f.nome,
      f.tipo,
      f.contato,
      f.enviadoEm,
      f.recebidoEm,
      f.haSubcontratados,
      f.subcontratadosIncluidos,
      f.observacao,
      atorId,
    ];
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update fornecedores set nome=$3, tipo=$4, contato=$5, enviado_em=$6, recebido_em=$7, ha_subcontratados=$8,
                  subcontratados_incluidos=$9, observacao=$10, atualizado_por=$11, atualizado_em=now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores],
        )
      : await sql<{ id: string }>(
          `insert into fornecedores (evento_id, nome, tipo, contato, enviado_em, recebido_em, ha_subcontratados,
                                     subcontratados_incluidos, observacao, atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id::text`,
          [d.eventoId, ...valores],
        );
    if (!r) throw new ErroDeNegocio("Fornecedor não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_fornecedor",
      entidade: "fornecedor",
      entidadeId: r.id,
    });
    return { id: r.id };
  });
}

export async function removerFornecedor(atorId: string, eventoId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const [r] = await sql<{ id: string }>(
      "delete from fornecedores where id = $1 and evento_id = $2 returning id::text",
      [uuid.parse(id), eventoId],
    );
    if (!r) throw new ErroDeNegocio("Fornecedor não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "remover_fornecedor",
      entidade: "fornecedor",
      entidadeId: id,
    });
    return { ok: true };
  });
}
