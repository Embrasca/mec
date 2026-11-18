-- =====================================================================
-- Etapas 0 e 1: usuários, eventos, equipe, caracterização, enquadramento,
-- acompanhamento dos requisitos do nível e trilha de auditoria.
--
-- Segurança em duas camadas:
--   1. o servidor confere a permissão em cada função;
--   2. o banco repete a regra com RLS. A aplicação troca para o papel
--      `mec_app` (sem BYPASSRLS) em toda transação e informa o usuário em
--      `app.user_id`. Esquecer uma checagem no código não abre os dados.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mec_app') then
    create role mec_app nologin;
  end if;
end $$;

-- O dono do banco precisa poder fazer `set local role mec_app`.
do $$ begin execute format('grant mec_app to %I', current_user); end $$;

create schema if not exists app;
grant usage on schema public, app to mec_app;

-- ---------------------------------------------------------------------
-- Quem está agindo
-- ---------------------------------------------------------------------
create or replace function app.usuario_atual() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------
-- Usuários da plataforma (o login fica no Neon Auth; aqui fica o acesso)
-- ---------------------------------------------------------------------
create table usuarios (
  id               uuid primary key,
  email            text not null,
  nome             text not null check (length(nome) between 1 and 200),
  admin_plataforma boolean not null default false,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create unique index usuarios_email_unico on usuarios (lower(email));

-- ---------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------
create table eventos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(nome) between 1 and 200),
  instituicao    text not null check (length(instituicao) between 1 and 200),
  cidade         text not null check (length(cidade) between 1 and 120),
  uf             text not null check (uf ~ '^[A-Z]{2}$'),
  data_inicio    date not null,
  data_fim       date not null,
  cor            text not null check (cor ~ '^#[0-9a-f]{6}$'),
  descricao      text check (length(descricao) <= 2000),
  metodologia    text not null default 'mec-giz-3.16',
  -- Nível oficial: só muda por confirmação de enquadramento e só sobe.
  nivel          smallint check (nivel between 1 and 4),
  criado_por     uuid not null references usuarios(id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  arquivado_em   timestamptz,
  constraint eventos_periodo check (data_fim >= data_inicio)
);

create type papel_evento as enum ('gestor', 'equipe', 'revisor', 'leitor');

create table evento_membros (
  evento_id   uuid not null references eventos(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id),
  papel       papel_evento not null,
  criado_por  uuid not null references usuarios(id),
  criado_em   timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);
create index evento_membros_usuario on evento_membros (usuario_id);

-- ---------------------------------------------------------------------
-- Funções de permissão. SECURITY DEFINER para ler usuários e equipes sem
-- recursão de RLS; search_path fixo para não serem sequestradas.
-- ---------------------------------------------------------------------
create or replace function app.eh_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from usuarios
    where id = app.usuario_atual() and admin_plataforma and ativo)
$$;

create or replace function app.papel_no_evento(eid uuid) returns papel_evento
language sql stable security definer set search_path = public, pg_temp as $$
  select m.papel from evento_membros m
  join usuarios u on u.id = m.usuario_id and u.ativo
  where m.evento_id = eid and m.usuario_id = app.usuario_atual()
$$;

