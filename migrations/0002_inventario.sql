-- =====================================================================
-- Etapa 2: base de fatores versionada, inventário (ex-ante), coleta e
-- fornecedores. Mesmo modelo de segurança da 0001: RLS em tudo, papel mec_app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Base de fatores. Base publicada não muda: alterar fator = nova versão.
-- ---------------------------------------------------------------------
create table bases_fatores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique check (length(nome) between 1 and 120),
  metodologia    text not null default 'mec-giz-3.16',
  gwp_ch4        double precision not null check (gwp_ch4 > 0),
  gwp_n2o        double precision not null check (gwp_n2o > 0),
  referencia_gwp text not null,
  situacao       text not null default 'rascunho' check (situacao in ('rascunho', 'publicada')),
  derivada_de    uuid references bases_fatores(id),
  observacao     text check (length(observacao) <= 2000),
  criada_por     uuid references usuarios(id),
  criada_em      timestamptz not null default now(),
  publicada_em   timestamptz
);

create table fatores (
  base_id       uuid not null references bases_fatores(id) on delete cascade,
  item          text not null check (length(item) between 1 and 200),
  codigo        text not null,
  categoria     text not null,
  unidade       text not null,
  escopo        smallint not null check (escopo between 1 and 3),
  -- kg por unidade. Nulo só quando a regra é 'sin' (calculado pelo fator do SIN do ano).
  fe_co2        double precision check (fe_co2 >= 0),
  fe_ch4        double precision not null default 0 check (fe_ch4 >= 0),
  fe_n2o        double precision not null default 0 check (fe_n2o >= 0),
  fe_biogenico  double precision not null default 0 check (fe_biogenico >= 0),
  regra         text not null default 'fixo' check (regra in ('fixo', 'sin')),
  multiplicador double precision check (multiplicador > 0),
  fonte         text not null check (length(fonte) <= 2000),
  situacao      text not null check (length(situacao) <= 300),
  primary key (base_id, item),
  constraint fator_regra check (
    (regra = 'fixo' and fe_co2 is not null) or (regra = 'sin' and multiplicador is not null))
);

create table fatores_sin (
  base_id uuid not null references bases_fatores(id) on delete cascade,
  ano     smallint not null check (ano between 2000 and 2100),
  valor   double precision not null check (valor >= 0),
  primary key (base_id, ano)
);

-- Base publicada fica congelada (ela e seus fatores).
create or replace function app.base_congelada() returns trigger
language plpgsql as $$
declare
  alvo uuid := coalesce(case when tg_op = 'DELETE' then old.base_id else new.base_id end, null);
begin
  if exists (select 1 from bases_fatores where id = alvo and situacao = 'publicada') then
    raise exception 'Base de fatores publicada não muda. Crie uma nova versão.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger fatores_congelados before insert or update or delete on fatores
  for each row execute function app.base_congelada();
create trigger fatores_sin_congelados before insert or update or delete on fatores_sin
  for each row execute function app.base_congelada();

create or replace function app.base_publicada_imutavel() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.situacao = 'publicada' then
    raise exception 'Base de fatores publicada não pode ser apagada.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.situacao = 'publicada' then
    raise exception 'Base de fatores publicada não muda. Crie uma nova versão.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.situacao = 'publicada' then
    new.publicada_em := now();
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger bases_publicadas_imutaveis before update or delete on bases_fatores
  for each row execute function app.base_publicada_imutavel();

-- ---------------------------------------------------------------------
-- Base usada por cada evento
-- ---------------------------------------------------------------------
alter table eventos add column base_fatores_id uuid references bases_fatores(id);

-- ---------------------------------------------------------------------
-- Inventário: cabeçalho por etapa (versão e fechamento) e linhas.
-- ---------------------------------------------------------------------
create table inventarios (
  evento_id       uuid not null references eventos(id) on delete cascade,
  etapa           text not null check (etapa in ('ex_ante', 'ex_post')),
  versao          integer not null default 1,
  atualizado_por  uuid not null references usuarios(id),
  atualizado_em   timestamptz not null default now(),
  fechado_em      timestamptz,
  fechado_por     uuid references usuarios(id),
  base_fatores_id uuid references bases_fatores(id),
  resultado       jsonb,
  primary key (evento_id, etapa),
  constraint fechamento_completo check (
    (fechado_em is null and fechado_por is null and resultado is null)
    or (fechado_em is not null and fechado_por is not null and resultado is not null
        and base_fatores_id is not null))
);

create table inventario_linhas (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null,
  etapa       text not null,
  ordem       integer not null check (ordem >= 0),
  fornecedor  text check (length(fornecedor) <= 120),
  item        text check (length(item) <= 200),
  descricao   text check (length(descricao) <= 200),
  quantidade  double precision check (quantidade >= 0),
  premissa    text check (length(premissa) <= 2000),
  origem      text not null default 'manual' check (origem in ('manual', 'coleta')),
  foreign key (evento_id, etapa) references inventarios(evento_id, etapa) on delete cascade
);
create index inventario_linhas_evento on inventario_linhas (evento_id, etapa, ordem);

