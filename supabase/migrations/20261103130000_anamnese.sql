-- Anamnese: cada profissional tem as próprias perguntas (o modelo), e cada anamnese
-- guarda uma cópia das perguntas com as respostas: mudar o modelo não muda o passado.
--
-- Conteúdo clínico: profissionais e ADMs leem; a recepção (limitado) não. Só o autor
-- altera, sempre por funções: cada salvamento vira uma versão, e nada é apagado.

create function pode_ver_clinico() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from usuarios where id = auth.uid() and ativo and perfil in ('adm', 'profissional'))
$$;

create table anamnese_perguntas (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais on delete cascade,
  ordem integer not null,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on anamnese_perguntas (profissional_id, ordem);

create trigger set_atualizado_em before update on anamnese_perguntas
  for each row execute function set_atualizado_em();

alter table anamnese_perguntas enable row level security;
create policy "o próprio profissional" on anamnese_perguntas
  for all to authenticated
  using (pode_ver_clinico() and profissional_id = meu_profissional())
  with check (pode_ver_clinico() and profissional_id = meu_profissional());

-- conteudo: [{ perguntaId, pergunta, resposta }], o estado da última versão salva.
-- salva_em nulo: ainda não foi salva, e só o autor a vê.
create table anamneses (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes on delete restrict,
  profissional_id uuid not null references profissionais on delete restrict,
  autor_id uuid default auth.uid(),
  conteudo jsonb not null default '[]',
  observacoes text not null default '',
  versao integer not null default 0,
  salva_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on anamneses (paciente_id, criado_em desc);

-- No máximo uma anamnese em andamento por paciente e profissional.
create unique index anamneses_uma_em_andamento on anamneses (paciente_id, profissional_id) where salva_em is null;

create trigger set_atualizado_em before update on anamneses
  for each row execute function set_atualizado_em();

alter table anamneses enable row level security;
create policy "clínica lê as salvas; o autor, também as em andamento" on anamneses
  for select to authenticated
  using (pode_ver_clinico() and (salva_em is not null or profissional_id = meu_profissional()));

create table anamneses_versoes (
  id bigint generated always as identity primary key,
  anamnese_id uuid not null references anamneses on delete restrict,
  versao integer not null,
  conteudo jsonb not null,
  observacoes text not null,
  autor_id uuid default auth.uid(),
  salva_em timestamptz not null default now(),
  unique (anamnese_id, versao)
);

alter table anamneses_versoes enable row level security;
create policy "clínica lê" on anamneses_versoes
  for select to authenticated using (pode_ver_clinico());

-- O que o autor está digitando, à parte do que já foi salvo: só ele vê.
create table anamneses_rascunhos (
  anamnese_id uuid primary key references anamneses on delete cascade,
  conteudo jsonb not null,
  observacoes text not null,
  atualizado_em timestamptz not null default now()
);

alter table anamneses_rascunhos enable row level security;
create policy "o autor lê" on anamneses_rascunhos
  for select to authenticated
  using (exists (select 1 from anamneses a where a.id = anamnese_id and a.profissional_id = meu_profissional() and pode_ver_clinico()));

create function garantir_autor_da_anamnese(p_id uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not pode_ver_clinico() or meu_profissional() is null
     or not exists (select 1 from anamneses where id = p_id and profissional_id = meu_profissional()) then
    raise exception 'Só quem fez a anamnese pode alterá-la.';
  end if;
end;
$$;

-- Abre a anamnese em andamento deste paciente, ou começa uma.
create function iniciar_anamnese(p_paciente uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  atual uuid;
begin
  if not pode_ver_clinico() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  select id into atual from anamneses where paciente_id = p_paciente and profissional_id = meu_profissional() and salva_em is null;
  if found then
    return atual;
  end if;
  insert into anamneses (paciente_id, profissional_id) values (p_paciente, meu_profissional()) returning id into atual;
  return atual;
end;
$$;

create function guardar_rascunho_anamnese(p_id uuid, p_conteudo jsonb, p_observacoes text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform garantir_autor_da_anamnese(p_id);
  if jsonb_typeof(p_conteudo) <> 'array' then
    raise exception 'Conteúdo inválido.';
  end if;
  insert into anamneses_rascunhos (anamnese_id, conteudo, observacoes)
  values (p_id, p_conteudo, coalesce(p_observacoes, ''))
  on conflict (anamnese_id) do update
    set conteudo = excluded.conteudo, observacoes = excluded.observacoes, atualizado_em = now();
end;
$$;

-- O rascunho vira a nova versão, que fica guardada para sempre.
create function salvar_anamnese(p_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rascunho anamneses_rascunhos;
  nova integer;
begin
  perform garantir_autor_da_anamnese(p_id);
  select versao + 1 into nova from anamneses where id = p_id for update;
  select * into rascunho from anamneses_rascunhos where anamnese_id = p_id;
  if not found then
    raise exception 'Não há alterações para salvar.';
  end if;

  insert into anamneses_versoes (anamnese_id, versao, conteudo, observacoes)
  values (p_id, nova, rascunho.conteudo, rascunho.observacoes);
  update anamneses
     set conteudo = rascunho.conteudo, observacoes = rascunho.observacoes, versao = nova, salva_em = coalesce(salva_em, now())
   where id = p_id;
  delete from anamneses_rascunhos where anamnese_id = p_id;
  return nova;
end;
$$;

-- Desiste de uma edição: a anamnese continua na última versão salva.
create function descartar_rascunho_anamnese(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform garantir_autor_da_anamnese(p_id);
  delete from anamneses_rascunhos where anamnese_id = p_id;
end;
$$;

do $$
declare
  funcao text;
begin
  foreach funcao in array array[
    'pode_ver_clinico()',
    'garantir_autor_da_anamnese(uuid)',
    'iniciar_anamnese(uuid)',
    'guardar_rascunho_anamnese(uuid, jsonb, text)',
    'salvar_anamnese(uuid)',
    'descartar_rascunho_anamnese(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', funcao);
    execute format('grant execute on function %s to authenticated', funcao);
  end loop;
end;
$$;
