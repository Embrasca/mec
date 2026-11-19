/** Etapa 6: indicadores ESG, pesquisa de satisfação e anexos de evidência. */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  acaoSocialSchema,
  equipeSchema,
  fornecedorEsgSchema,
  materialSchema,
  registroEsgSchema,
  registroEsgVazio,
  respostaSchema,
  type RegistroEsg,
  type Resposta,
} from "@/domain/esg/esquemas";
import {
  calcularIndicadores,
  ESSENCIAIS,
  pendenciasEssenciais,
  type DadosEsg,
  type FornecedorComEsg,
  type RespostaGravada,
} from "@/domain/esg/indicadores";
import { areaLocal, descreverArea, municipio } from "@/domain/territorio";
import { auditar, comoPublico, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel, type EventoResumo } from "./eventos.server";

const uuid = z.string().uuid();
const camel2snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

async function exigirEdicao(sql: Sql, eventoId: string): Promise<EventoResumo> {
  const evento = await eventoVisivel(sql, uuid.parse(eventoId));
  if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
  return evento;
}

// ---------------------------------------------------------------------
// Listas do evento (equipes, materiais, ações sociais)
// ---------------------------------------------------------------------

const LISTAS = {
  equipe: { tabela: "equipes_trabalho", schema: equipeSchema, nome: "Equipe" },
  material: { tabela: "destino_materiais", schema: materialSchema, nome: "Material" },
  acao_social: { tabela: "acoes_sociais", schema: acaoSocialSchema, nome: "Ação social" },
} as const;
export type Lista = keyof typeof LISTAS;
const CAMPOS: Record<Lista, string[]> = {
  equipe: Object.keys(equipeSchema._def.schema.shape),
  material: Object.keys(materialSchema.shape),
  acao_social: Object.keys(acaoSocialSchema.shape),
};

async function lerLista<T>(sql: Sql, lista: Lista, eventoId: string) {
  const cols = CAMPOS[lista]
    .map((c) =>
      c === "data" ? `to_char(data, 'YYYY-MM-DD') as data` : `${camel2snake(c)} as "${c}"`,
    )
    .join(", ");
  return sql<T & { id: string }>(
    `select id::text, ${cols} from ${LISTAS[lista].tabela} where evento_id = $1 order by criado_em, id`,
    [eventoId],
  );
}

export const salvarItemSchema = z.object({
  eventoId: z.string().uuid(),
  lista: z.enum(["equipe", "material", "acao_social"]),
  id: z.string().uuid().nullable(),
  dados: z.record(z.unknown()),
});

export async function salvarItem(atorId: string, entrada: z.input<typeof salvarItemSchema>) {
  const d = salvarItemSchema.parse(entrada);
  const def = LISTAS[d.lista];
  const dados = def.schema.parse(d.dados) as Record<string, unknown>;
  const campos = CAMPOS[d.lista];
  const valores = campos.map((c) => dados[c] ?? null);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update ${def.tabela} set ${campos.map((c, i) => `${camel2snake(c)} = $${i + 3}`).join(", ")},
                  atualizado_por = $${campos.length + 3}, atualizado_em = now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores, atorId],
        )
      : await sql<{ id: string }>(
          `insert into ${def.tabela} (evento_id, ${campos.map(camel2snake).join(", ")}, atualizado_por)
           values ($1, ${campos.map((_, i) => `$${i + 2}`).join(", ")}, $${campos.length + 2})
           returning id::text`,
          [d.eventoId, ...valores, atorId],
        );
    if (!r) throw new ErroDeNegocio(`${def.nome} não encontrada.`);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: `salvar_${d.lista}`,
      entidade: def.tabela,
      entidadeId: r.id,
    });
    return { id: r.id };
  });
}

export async function removerItem(atorId: string, eventoId: string, lista: Lista, id: string) {
  const def = LISTAS[z.enum(["equipe", "material", "acao_social"]).parse(lista)];
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, eventoId);
    const [r] = await sql<{ id: string }>(
      `delete from ${def.tabela} where id = $1 and evento_id = $2 returning id::text`,
      [uuid.parse(id), eventoId],
    );
    if (!r) throw new ErroDeNegocio(`${def.nome} não encontrada.`);
    await sql("delete from anexos where evento_id = $1 and entidade = $2 and entidade_id = $3", [
      eventoId,
      lista,
      id,
    ]);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: `remover_${lista}`,
      entidade: def.tabela,
      entidadeId: id,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Fornecedores (dados ESG)
