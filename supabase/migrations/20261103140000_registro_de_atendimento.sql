-- Registro do atendimento: o que cada profissional escreve em um atendimento (em
-- conjunto, cada um tem o seu). Segue as regras da anamnese: modelo de tópicos por
-- profissional, cópia das perguntas em cada registro, rascunho à parte, versões que
-- nunca são apagadas; profissionais e ADMs leem, a recepção não.
--
-- conteudo: { modelo, topicos: [{ perguntaId, pergunta, resposta }], relatorio, observacoes }.
-- Os dois modelos ficam guardados: alternar entre eles não apaga nada.

create table atendimento_topicos (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais on delete cascade,
  ordem integer not null,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on atendimento_topicos (profissional_id, ordem);

create trigger set_atualizado_em before update on atendimento_topicos
  for each row execute function set_atualizado_em();

alter table atendimento_topicos enable row level security;
create policy "o próprio profissional" on atendimento_topicos
  for all to authenticated
  using (pode_ver_clinico() and profissional_id = meu_profissional())
  with check (pode_ver_clinico() and profissional_id = meu_profissional());

-- O modelo com que cada um prefere começar: o último que usou.
alter table usuarios
  add column modelo_atendimento text not null default 'topicos' check (modelo_atendimento in ('topicos', 'relatorio'));

create table registros_atendimento (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references atendimentos on delete restrict,
  profissional_id uuid not null references profissionais on delete restrict,
  autor_id uuid default auth.uid(),
  conteudo jsonb not null default '{}',
  versao integer not null default 0,
  salvo_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (atendimento_id, profissional_id)
);

create trigger set_atualizado_em before update on registros_atendimento
  for each row execute function set_atualizado_em();

alter table registros_atendimento enable row level security;
create policy "clínica lê os salvos; o autor, também os em andamento" on registros_atendimento
  for select to authenticated
  using (pode_ver_clinico() and (versao > 0 or profissional_id = meu_profissional()));

create table registros_versoes (
  id bigint generated always as identity primary key,
  registro_id uuid not null references registros_atendimento on delete restrict,
  versao integer not null,
  conteudo jsonb not null,
  autor_id uuid default auth.uid(),
  salva_em timestamptz not null default now(),
  unique (registro_id, versao)
);

alter table registros_versoes enable row level security;
create policy "clínica lê" on registros_versoes
  for select to authenticated using (pode_ver_clinico());

create table registros_rascunhos (
  registro_id uuid primary key references registros_atendimento on delete cascade,
  conteudo jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table registros_rascunhos enable row level security;
create policy "o autor lê" on registros_rascunhos
  for select to authenticated
  using (exists (select 1 from registros_atendimento r where r.id = registro_id and r.profissional_id = meu_profissional() and pode_ver_clinico()));

create function definir_modelo_atendimento(p_modelo text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update usuarios set modelo_atendimento = p_modelo where id = auth.uid()
$$;

-- Guarda o texto em andamento: quem escreve precisa ser um dos profissionais do atendimento.
create function guardar_rascunho_registro(p_atendimento uuid, p_conteudo jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  registro uuid;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  perform garantir_meus_atendimentos(p_atendimento, 'este');
  if jsonb_typeof(p_conteudo) <> 'object' then
    raise exception 'Conteúdo inválido.';
  end if;

  insert into registros_atendimento (atendimento_id, profissional_id)
  values (p_atendimento, meu_profissional())
  on conflict (atendimento_id, profissional_id) do update set atualizado_em = now()
  returning id into registro;

  insert into registros_rascunhos (registro_id, conteudo)
  values (registro, p_conteudo)
  on conflict (registro_id) do update set conteudo = excluded.conteudo, atualizado_em = now();
end;
$$;

-- O rascunho vira a nova versão. p_finalizar também marca o atendimento como atendido
-- (no atendimento em conjunto, vale para todos: o status é um só).
create function salvar_registro(p_atendimento uuid, p_finalizar boolean default false) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  atual registros_atendimento;
  rascunho registros_rascunhos;
  nova integer;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  perform garantir_meus_atendimentos(p_atendimento, 'este');

  select * into atual from registros_atendimento
   where atendimento_id = p_atendimento and profissional_id = meu_profissional()
   for update;
  if not found then
    raise exception 'Não há registro para salvar.';
  end if;
  select * into rascunho from registros_rascunhos where registro_id = atual.id;
  if not found then
    raise exception 'Não há alterações para salvar.';
  end if;

  nova := atual.versao + 1;
  insert into registros_versoes (registro_id, versao, conteudo) values (atual.id, nova, rascunho.conteudo);
  update registros_atendimento
     set conteudo = rascunho.conteudo, versao = nova, salvo_em = now()
   where id = atual.id;
  delete from registros_rascunhos where registro_id = atual.id;

  if p_finalizar then
    update atendimentos set status = 'atendido', motivo_desmarcacao = null where id = p_atendimento;
  end if;
  return nova;
end;
$$;

do $$
declare
  funcao text;
begin
  foreach funcao in array array[
    'definir_modelo_atendimento(text)',
    'guardar_rascunho_registro(uuid, jsonb)',
    'salvar_registro(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', funcao);
    execute format('grant execute on function %s to authenticated', funcao);
  end loop;
end;
$$;
