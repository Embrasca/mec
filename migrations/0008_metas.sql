-- =====================================================================
-- Etapa 7: metas do portfólio, por ano. A administração define; todos os
-- usuários da plataforma consultam no painel gerencial.
-- =====================================================================

create table metas_portfolio (
  id             uuid primary key default gen_random_uuid(),
  ano            integer not null check (ano between 2020 and 2100),
  indicador      text not null check (indicador in ('intensidade', 'variacao', 'primario',
                   'mao_de_obra_local', 'gasto_local', 'satisfacao')),
  alvo           double precision not null,
  observacao     text check (length(observacao) <= 500),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  unique (ano, indicador)
);

alter table metas_portfolio enable row level security;
create policy metas_ver on metas_portfolio for select to mec_app using (app.usuario_atual() is not null);
create policy metas_admin on metas_portfolio for all to mec_app
  using (app.eh_admin())
  with check (app.eh_admin() and atualizado_por = app.usuario_atual());
grant select, insert, update, delete on metas_portfolio to mec_app;
