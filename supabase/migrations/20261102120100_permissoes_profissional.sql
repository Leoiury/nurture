-- Permissões do perfil profissional: nunca lê valores, nem pela API.
--
-- Todos os logins usam o mesmo papel no banco, então não dá para esconder uma
-- coluna de um só perfil. O profissional perde o acesso às tabelas com valores e
-- lê visões sem essas colunas (atendimentos_equipe, planos_equipe). ADM e recepção
-- seguem como antes. As alterações do profissional virão por funções próprias.

-- Sem olhar `ativo`: um profissional desativado não ganha acesso às tabelas.
create function eh_profissional() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from usuarios where id = auth.uid() and perfil = 'profissional')
$$;

-- O profissional vinculado ao login. Vale também para ADM que atende (ex.: a direção).
create function meu_profissional() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select profissional_id from usuarios where id = auth.uid() and ativo
$$;

-- Sem isto, o perfil 'profissional' do login viraria 'limitado' ao ser sincronizado.
create function perfil_do_login(p_perfil text) returns perfil_usuario
language sql immutable as $$
  select case
    when p_perfil in ('adm', 'direcao', 'dev') then 'adm'
    when p_perfil = 'profissional' then 'profissional'
    else 'limitado'
  end::perfil_usuario
$$;

create or replace function criar_usuario_do_login() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.usuarios (id, nome, email, perfil)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    perfil_do_login(new.raw_app_meta_data ->> 'perfil')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function sincronizar_perfil_do_login() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.raw_app_meta_data ->> 'perfil' is distinct from old.raw_app_meta_data ->> 'perfil'
     and new.raw_app_meta_data ->> 'perfil' is not null then
    update public.usuarios set perfil = perfil_do_login(new.raw_app_meta_data ->> 'perfil') where id = new.id;
  end if;
  return new;
end;
$$;

-- Tabelas com valores: fora do alcance do profissional.
drop policy "autenticados: acesso total" on atendimentos;
create policy "equipe: acesso total" on atendimentos
  for all to authenticated using (not eh_profissional()) with check (not eh_profissional());

drop policy "autenticados: leem" on planos;
create policy "equipe: leem" on planos
  for select to authenticated using (not eh_profissional());

-- O delta guarda antes/depois de todas as colunas, inclusive o valor.
drop policy "autenticados: leem" on atendimentos_alteracoes;
create policy "equipe: leem" on atendimentos_alteracoes
  for select to authenticated using (not eh_profissional());

-- As observações automáticas de mudança de valor citam as quantias.
drop policy "autenticados: leem" on atendimentos_observacoes;
create policy "autenticados: leem" on atendimentos_observacoes
  for select to authenticated using (not eh_profissional() or not (automatica and texto like 'Valor alterado%'));

-- Sem valores, mas alterados por funções próprias: o profissional só lê.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['atendimento_profissionais', 'recorrencias', 'guias'] loop
    execute format('drop policy "autenticados: acesso total" on %I', tabela);
    execute format('create policy "autenticados: leem" on %I for select to authenticated using (true)', tabela);
    execute format('create policy "equipe: altera" on %I for all to authenticated using (not eh_profissional()) with check (not eh_profissional())', tabela);
  end loop;
end;
$$;

-- Visões de leitura. Sem security_invoker: rodam como o dono e passam pelo RLS, por
-- isso só o select é liberado (visão simples aceitaria insert e update) e só com login.
create view atendimentos_equipe as
  select id, id_legado, recorrencia_id, paciente_id, plano_id, tipo_id, inicio, fim, status, observacao,
         criado_em, atualizado_em, motivo_desmarcacao, excluido_em, excluido_por, motivo_exclusao, importado_em
  from atendimentos
  where auth.uid() is not null;

create view planos_equipe as
  select id, nome, cor, duracao_padrao_min, ativo, exige_guia
  from planos
  where auth.uid() is not null;

revoke all on atendimentos_equipe, planos_equipe from anon, authenticated;
grant select on atendimentos_equipe, planos_equipe to authenticated;

-- A cobertura de guias não tem valores e precisa aparecer para o profissional.
create or replace view guias_dos_atendimentos with (security_invoker = true) as
  with faixas as (
    select g.id, g.recorrencia_id, g.numero, g.ordem, g.quantidade,
           coalesce(sum(g.quantidade) over (partition by g.recorrencia_id order by g.ordem rows between unbounded preceding and 1 preceding), 0::bigint) as antes,
           lead(g.id) over (partition by g.recorrencia_id order by g.ordem) is not null as renovada
    from guias g
  ), cadeias as (
    select recorrencia_id, min(a_partir_de) as inicio from guias group by recorrencia_id
  ), validos as (
    select a.id, a.recorrencia_id, row_number() over (partition by a.recorrencia_id order by a.inicio, a.id) as n
    from atendimentos_equipe a
    join cadeias c on c.recorrencia_id = a.recorrencia_id and a.inicio >= c.inicio
    where a.excluido_em is null and a.status <> 'desmarcado'
  )
  select v.id as atendimento_id, v.recorrencia_id, f.id as guia_id, f.numero, f.ordem,
         (v.n - f.antes)::integer as posicao, f.quantidade, f.renovada
  from validos v
  join faixas f on f.recorrencia_id = v.recorrencia_id and v.n > f.antes and v.n <= f.antes + f.quantidade;