// ---------------------------------------------------------------------

const CAMPOS_FORNECEDOR = Object.keys(fornecedorEsgSchema.shape);

async function lerFornecedoresEsg(sql: Sql, eventoId: string) {
  return sql<FornecedorComEsg & { id: string; tipo: string }>(
    `select id::text, nome, tipo, municipio_ibge as "municipioIbge", porte,
            valor_contratado::double precision as "valorContratado", lideranca,
            clausula_socioambiental as "clausulaSocioambiental",
            to_char(consulta_trabalho_escravo, 'YYYY-MM-DD') as "consultaTrabalhoEscravo",
            to_char(consulta_ibama, 'YYYY-MM-DD') as "consultaIbama",
            to_char(consulta_regularidade, 'YYYY-MM-DD') as "consultaRegularidade",
            certificacoes, valor_certificado::double precision as "valorCertificado"
     from fornecedores where evento_id = $1 order by lower(nome)`,
    [eventoId],
  );
}

export const salvarFornecedorEsgSchema = z.object({
  eventoId: z.string().uuid(),
  fornecedorId: z.string().uuid(),
  dados: fornecedorEsgSchema,
});

export async function salvarFornecedorEsg(
  atorId: string,
  entrada: z.input<typeof salvarFornecedorEsgSchema>,
) {
  const d = salvarFornecedorEsgSchema.parse(entrada);
  if (d.dados.municipioIbge !== null && !municipio(d.dados.municipioIbge))
    throw new ErroDeNegocio("Município inválido.");
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const valores = CAMPOS_FORNECEDOR.map((c) => (d.dados as Record<string, unknown>)[c] ?? null);
    const [r] = await sql<{ id: string }>(
      `update fornecedores set ${CAMPOS_FORNECEDOR.map((c, i) => `${camel2snake(c)} = $${i + 3}`).join(", ")},
              atualizado_por = $${CAMPOS_FORNECEDOR.length + 3}, atualizado_em = now()
       where id = $1 and evento_id = $2 returning id::text`,
      [d.fornecedorId, d.eventoId, ...valores, atorId],
    );
    if (!r) throw new ErroDeNegocio("Fornecedor não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_fornecedor_esg",
      entidade: "fornecedor",
      entidadeId: r.id,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Registro do evento (acessibilidade, bem-estar, não se aplica)
// ---------------------------------------------------------------------

async function lerRegistro(sql: Sql, eventoId: string) {
  const [r] = await sql<{ dados: unknown; versao: number }>(
    "select dados, versao from registros_esg where evento_id = $1",
    [eventoId],
  );
  return r
    ? { dados: registroEsgSchema.parse(r.dados), versao: r.versao }
    : { dados: registroEsgVazio(), versao: 0 };
}

export const salvarRegistroSchema = z.object({
  eventoId: z.string().uuid(),
  versao: z.number().int().min(0),
  dados: registroEsgSchema.refine(
    (r) => Object.keys(r.naoSeAplica).every((k) => ESSENCIAIS.includes(k)),
    "Só indicadores essenciais podem ser marcados como não se aplica.",
  ),
});

export async function salvarRegistro(
  atorId: string,
  entrada: z.input<typeof salvarRegistroSchema>,
) {
  const d = salvarRegistroSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const json = JSON.stringify(d.dados);
    const r =
      d.versao === 0
        ? await sql(
            `insert into registros_esg (evento_id, dados, atualizado_por) values ($1, $2, $3)
             on conflict (evento_id) do nothing returning versao`,
            [d.eventoId, json, atorId],
          )
        : await sql(
            `update registros_esg set dados = $2, atualizado_por = $3, atualizado_em = now(), versao = versao + 1
             where evento_id = $1 and versao = $4 returning versao`,
            [d.eventoId, json, atorId, d.versao],
          );
    if (r.length === 0)
      throw new ErroDeNegocio("O registro mudou enquanto você editava. Recarregue a página.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_registro_esg",
      entidade: "registro_esg",
      entidadeId: d.eventoId,
      detalhes: { naoSeAplica: Object.keys(d.dados.naoSeAplica) },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Pesquisa de satisfação
// ---------------------------------------------------------------------

const COLUNAS_RESPOSTA = Object.keys(respostaSchema.shape);
const SELECAO_RESPOSTA = COLUNAS_RESPOSTA.map((c) =>
  c === "notouSustentabilidade"
    ? `notou_sustentabilidade as "notouSustentabilidade"`
    : `${camel2snake(c)} as "${c}"`,
).join(", ");

async function lerPesquisa(sql: Sql, eventoId: string) {
  const [p] = await sql<{ token: string; aberta: boolean; nps: boolean }>(
    "select token, aberta, nps from pesquisas where evento_id = $1",
    [eventoId],
  );
  const respostas = await sql<
    RespostaGravada & {
      id: string;
      origem: string;
      importacaoId: string | null;
      recebidaEm: string;
    }
  >(
    `select id::text, origem, importacao_id::text as "importacaoId", ${SELECAO_RESPOSTA}, destaque,
            to_char(recebida_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "recebidaEm"
     from pesquisa_respostas where evento_id = $1 order by recebida_em desc`,
    [eventoId],
  );
  return { config: p ?? null, respostas };
}

const novoToken = () => randomBytes(32).toString("base64url");

export const configurarPesquisaSchema = z.object({
  eventoId: z.string().uuid(),
  aberta: z.boolean(),
  nps: z.boolean(),
  novoLink: z.boolean().default(false),
});

export async function configurarPesquisa(
  atorId: string,
  entrada: z.input<typeof configurarPesquisaSchema>,
) {
  const d = configurarPesquisaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento configura a pesquisa.");
    await sql(
      `insert into pesquisas (evento_id, token, aberta, nps, atualizado_por) values ($1, $2, $3, $4, $5)
       on conflict (evento_id) do update set aberta = excluded.aberta, nps = excluded.nps,
         token = case when $6 then excluded.token else pesquisas.token end,
         atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [d.eventoId, novoToken(), d.aberta, d.nps, atorId, d.novoLink],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "configurar_pesquisa",
      entidade: "pesquisa",
      entidadeId: d.eventoId,
      detalhes: { aberta: d.aberta, nps: d.nps, novoLink: d.novoLink },
    });
    return lerPesquisa(sql, d.eventoId);
  });
}

export const importarSchema = z.object({
  eventoId: z.string().uuid(),
  respostas: z.array(respostaSchema).min(1, "Nenhuma resposta válida.").max(20000),
});

export async function importarRespostasDaPesquisa(
  atorId: string,
  entrada: z.input<typeof importarSchema>,
) {
  const d = importarSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const importacaoId = crypto.randomUUID();
    await sql(
      `insert into pesquisa_respostas (evento_id, origem, importacao_id, ${COLUNAS_RESPOSTA.map(camel2snake).join(", ")})
       select $1, 'importacao', $2, ${COLUNAS_RESPOSTA.map((c) => `x."${c}"`).join(", ")}
       from jsonb_to_recordset($3::jsonb) as x(
         "satisfacao" smallint, "nps" smallint, "organizacao" smallint, "conteudo" smallint,
         "alimentacao" smallint, "acessibilidade" smallint, "sustentabilidade" smallint,
         "notouSustentabilidade" boolean, "meioTransporte" text, "municipioOrigem" integer, "comentario" text)`,
      [d.eventoId, importacaoId, JSON.stringify(d.respostas)],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "importar_respostas",
      entidade: "pesquisa",
      entidadeId: importacaoId,
      detalhes: { respostas: d.respostas.length },
    });
    return { importacaoId, importadas: d.respostas.length };
  });
}

export async function desfazerImportacao(atorId: string, eventoId: string, importacaoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    if (!evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento desfaz uma importação.");
    const r = await sql(
      "delete from pesquisa_respostas where evento_id = $1 and importacao_id = $2 returning id",
      [eventoId, uuid.parse(importacaoId)],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "desfazer_importacao",
      entidade: "pesquisa",
      entidadeId: importacaoId,
      detalhes: { removidas: r.length },
    });
    return { removidas: r.length };
  });
}

export async function destacarComentario(
  atorId: string,
  eventoId: string,
  respostaId: string,
  destaque: boolean,
) {
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, eventoId);
    const [r] = await sql(
      "update pesquisa_respostas set destaque = $3 where id = $1 and evento_id = $2 returning id",
      [uuid.parse(respostaId), eventoId, z.boolean().parse(destaque)],
    );
    if (!r) throw new ErroDeNegocio("Resposta não encontrada.");
    return { ok: true };
  });
}

/** Formulário público: dados mínimos do evento pelo código do link. */
export async function obterPesquisaPublica(token: string) {
  const t = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .safeParse(token);
  if (!t.success) throw new ErroDeNegocio("Link de pesquisa inválido.");
  const [p] = await comoPublico((sql) =>
    sql<{ nome: string; cidade: string; uf: string; aberta: boolean; nps: boolean }>(
      "select * from app.pesquisa_publica($1)",
      [t.data],
    ),
  );
  if (!p) throw new ErroDeNegocio("Link de pesquisa inválido.");
  return p;
}

export const responderSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Link de pesquisa inválido."),
  resposta: respostaSchema,
  /** Campo escondido do formulário: robôs costumam preencher. */
  site: z.string().max(0).optional(),
});

export async function responderPesquisa(entrada: z.input<typeof responderSchema>) {
  const d = responderSchema.parse(entrada);
  const r: Resposta = d.resposta;
  if (r.municipioOrigem !== null && !municipio(r.municipioOrigem))
    throw new ErroDeNegocio("Município de origem inválido.");
  await comoPublico((sql) =>
    sql("select app.responder_pesquisa($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [
      d.token,
      r.satisfacao,
      r.nps,
      r.organizacao,
      r.conteudo,
      r.alimentacao,
      r.acessibilidade,
      r.sustentabilidade,
      r.notouSustentabilidade,
      r.meioTransporte,
      r.municipioOrigem,
      r.comentario,
    ]),
  );
  return { ok: true };
}

// ---------------------------------------------------------------------
// Anexos de evidência
// ---------------------------------------------------------------------

export const TIPOS_DE_ANEXO = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "text/csv": null,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [0x50, 0x4b, 0x03, 0x04],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    0x50, 0x4b, 0x03, 0x04,
  ],
} as const;
export const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const ENTIDADES = [
  "equipe",
  "fornecedor",
  "material",
  "acao_social",
  "registro_esg",
  "pesquisa",
] as const;
const TABELA_DA_ENTIDADE: Partial<Record<(typeof ENTIDADES)[number], string>> = {
  equipe: "equipes_trabalho",
  fornecedor: "fornecedores",
  material: "destino_materiais",
  acao_social: "acoes_sociais",
};

export interface AnexoListado {
  id: string;
  entidade: string;
  entidadeId: string;
  nome: string;
  tipo: string;
  tamanho: number;
  enviadoPor: string;
  enviadoEm: string;
}

async function lerAnexos(sql: Sql, eventoId: string) {
  return sql<AnexoListado>(
    `select a.id::text, a.entidade, a.entidade_id as "entidadeId", a.nome, a.tipo, a.tamanho,
            u.nome as "enviadoPor", to_char(a.enviado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "enviadoEm"
     from anexos a join usuarios u on u.id = a.enviado_por where a.evento_id = $1 order by a.enviado_em`,
    [eventoId],
  );
}

export const enviarAnexoSchema = z.object({
  eventoId: z.string().uuid(),
  entidade: z.enum(ENTIDADES),
  entidadeId: z.string().min(1).max(80),
  nome: z.string().trim().min(1).max(200),
  tipo: z.enum(Object.keys(TIPOS_DE_ANEXO) as [keyof typeof TIPOS_DE_ANEXO]),
  base64: z.string().max(Math.ceil((TAMANHO_MAXIMO * 4) / 3) + 4),
});

export async function enviarAnexo(atorId: string, entrada: z.input<typeof enviarAnexoSchema>) {
  const d = enviarAnexoSchema.parse(entrada);
  const bytes = Buffer.from(d.base64, "base64");
  if (bytes.length === 0) throw new ErroDeNegocio("Arquivo vazio.");
  if (bytes.length > TAMANHO_MAXIMO) throw new ErroDeNegocio("O arquivo passa de 3 MB.");
  const assinatura = TIPOS_DE_ANEXO[d.tipo];
  if (assinatura && !assinatura.every((b, i) => bytes[i] === b))
    throw new ErroDeNegocio("O conteúdo do arquivo não corresponde ao tipo informado.");
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const tabela = TABELA_DA_ENTIDADE[d.entidade];
    if (tabela) {
      const [existe] = await sql(`select 1 from ${tabela} where id = $1 and evento_id = $2`, [
        uuid.parse(d.entidadeId),
        d.eventoId,
      ]);
      if (!existe) throw new ErroDeNegocio("Registro não encontrado para anexar.");
    } else if (!/^[A-Z]{2}\d$|^evento$/.test(d.entidadeId))
      throw new ErroDeNegocio("Registro não encontrado para anexar.");
    const [r] = await sql<{ id: string }>(
      `insert into anexos (evento_id, entidade, entidade_id, nome, tipo, tamanho, sha256, conteudo, enviado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text`,
      [
        d.eventoId,
        d.entidade,
        d.entidadeId,
        d.nome,
        d.tipo,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
        bytes,
        atorId,
      ],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "enviar_anexo",
      entidade: "anexo",
      entidadeId: r!.id,
      detalhes: { nome: d.nome, tamanho: bytes.length, entidade: d.entidade },
    });
    return { id: r!.id };
  });
}

export async function baixarAnexo(atorId: string, eventoId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    await eventoVisivel(sql, uuid.parse(eventoId));
    const [a] = await sql<{ nome: string; tipo: string; conteudo: Uint8Array }>(
      "select nome, tipo, conteudo from anexos where id = $1 and evento_id = $2",
      [uuid.parse(id), eventoId],
    );
    if (!a) throw new ErroDeNegocio("Anexo não encontrado.");
    return { nome: a.nome, tipo: a.tipo, base64: Buffer.from(a.conteudo).toString("base64") };
  });
}

export async function removerAnexo(atorId: string, eventoId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, eventoId);
    const [r] = await sql<{ nome: string }>(
      "delete from anexos where id = $1 and evento_id = $2 returning nome",
      [uuid.parse(id), eventoId],
    );
    if (!r) throw new ErroDeNegocio("Anexo não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "remover_anexo",
      entidade: "anexo",
      entidadeId: id,
      detalhes: { nome: r.nome },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------

export async function lerEsg(sql: Sql, evento: EventoResumo) {
  const area = evento.municipioIbge ? areaLocal(evento.municipioIbge) : null;
  const [ficha] = await sql<{ participantes: number | null }>(
    `select (dados->>'participantesTotal')::double precision as participantes
     from caracterizacoes where evento_id = $1`,
    [evento.id],
  );
  const equipes = await lerLista<z.infer<typeof equipeSchema>>(sql, "equipe", evento.id);
  const materiais = await lerLista<z.infer<typeof materialSchema>>(sql, "material", evento.id);
  const acoes = await lerLista<z.infer<typeof acaoSocialSchema>>(sql, "acao_social", evento.id);
  const fornecedores = await lerFornecedoresEsg(sql, evento.id);
  const registro = await lerRegistro(sql, evento.id);
  const pesquisa = await lerPesquisa(sql, evento.id);
  const dados: DadosEsg = {
    areaLocal: area?.municipios ?? null,
    participantes: ficha?.participantes ?? null,
    equipes,
    fornecedores,
    materiais,
    acoes,
    registro: registro.dados,
    respostas: pesquisa.respostas,
    npsHabilitado: pesquisa.config?.nps ?? false,
  };
  const indicadores = calcularIndicadores(dados);
  return {
    evento,
    area: { descricao: descreverArea(area), criterio: area?.criterio ?? null },
    participantes: dados.participantes,
    equipes,
    materiais,
    acoes,
    fornecedores,
    registro,
    pesquisa,
    anexos: await lerAnexos(sql, evento.id),
    indicadores,
    pendencias: pendenciasEssenciais(indicadores),
  };
}

export async function obterEsg(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) =>
    lerEsg(sql, await eventoVisivel(sql, uuid.parse(eventoId))),
  );
}

export type { RegistroEsg };
