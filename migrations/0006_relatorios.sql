-- =====================================================================
-- Etapa 5: relatórios. Cada versão congela o conteúdo (dados), o
-- framework escolhido e um código de integridade (SHA-256). Versões não
-- mudam nem somem: só se acrescentam.
-- =====================================================================

create table relatorios (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references eventos(id) on delete cascade,
  numero     integer not null check (numero > 0),
  tipo       text not null check (tipo in ('preliminar', 'final')),
  framework  text not null check (framework in ('GRI + ISO 20121', 'GRI', 'ISO 20121', 'GHG Protocol')),
  dados      jsonb not null,
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  gerado_por uuid not null references usuarios(id),
  gerado_em  timestamptz not null default now(),
  unique (evento_id, numero)
);

-- O relatório final só sai do inventário oficial: o ex-post fechado.
create or replace function app.relatorio_final_com_ex_post() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.tipo = 'final' and not exists (
       select 1 from inventarios where evento_id = new.evento_id and etapa = 'ex_post' and fechado_em is not null) then
    raise exception 'O relatório final exige o inventário ex-post fechado.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function app.relatorio_final_com_ex_post() from public;
create trigger relatorio_final_exige_ex_post before insert on relatorios
  for each row execute function app.relatorio_final_com_ex_post();

alter table relatorios enable row level security;
create policy relatorios_ver on relatorios for select to mec_app using (app.pode_ver_evento(evento_id));
create policy relatorios_gera on relatorios for insert to mec_app
  with check (
    gerado_por = app.usuario_atual()
    and app.pode_editar_evento(evento_id)
    and (tipo = 'preliminar' or app.pode_gerir_evento(evento_id))
  );

-- Sem update nem delete: versões são definitivas.
grant select, insert on relatorios to mec_app;