-- Ex-ante fechado não muda: "preserve o ex-ante original" (aba 5).
create or replace function app.inventario_aberto() returns trigger
language plpgsql as $$
declare
  ev uuid := case when tg_op = 'DELETE' then old.evento_id else new.evento_id end;
  et text := case when tg_op = 'DELETE' then old.etapa else new.etapa end;
begin
  if exists (select 1 from inventarios where evento_id = ev and etapa = et and fechado_em is not null) then
    raise exception 'Este inventário está fechado e não pode mais ser alterado.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger linhas_de_inventario_aberto before insert or update or delete on inventario_linhas
  for each row execute function app.inventario_aberto();

create or replace function app.fechamento_definitivo() returns trigger
language plpgsql as $$
begin
  if old.fechado_em is not null then
    raise exception 'Este inventário está fechado e não pode mais ser alterado.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger inventario_fechado_definitivo before update on inventarios
  for each row execute function app.fechamento_definitivo();

-- A base do evento só muda enquanto o ex-ante estiver aberto, e só para base publicada.
create or replace function app.base_do_evento() returns trigger
language plpgsql as $$
begin
  if new.base_fatores_id is distinct from old.base_fatores_id then
    if not exists (select 1 from bases_fatores where id = new.base_fatores_id and situacao = 'publicada') then
      raise exception 'Escolha uma base de fatores publicada.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from inventarios where evento_id = new.id and fechado_em is not null) then
      raise exception 'A base de fatores não muda depois que um inventário do evento foi fechado.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger eventos_base_de_fatores before update on eventos
  for each row execute function app.base_do_evento();

-- ---------------------------------------------------------------------
-- Coleta (quadros de apoio), por etapa
-- ---------------------------------------------------------------------
create table coletas (
  evento_id      uuid not null references eventos(id) on delete cascade,
  etapa          text not null check (etapa in ('ex_ante', 'ex_post')),
  dados          jsonb not null,
  versao         integer not null default 1,
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, etapa)
);

-- ---------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------
create table fornecedores (
  id                       uuid primary key default gen_random_uuid(),
  evento_id                uuid not null references eventos(id) on delete cascade,
  nome                     text not null check (length(nome) between 1 and 200),
  tipo                     text not null check (length(tipo) <= 120),
  contato                  text check (length(contato) <= 200),
  enviado_em               date,
  recebido_em              date,
  ha_subcontratados        text check (ha_subcontratados in ('Sim', 'Não')),
  subcontratados_incluidos text check (subcontratados_incluidos in ('Sim', 'Não')),
  observacao               text check (length(observacao) <= 2000),
  atualizado_por           uuid not null references usuarios(id),
  atualizado_em            timestamptz not null default now()
);
create index fornecedores_evento on fornecedores (evento_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table bases_fatores enable row level security;
alter table fatores enable row level security;
alter table fatores_sin enable row level security;
alter table inventarios enable row level security;
alter table inventario_linhas enable row level security;
alter table coletas enable row level security;
alter table fornecedores enable row level security;

-- Base de fatores: todos leem; só a administração escreve.
create policy bases_ver on bases_fatores for select to mec_app using (true);
create policy bases_admin_cria on bases_fatores for insert to mec_app
  with check (app.eh_admin() and criada_por = app.usuario_atual() and situacao = 'rascunho');
create policy bases_admin_altera on bases_fatores for update to mec_app
  using (app.eh_admin()) with check (app.eh_admin());
create policy bases_admin_apaga on bases_fatores for delete to mec_app using (app.eh_admin());
create policy fatores_ver on fatores for select to mec_app using (true);
create policy fatores_admin on fatores for all to mec_app using (app.eh_admin()) with check (app.eh_admin());
create policy sin_ver on fatores_sin for select to mec_app using (true);
create policy sin_admin on fatores_sin for all to mec_app using (app.eh_admin()) with check (app.eh_admin());

create policy inventarios_ver on inventarios for select to mec_app using (app.pode_ver_evento(evento_id));
create policy inventarios_insere on inventarios for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual()
              and fechado_em is null);
-- Editar a versão é de quem edita; fechar é só do gestor.
create policy inventarios_altera on inventarios for update to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id)
              and (fechado_em is null or (app.pode_gerir_evento(evento_id) and fechado_por = app.usuario_atual())));

create policy linhas_ver on inventario_linhas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy linhas_escreve on inventario_linhas for all to mec_app
  using (app.pode_editar_evento(evento_id)) with check (app.pode_editar_evento(evento_id));

create policy coletas_ver on coletas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy coletas_insere on coletas for insert to mec_app
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());
create policy coletas_altera on coletas for update to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy fornecedores_ver on fornecedores for select to mec_app using (app.pode_ver_evento(evento_id));
create policy fornecedores_escreve on fornecedores for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

grant select, insert, update, delete on bases_fatores, fatores, fatores_sin to mec_app;
grant select, insert, update on inventarios, coletas to mec_app;
grant select, insert, update, delete on inventario_linhas, fornecedores to mec_app;
