-- =====================================================================
-- Etapa 3: checklist do nível (aba C), plano de redução (aba REDUÇÃO),
-- matriz impacto × relevância e plano de ação (vindos do EventSustain).
-- Mesmo modelo de segurança: RLS em tudo, papel mec_app.
-- =====================================================================

create table checklist_respostas (
  evento_id      uuid not null references eventos(id) on delete cascade,
  chave          text not null check (chave ~ '^[ABC]\|[0-9]{1,3}$'),
  feito          text not null check (feito in ('Sim', 'Não')),
  observacao     text check (length(observacao) <= 2000),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, chave)
);

create table medidas_reducao (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  categoria      text check (length(categoria) <= 60),
  acao           text check (length(acao) <= 500),
  objetivo       text check (objetivo in ('Evitar', 'Reduzir', 'Substituir', 'Remover')),
  meta_pct       double precision check (meta_pct between 0 and 100),
  responsavel    text check (length(responsavel) <= 200),
  prazo          date,
  resultado      text check (resultado in ('Concluída', 'Parcial', 'Não realizada', 'Substituída')),
  evidencia      text check (length(evidencia) <= 1000),
  criado_em      timestamptz not null default now(),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  unique (evento_id, id)
);

create table matriz_temas (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  tema           text not null check (length(tema) between 1 and 200),
  categoria      text check (length(categoria) <= 60),
  descricao      text check (length(descricao) <= 2000),
  impacto        smallint not null check (impacto between 1 and 5),
  relevancia     smallint not null check (relevancia between 1 and 5),
  stakeholders   text check (length(stakeholders) <= 500),
  fonte          text check (length(fonte) <= 300),
  criado_em      timestamptz not null default now(),
  atualizado_por uuid not null references usuarios(id),
  atualizado_em  timestamptz not null default now(),
  unique (evento_id, id)
);

create table plano_acoes (
  id                 uuid primary key default gen_random_uuid(),
  evento_id          uuid not null references eventos(id) on delete cascade,
  acao               text not null check (length(acao) between 1 and 300),
  descricao          text check (length(descricao) <= 2000),
  tema_id            uuid,
  medida_id          uuid,
  responsavel        text check (length(responsavel) <= 200),
  prazo              date,
  status             text not null default 'pendente'
                       check (status in ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade         text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  evidencia_esperada text check (length(evidencia_esperada) <= 500),
  progresso          smallint not null default 0 check (progresso between 0 and 100),
  criado_em          timestamptz not null default now(),
  atualizado_por     uuid not null references usuarios(id),
  atualizado_em      timestamptz not null default now(),
  constraint concluida_completa check (status <> 'concluida' or progresso = 100),
  -- Tema e medida precisam ser do mesmo evento; apagar um deles só solta o vínculo.
  foreign key (evento_id, tema_id) references matriz_temas(evento_id, id) on delete set null (tema_id),
  foreign key (evento_id, medida_id) references medidas_reducao(evento_id, id) on delete set null (medida_id)
);
create index plano_acoes_evento on plano_acoes (evento_id);
create index medidas_reducao_evento on medidas_reducao (evento_id);
create index matriz_temas_evento on matriz_temas (evento_id);

alter table checklist_respostas enable row level security;
alter table medidas_reducao enable row level security;
alter table matriz_temas enable row level security;
alter table plano_acoes enable row level security;

create policy checklist_ver on checklist_respostas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy checklist_escreve on checklist_respostas for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy medidas_ver on medidas_reducao for select to mec_app using (app.pode_ver_evento(evento_id));
create policy medidas_escreve on medidas_reducao for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy temas_ver on matriz_temas for select to mec_app using (app.pode_ver_evento(evento_id));
create policy temas_escreve on matriz_temas for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

create policy acoes_ver on plano_acoes for select to mec_app using (app.pode_ver_evento(evento_id));
create policy acoes_escreve on plano_acoes for all to mec_app
  using (app.pode_editar_evento(evento_id))
  with check (app.pode_editar_evento(evento_id) and atualizado_por = app.usuario_atual());

grant select, insert, update, delete on checklist_respostas, medidas_reducao, matriz_temas, plano_acoes to mec_app;
