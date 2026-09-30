-- Usuários do sistema e perfis de acesso.
--
-- adm: tudo (configurações, planejamento, importação, usuários, profissionais).
-- limitado: agenda e pacientes; vê profissionais, planos, tipos e feriados, sem alterá-los.
--
-- O login continua no Supabase Auth (auth.users); esta tabela guarda nome,
-- perfil, vínculo com um profissional (acesso dos profissionais, no futuro) e
-- se o usuário está ativo.

create type perfil_usuario as enum ('adm', 'limitado');

create table usuarios (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  email text not null,
  perfil perfil_usuario not null default 'limitado',
  profissional_id uuid references profissionais on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger set_atualizado_em before update on usuarios
  for each row execute function set_atualizado_em();

-- Usuários já existentes: o perfil antigo (app_metadata) direcao/dev vira adm.
insert into usuarios (id, nome, email, perfil)
select id,
       coalesce(nullif(trim(raw_user_meta_data ->> 'nome'), ''), split_part(email, '@', 1)),
       email,
       case when raw_app_meta_data ->> 'perfil' in ('adm', 'direcao', 'dev') then 'adm' else 'limitado' end::perfil_usuario
from auth.users;

-- Todo login novo ganha sua linha (pela tela de usuários, pelo script ou nos testes).
create function criar_usuario_do_login() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.usuarios (id, nome, email, perfil)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when new.raw_app_meta_data ->> 'perfil' in ('adm', 'direcao', 'dev') then 'adm' else 'limitado' end::perfil_usuario
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger criar_usuario_do_login after insert on auth.users
  for each row execute function public.criar_usuario_do_login();

-- O Supabase grava o app_metadata do login num segundo passo (update), depois de
-- criá-lo: quando o perfil aparece ou muda ali, acompanha em usuarios.
create function sincronizar_perfil_do_login() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.raw_app_meta_data ->> 'perfil' is distinct from old.raw_app_meta_data ->> 'perfil'
     and new.raw_app_meta_data ->> 'perfil' is not null then
    update public.usuarios
       set perfil = case when new.raw_app_meta_data ->> 'perfil' in ('adm', 'direcao', 'dev') then 'adm' else 'limitado' end::perfil_usuario
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger sincronizar_perfil_do_login after update of raw_app_meta_data on auth.users
  for each row execute function public.sincronizar_perfil_do_login();

-- ADM agora vem da tabela (vale na hora, sem esperar o token do login ser renovado).
-- security definer: a política de usuarios usa esta função (evita recursão).
create or replace function eh_adm() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from usuarios where id = auth.uid() and perfil = 'adm' and ativo)
$$;

alter table usuarios enable row level security;
create policy "cada um lê o seu; adm lê todos" on usuarios
  for select to authenticated using (id = auth.uid() or eh_adm());
create policy "adm altera" on usuarios
  for update to authenticated using (eh_adm()) with check (eh_adm());

-- Cadastros de configuração: todos leem; só adm altera.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['planos', 'tipos_atendimento', 'tipos_atendimento_profissionais', 'feriados', 'profissionais', 'jornadas'] loop
    execute format('drop policy "autenticados: acesso total" on %I', tabela);
    execute format('create policy "autenticados: leem" on %I for select to authenticated using (true)', tabela);
    execute format('create policy "adm: altera" on %I for all to authenticated using (eh_adm()) with check (eh_adm())', tabela);
  end loop;
end;
$$;
