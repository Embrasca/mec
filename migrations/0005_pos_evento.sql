-- =====================================================================
-- Etapa 4: execução e pós-evento. Qualidade do dado e evidência no
-- inventário ex-post (aba 3), ocorrências (aba OCORRÊNCIAS), origem dos
-- desvios (aba 5) e compensação (aba 6). Mesmo modelo: RLS e mec_app.
-- =====================================================================

-- Aba 3: qualidade do dado (nota 0 a 5) e evidência, só no ex-post.
alter table inventario_linhas
  add column qualidade smallint check (qualidade between 0 and 5),
  add column evidencia text check (length(evidencia) <= 1000),
  add constraint qualidade_so_no_ex_post
    check (etapa = 'ex_post' or (qualidade is null and evidencia is null));

-- Ocorrências
create table ocorrencias (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  data           date,
  fase           text check (fase in ('Pré-evento', 'Execução', 'Pós-evento')),
  categoria      text check (length(categoria) <= 60),
  ocorrencia     text not null check (length(ocorrencia) between 1 and 1000),
  impacto        text check (impacto in ('Sem impacto nos dados', 'Dado medido substituído por estimativa',
                   'Dado perdido', 'Dado atrasado', 'Mudança de escopo', 'Outro')),
  acao           text check (length(acao) <= 1000),
  responsavel    text check (length(responsavel) <= 200),
  situacao       text not null default 'Aberta' check (situacao in ('Aberta', 'Em tratamento', 'Resolvida')),
  premissa       text check (length(premissa) <= 2000),
  criado_em      timestamptz not null default now(),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now()
);
create index ocorrencias_evento on ocorrencias (evento_id);

-- [OCORRÊNCIAS!G4] "resolva as ocorrências abertas antes de fechar o inventário"
create or replace function app.ocorrencias_resolvidas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.fechado_em is not null and old.fechado_em is null
     and exists (select 1 from ocorrencias where evento_id = new.evento_id and situacao <> 'Resolvida') then
    raise exception 'Resolva as ocorrências abertas antes de fechar o inventário.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function app.ocorrencias_resolvidas() from public;
create trigger inventario_sem_ocorrencia_aberta before update on inventarios
  for each row execute function app.ocorrencias_resolvidas();

-- Aba 5: origem e explicação do desvio, por categoria.
create table desvios (
  evento_id      uuid not null references eventos(id) on delete cascade,
  categoria      text not null check (length(categoria) <= 60),
  origem         text check (origem in ('Desempenho', 'Escala', 'Premissa', 'Método', 'Sem desvio relevante')),
  explicacao     text check (length(explicacao) <= 2000),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, categoria)
);

-- Aba 6: entradas da compensação.
create table compensacoes (
  evento_id         uuid primary key references eventos(id) on delete cascade,
  omissao_t         double precision check (omissao_t >= 0),
  omissao_descricao text check (length(omissao_descricao) <= 2000),
  aposentada_t      double precision check (aposentada_t >= 0),
  comprovante       text check (length(comprovante) <= 2000),
  versao            integer not null default 1,
  atualizado_por    uuid not null references usuarios(id),
  atualizado_em     timestamptz not null default now()
);

alter table ocorrencias enable row level security;
alter table desvios enable row level security;
alter table compensacoes enable row level security;

create policy ocorrencias_ver on ocorrencias for select to mec_app using (app.pode_ver_evento(evento_id));
create policy ocorrencias_escreve on ocorrencias for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy desvios_ver on desvios for select to mec_app using (app.pode_ver_evento(evento_id));
create policy desvios_escreve on desvios for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy compensacoes_ver on compensacoes for select to mec_app using (app.pode_ver_evento(evento_id));
create policy compensacoes_escreve on compensacoes for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

grant select, insert, update, delete on ocorrencias, desvios to mec_app;
grant select, insert, update on compensacoes to mec_app;
