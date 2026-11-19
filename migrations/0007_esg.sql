-- =====================================================================
-- Etapa 6: ESG além do GEE. Mão de obra local, cadeia de suprimentos,
-- responsabilidade social, pesquisa de satisfação (com resposta pública e
-- anônima) e anexos de evidência. Indicadores aprovados pela equipe.
-- =====================================================================

-- Município do evento (código IBGE): define a área local (D1).
alter table eventos add column municipio_ibge integer check (municipio_ibge between 1000000 and 9999999);

-- ---------------------------------------------------------------------
-- Mão de obra local
-- ---------------------------------------------------------------------
create table equipes_trabalho (
  id                         uuid primary key default gen_random_uuid(),
  evento_id                  uuid not null references eventos(id) on delete cascade,
  nome                       text not null check (length(nome) between 1 and 200),
  vinculo                    text not null check (vinculo in ('Própria', 'Terceirizada', 'Voluntária')),
  fase                       text not null check (fase in ('Montagem', 'Realização', 'Desmontagem')),
  pessoas                    integer not null check (pessoas between 1 and 1000000),
  pessoas_locais             integer check (pessoas_locais between 0 and pessoas),
  modo_horas                 text check (modo_horas in ('Pessoas × horas médias', 'Total da escala')),
  horas_por_pessoa           double precision check (horas_por_pessoa between 0 and 1440),
  horas_totais               double precision check (horas_totais >= 0),
  horas_locais               double precision check (horas_locais >= 0),
  formalizadas               integer check (formalizadas between 0 and pessoas),
  mulheres                   integer check (mulheres between 0 and pessoas),
  negras                     integer check (negras between 0 and pessoas),
  pcd                        integer check (pcd between 0 and pessoas),
  jovens                     integer check (jovens between 0 and pessoas),
  capacitadas                integer check (capacitadas between 0 and pessoas),
  horas_capacitacao          double precision check (horas_capacitacao >= 0),
  acidentes_com_afastamento  integer check (acidentes_com_afastamento >= 0),
  acidentes_sem_afastamento  integer check (acidentes_sem_afastamento >= 0),
  evidencia                  text check (length(evidencia) <= 1000),
  criado_em                  timestamptz not null default now(),
  atualizado_por             uuid not null references usuarios(id),
  atualizado_em              timestamptz not null default now()
);
create index equipes_trabalho_evento on equipes_trabalho (evento_id);

-- ---------------------------------------------------------------------
-- Cadeia de suprimentos: dados a mais de cada fornecedor e destino dos materiais
-- ---------------------------------------------------------------------
alter table fornecedores
  add column municipio_ibge            integer check (municipio_ibge between 1000000 and 9999999),
  add column porte                     text check (porte in ('MEI', 'ME', 'EPP', 'Demais')),
  add column valor_contratado          numeric(14, 2) check (valor_contratado >= 0),
  add column lideranca                 text[] not null default '{}'
    check (lideranca <@ array['Mulheres', 'Pessoas negras', 'Pessoas indígenas']),
  add column clausula_socioambiental   boolean,
  add column consulta_trabalho_escravo date,
  add column consulta_ibama            date,
  add column consulta_regularidade     date,
  add column certificacoes             text check (length(certificacoes) <= 500),
  add column valor_certificado         numeric(14, 2) check (valor_certificado >= 0);

create table destino_materiais (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  material       text not null check (length(material) between 1 and 200),
  quantidade     double precision not null check (quantidade >= 0),
  unidade        text not null check (unidade in ('itens', 'kg', 'm²', 'm³')),
  destino        text not null check (destino in ('Reutilizado', 'Doado', 'Devolvido ao fornecedor', 'Descartado')),
  receptor       text check (length(receptor) <= 200),
  evidencia      text check (length(evidencia) <= 1000),
  criado_em      timestamptz not null default now(),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now()
);
create index destino_materiais_evento on destino_materiais (evento_id);

