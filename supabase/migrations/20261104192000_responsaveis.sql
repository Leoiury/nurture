-- Responsáveis: uma pessoa pode responder por vários pacientes, e um paciente pode ter
-- vários responsáveis. O texto pacientes.responsavel passa a ser derivado desta tabela,
-- e as telas e o nível cadastral que o usam continuam funcionando.

create table responsaveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) >= 3),
  cpf text check (cpf ~ '^[0-9]{11}$'),
  email text,
  whatsapp text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index responsaveis_cpf_unico on responsaveis (cpf) where cpf is not null;
create index on responsaveis (nome);

create trigger set_atualizado_em before update on responsaveis
  for each row execute function set_atualizado_em();

create table paciente_responsaveis (
  paciente_id uuid not null references pacientes on delete cascade,
  responsavel_id uuid not null references responsaveis on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (paciente_id, responsavel_id)
);

create index on paciente_responsaveis (responsavel_id);

-- Mesmo acesso da tabela de pacientes.
alter table responsaveis enable row level security;
create policy "autenticados: acesso total" on responsaveis
  for all to authenticated using (true) with check (true);

alter table paciente_responsaveis enable row level security;
create policy "autenticados: acesso total" on paciente_responsaveis
  for all to authenticated using (true) with check (true);

-- O que já estava no campo de texto. Nomes completos iguais viram uma pessoa só (irmãos);
-- uma única palavra pode ser qualquer pessoa, então fica separada por paciente.
do $$
declare
  grupo record;
  novo uuid;
begin
  for grupo in
    select min(nome) as nome, array_agg(paciente_id) as pacientes
      from (
        select id as paciente_id, regexp_replace(trim(responsavel), '\s+', ' ', 'g') as nome
          from pacientes
         where length(trim(coalesce(responsavel, ''))) >= 3
      ) base
     group by case when nome like '% %' then lower(nome) else paciente_id::text end
  loop
    insert into responsaveis (nome) values (grupo.nome) returning id into novo;
    insert into paciente_responsaveis (paciente_id, responsavel_id)
    select unnest(grupo.pacientes), novo;
  end loop;
end;
$$;

create function sincronizar_responsavel_do_paciente(p_paciente uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update pacientes p
     set responsavel = (
       select string_agg(r.nome, ', ' order by pr.criado_em, r.nome)
         from paciente_responsaveis pr
         join responsaveis r on r.id = pr.responsavel_id
        where pr.paciente_id = p_paciente
     )
   where p.id = p_paciente
$$;

revoke all on function sincronizar_responsavel_do_paciente(uuid) from public, anon, authenticated;

create function ao_mudar_vinculo_de_responsavel() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform sincronizar_responsavel_do_paciente(coalesce(new.paciente_id, old.paciente_id));
  return null;
end;
$$;

create trigger sincronizar_responsavel after insert or delete on paciente_responsaveis
  for each row execute function ao_mudar_vinculo_de_responsavel();

create function ao_renomear_responsavel() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform sincronizar_responsavel_do_paciente(paciente_id)
     from paciente_responsaveis
    where responsavel_id = new.id;
  return null;
end;
$$;

create trigger sincronizar_nome after update of nome on responsaveis
  for each row execute function ao_renomear_responsavel();

-- Cadastra e vincula na mesma transação.
create function criar_responsavel_do_paciente(p_paciente uuid, p_nome text, p_cpf text, p_email text, p_whatsapp text) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  novo uuid;
begin
  insert into responsaveis (nome, cpf, email, whatsapp) values (p_nome, nullif(p_cpf, ''), nullif(p_email, ''), nullif(p_whatsapp, '')) returning id into novo;
  insert into paciente_responsaveis (paciente_id, responsavel_id) values (p_paciente, novo);
  return novo;
end;
$$;

-- Tira o vínculo. Sem nenhum outro paciente, os dados da pessoa (CPF etc.) são apagados.
create function desvincular_responsavel(p_paciente uuid, p_responsavel uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from paciente_responsaveis where paciente_id = p_paciente and responsavel_id = p_responsavel;
  delete from responsaveis r
   where r.id = p_responsavel
     and not exists (select 1 from paciente_responsaveis pr where pr.responsavel_id = r.id);
end;
$$;

revoke all on function criar_responsavel_do_paciente(uuid, text, text, text, text) from public, anon;
grant execute on function criar_responsavel_do_paciente(uuid, text, text, text, text) to authenticated;
revoke all on function desvincular_responsavel(uuid, uuid) from public, anon;
grant execute on function desvincular_responsavel(uuid, uuid) to authenticated;