create or replace function app.pode_ver_evento(eid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.eh_admin() or app.papel_no_evento(eid) is not null
$$;

create or replace function app.pode_editar_evento(eid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.eh_admin() or app.papel_no_evento(eid) in ('gestor', 'equipe')
$$;

create or replace function app.pode_gerir_evento(eid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.eh_admin() or app.papel_no_evento(eid) = 'gestor'
$$;

create or replace function app.compartilha_evento(outro uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from evento_membros a
    join evento_membros b on b.evento_id = a.evento_id
    where a.usuario_id = app.usuario_atual() and b.usuario_id = outro)
$$;

-- Quem gere o evento acha uma conta pelo e-mail para incluí-la na equipe, sem
-- poder listar todos os usuários da plataforma.
create or replace function app.usuario_por_email(eid uuid, procurado text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id from usuarios u
  where app.pode_gerir_evento(eid) and u.ativo and lower(u.email) = lower(trim(procurado))
$$;
revoke all on function app.usuario_por_email(uuid, text) from public;
grant execute on function app.usuario_por_email(uuid, text) to mec_app;

revoke all on function app.eh_admin(), app.papel_no_evento(uuid), app.pode_ver_evento(uuid),
  app.pode_editar_evento(uuid), app.pode_gerir_evento(uuid), app.compartilha_evento(uuid) from public;
grant execute on function app.usuario_atual(), app.eh_admin(), app.papel_no_evento(uuid),
  app.pode_ver_evento(uuid), app.pode_editar_evento(uuid), app.pode_gerir_evento(uuid),
  app.compartilha_evento(uuid) to mec_app;

-- O nível só sobe, nunca desce (aba A, bloco A.8).
create or replace function app.nivel_so_sobe() returns trigger
language plpgsql as $$
begin
  if old.nivel is not null and (new.nivel is null or new.nivel < old.nivel) then
    raise exception 'O nível do evento só sobe, nunca desce (de % para %).', old.nivel, new.nivel
      using errcode = 'check_violation';
  end if;
  -- O nível só muda junto com o registro do enquadramento, na mesma transação.
  if new.nivel is distinct from old.nivel and not exists (
    select 1 from enquadramentos e
    where e.evento_id = new.id and e.nivel = new.nivel and e.registrado_em = now()) then
    raise exception 'O nível só muda com o registro do enquadramento.'
      using errcode = 'check_violation';
  end if;
  if new.arquivado_em is distinct from old.arquivado_em and not app.eh_admin() then
    raise exception 'Só a administração da plataforma arquiva eventos.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.criado_por is distinct from old.criado_por or new.metodologia is distinct from old.metodologia then
    raise exception 'Autor e metodologia do evento não mudam.' using errcode = 'check_violation';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create trigger eventos_nivel_so_sobe before update on eventos
  for each row execute function app.nivel_so_sobe();

-- ---------------------------------------------------------------------
-- Caracterização (aba A, blocos A.2 a A.6). O formato é validado no servidor
-- pelo mesmo esquema Zod do formulário.
-- ---------------------------------------------------------------------
create table caracterizacoes (
  evento_id      uuid primary key references eventos(id) on delete cascade,
  dados          jsonb not null,
  versao         integer not null default 1,
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now()
);

-- Registro de enquadramento e de reenquadramento: só inserção.
create table enquadramentos (
  id                  uuid primary key default gen_random_uuid(),
  evento_id           uuid not null references eventos(id) on delete cascade,
  tipo                text not null check (tipo in ('inicial', 'reenquadramento')),
  nivel               smallint not null check (nivel between 1 and 4),
  nivel_anterior      smallint check (nivel_anterior between 1 and 4),
  metodologia         text not null,
  entradas            jsonb not null,
  resultado           jsonb not null,
  o_que_mudou         text check (length(o_que_mudou) <= 4000),
  limitacao_declarada text check (length(limitacao_declarada) <= 4000),
  responsavel         text not null check (length(responsavel) between 1 and 200),
  registrado_por      uuid not null references usuarios(id),
  registrado_em       timestamptz not null default now(),
  constraint enquadramento_sobe check (nivel_anterior is null or nivel > nivel_anterior),
  constraint reenquadramento_explica check (
    tipo = 'inicial' or (nivel_anterior is not null and coalesce(length(trim(o_que_mudou)), 0) > 0))
);
create index enquadramentos_evento on enquadramentos (evento_id, registrado_em desc);

-- Aba B: "Já foi feito?" de cada requisito do nível.
create table requisitos_acompanhamento (
  evento_id      uuid not null references eventos(id) on delete cascade,
  requisito      text not null check (length(requisito) <= 200),
  feito          text not null check (feito in ('Sim', 'Não')),
  observacao     text check (length(observacao) <= 2000),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, requisito)
);

-- ---------------------------------------------------------------------
-- Auditoria: só inserção, ninguém altera nem apaga pela aplicação.
-- ---------------------------------------------------------------------
create table auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  usuario_id  uuid,
  evento_id   uuid references eventos(id) on delete set null,
  acao        text not null,
  entidade    text not null,
  entidade_id text,
  detalhes    jsonb
);
create index auditoria_evento on auditoria (evento_id, em desc);
create index auditoria_em on auditoria (em desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table usuarios enable row level security;
alter table eventos enable row level security;
alter table evento_membros enable row level security;
alter table caracterizacoes enable row level security;
alter table enquadramentos enable row level security;
alter table requisitos_acompanhamento enable row level security;
alter table auditoria enable row level security;

create policy usuarios_ver on usuarios for select to mec_app
  using (id = app.usuario_atual() or app.eh_admin() or app.compartilha_evento(id));
create policy usuarios_admin_insere on usuarios for insert to mec_app
  with check (app.eh_admin());
create policy usuarios_admin_altera on usuarios for update to mec_app
  using (app.eh_admin()) with check (app.eh_admin());

create policy eventos_ver on eventos for select to mec_app
  using (app.pode_ver_evento(id));
create policy eventos_admin_cria on eventos for insert to mec_app
  with check (app.eh_admin() and criado_por = app.usuario_atual());
create policy eventos_gestor_altera on eventos for update to mec_app
  using (app.pode_gerir_evento(id)) with check (app.pode_gerir_evento(id));

create policy membros_ver on evento_membros for select to mec_app
  using (app.pode_ver_evento(evento_id));
create policy membros_gestor_insere on evento_membros for insert to mec_app
  with check (app.pode_gerir_evento(evento_id) and criado_por = app.usuario_atual());
create policy membros_gestor_altera on evento_membros for update to mec_app
  using (app.pode_gerir_evento(evento_id)) with check (app.pode_gerir_evento(evento_id));
create policy membros_gestor_remove on evento_membros for delete to mec_app
  using (app.pode_gerir_evento(evento_id));

create policy caracterizacao_ver on caracterizacoes for select to mec_app
  using (app.pode_ver_evento(evento_id));
create policy caracterizacao_insere on caracterizacoes for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());
create policy caracterizacao_altera on caracterizacoes for update to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy enquadramentos_ver on enquadramentos for select to mec_app
  using (app.pode_ver_evento(evento_id));
create policy enquadramentos_gestor_registra on enquadramentos for insert to mec_app
  with check (app.pode_gerir_evento(evento_id) and registrado_por = app.usuario_atual());

create policy requisitos_ver on requisitos_acompanhamento for select to mec_app
  using (app.pode_ver_evento(evento_id));
create policy requisitos_insere on requisitos_acompanhamento for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());
create policy requisitos_altera on requisitos_acompanhamento for update to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy auditoria_ver on auditoria for select to mec_app
  using (app.eh_admin() or (evento_id is not null and app.pode_gerir_evento(evento_id)));
create policy auditoria_registra on auditoria for insert to mec_app
  with check (usuario_id = app.usuario_atual());

grant select, insert, update on usuarios, eventos, caracterizacoes, requisitos_acompanhamento to mec_app;
grant select, insert, update, delete on evento_membros to mec_app;
grant select, insert on enquadramentos, auditoria to mec_app;