-- ---------------------------------------------------------------------
-- Responsabilidade social
-- ---------------------------------------------------------------------
create table acoes_sociais (
  id                    uuid primary key default gen_random_uuid(),
  evento_id             uuid not null references eventos(id) on delete cascade,
  tipo                  text not null check (tipo in ('Capacitação', 'Doação', 'Acessibilidade', 'Inclusão',
                                                      'Engajamento comunitário', 'Voluntariado')),
  descricao             text not null check (length(descricao) between 1 and 1000),
  parceiro              text check (length(parceiro) <= 200),
  local                 text check (length(local) <= 200),
  data                  date,
  pessoas_beneficiadas  integer check (pessoas_beneficiadas >= 0),
  alimentos_kg          double precision check (alimentos_kg >= 0),
  itens_doados          integer check (itens_doados >= 0),
  instituicao_receptora text check (length(instituicao_receptora) <= 200),
  evidencia             text check (length(evidencia) <= 1000),
  criado_em             timestamptz not null default now(),
  atualizado_por        uuid not null references usuarios(id),
  atualizado_em         timestamptz not null default now()
);
create index acoes_sociais_evento on acoes_sociais (evento_id);

-- Acessibilidade, bem-estar do público e "não se aplica" dos essenciais.
create table registros_esg (
  evento_id      uuid primary key references eventos(id) on delete cascade,
  dados          jsonb not null,
  versao         integer not null default 1,
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pesquisa de satisfação
-- ---------------------------------------------------------------------
create table pesquisas (
  evento_id      uuid primary key references eventos(id) on delete cascade,
  -- Código do link público: 32 bytes aleatórios em base64url.
  token          text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  aberta         boolean not null default true,
  nps            boolean not null default false,
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now()
);

create table pesquisa_respostas (
  id                     uuid primary key default gen_random_uuid(),
  evento_id              uuid not null references eventos(id) on delete cascade,
  origem                 text not null check (origem in ('link', 'importacao')),
  importacao_id          uuid,
  satisfacao             smallint not null check (satisfacao between 1 and 5),
  nps                    smallint check (nps between 0 and 10),
  organizacao            smallint check (organizacao between 1 and 5),
  conteudo               smallint check (conteudo between 1 and 5),
  alimentacao            smallint check (alimentacao between 1 and 5),
  acessibilidade         smallint check (acessibilidade between 1 and 5),
  sustentabilidade       smallint check (sustentabilidade between 1 and 5),
  notou_sustentabilidade boolean,
  meio_transporte        text check (meio_transporte in ('A pé ou bicicleta', 'Ônibus ou metrô', 'Carro',
                           'Táxi ou aplicativo', 'Avião', 'Ônibus fretado ou rodoviário', 'Outro')),
  municipio_origem       integer check (municipio_origem between 1000000 and 9999999),
  comentario             text check (length(comentario) <= 1000),
  destaque               boolean not null default false,
  recebida_em            timestamptz not null default now(),
  check ((origem = 'importacao') = (importacao_id is not null))
);
create index pesquisa_respostas_evento on pesquisa_respostas (evento_id);

-- Resposta pública (sem login): só por esta função, com o código do link.
-- Não devolve nada sobre o evento além de "recebida".
create or replace function app.responder_pesquisa(
  p_token text, p_satisfacao smallint, p_nps smallint, p_organizacao smallint, p_conteudo smallint,
  p_alimentacao smallint, p_acessibilidade smallint, p_sustentabilidade smallint,
  p_notou boolean, p_meio text, p_municipio integer, p_comentario text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev uuid;
  quer_nps boolean;
begin
  select evento_id, nps into ev, quer_nps from pesquisas where token = p_token and aberta;
  if ev is null then
    raise exception 'Esta pesquisa não está aberta.' using errcode = 'check_violation';
  end if;
  -- Teto de respostas por evento, contra abuso do link.
  if (select count(*) from pesquisa_respostas where evento_id = ev and origem = 'link') >= 50000 then
    raise exception 'Esta pesquisa atingiu o limite de respostas.' using errcode = 'check_violation';
  end if;
  insert into pesquisa_respostas (evento_id, origem, satisfacao, nps, organizacao, conteudo, alimentacao,
    acessibilidade, sustentabilidade, notou_sustentabilidade, meio_transporte, municipio_origem, comentario)
  values (ev, 'link', p_satisfacao, case when quer_nps then p_nps end, p_organizacao, p_conteudo,
    p_alimentacao, p_acessibilidade, p_sustentabilidade, p_notou, p_meio, p_municipio, p_comentario);
  return true;
end $$;

-- Dados mínimos para mostrar o formulário público.
create or replace function app.pesquisa_publica(p_token text)
returns table (nome text, cidade text, uf text, aberta boolean, nps boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.nome, e.cidade, e.uf, p.aberta, p.nps
  from pesquisas p join eventos e on e.id = p.evento_id
  where p.token = p_token and e.arquivado_em is null
$$;

-- Papel do formulário público: só executa as duas funções acima.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mec_publico') then
    create role mec_publico nologin;
  end if;
end $$;
do $$ begin execute format('grant mec_publico to %I', current_user); end $$;
grant usage on schema app to mec_publico;
revoke all on function app.responder_pesquisa(text, smallint, smallint, smallint, smallint, smallint,
  smallint, smallint, boolean, text, integer, text) from public;
revoke all on function app.pesquisa_publica(text) from public;
grant execute on function app.responder_pesquisa(text, smallint, smallint, smallint, smallint, smallint,
  smallint, smallint, boolean, text, integer, text) to mec_publico;
grant execute on function app.pesquisa_publica(text) to mec_publico;

-- ---------------------------------------------------------------------
-- Anexos de evidência (D5): arquivos guardados no próprio banco, até 3 MB.
-- ---------------------------------------------------------------------
create table anexos (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references eventos(id) on delete cascade,
  entidade    text not null check (entidade in ('equipe', 'fornecedor', 'material', 'acao_social',
                                                'registro_esg', 'pesquisa')),
  entidade_id text not null check (length(entidade_id) between 1 and 80),
  nome        text not null check (length(nome) between 1 and 200),
  tipo        text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  tamanho     integer not null check (tamanho between 1 and 3145728),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  conteudo    bytea not null,
  enviado_por uuid not null references usuarios(id),
  enviado_em  timestamptz not null default now(),
  check (octet_length(conteudo) = tamanho)
);
create index anexos_entidade on anexos (evento_id, entidade, entidade_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table equipes_trabalho enable row level security;
alter table destino_materiais enable row level security;
alter table acoes_sociais enable row level security;
alter table registros_esg enable row level security;
alter table pesquisas enable row level security;
alter table pesquisa_respostas enable row level security;
alter table anexos enable row level security;

create policy equipes_ver on equipes_trabalho for select to mec_app using (app.pode_ver_evento(evento_id));
create policy equipes_escreve on equipes_trabalho for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy materiais_ver on destino_materiais for select to mec_app using (app.pode_ver_evento(evento_id));
create policy materiais_escreve on destino_materiais for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy acoes_sociais_ver on acoes_sociais for select to mec_app using (app.pode_ver_evento(evento_id));
create policy acoes_sociais_escreve on acoes_sociais for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy registros_esg_ver on registros_esg for select to mec_app using (app.pode_ver_evento(evento_id));
create policy registros_esg_escreve on registros_esg for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

-- A pesquisa (link, aberta, NPS) é configurada pelo gestor.
create policy pesquisas_ver on pesquisas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy pesquisas_gestor on pesquisas for all to mec_app
  using (app.pode_gerir_evento(evento_id))
  with check (app.pode_gerir_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy respostas_ver on pesquisa_respostas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy respostas_importa on pesquisa_respostas for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and origem = 'importacao');
create policy respostas_destaca on pesquisa_respostas for update to mec_app
  using (app.pode_editar_evento(evento_id)) with check (app.pode_editar_evento(evento_id));
create policy respostas_remove on pesquisa_respostas for delete to mec_app
  using (app.pode_gerir_evento(evento_id));

create policy anexos_ver on anexos for select to mec_app using (app.pode_ver_evento(evento_id));
create policy anexos_envia on anexos for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and enviado_por = app.usuario_atual());
create policy anexos_remove on anexos for delete to mec_app using (app.pode_editar_evento(evento_id));

grant select, insert, update, delete on equipes_trabalho, destino_materiais, acoes_sociais to mec_app;
grant select, insert, update on registros_esg, pesquisas to mec_app;
grant select, insert, delete on pesquisa_respostas, anexos to mec_app;
-- Nas respostas, só o destaque do comentário muda.
grant update (destaque) on pesquisa_respostas to mec_app;
