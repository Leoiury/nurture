-- Notificações, guias como saldo, ocultar paciente e devolutivas.
--
-- 1. Avisos (notificações gravadas): o profissional exclui atendimentos direto, sem pedido,
--    e a recepção e o ADM recebem o aviso. Os pedidos de exclusão em aberto são confirmados.
-- 2. Ocultar paciente: o profissional exclui os atendimentos futuros dele e o paciente sai
--    da lista dele, até alguém marcar um atendimento entre os dois. Substitui o pedido de
--    inativação: inativar e reativar passam a ser só da recepção e do ADM.
-- 3. Guias como saldo: a guia não pertence mais a uma série. Um controle de guia (paciente,
--    plano, profissionais e marco zero) soma as guias recebidas, e gastam sessão todos os
--    atendimentos do paciente no plano, com um dos profissionais, desde o marco zero.
--    Sai o "relacionar atendimentos".
-- 4. Devolutiva: tipo de atendimento próprio.
-- 5. Pendências (calculadas): guia perto do fim e devolutiva a marcar.

-- 1. Avisos ---------------------------------------------------------------------------

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('exclusao', 'ocultacao')),
  criado_em timestamptz not null default now(),
  autor uuid references usuarios on delete set null,
  -- Fica no registro: o nome de quem fez não muda com o tempo.
  autor_nome text,
  paciente_id uuid references pacientes on delete cascade,
  profissional_id uuid references profissionais,
  motivo text,
  -- Os atendimentos citados: [{"id": ..., "inicio": ...}].
  atendimentos jsonb not null default '[]'
);

create index on notificacoes (criado_em desc);

alter table notificacoes enable row level security;
create policy "equipe: leem" on notificacoes
  for select to authenticated using (not eh_profissional());

create table notificacoes_lidas (
  notificacao_id uuid not null references notificacoes on delete cascade,
  usuario_id uuid not null default auth.uid() references usuarios on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (notificacao_id, usuario_id)
);

alter table notificacoes_lidas enable row level security;
create policy "cada um: as suas" on notificacoes_lidas
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Um aviso por paciente entre os atendimentos (já excluídos) da lista.
create function notificar_exclusao(p_alvos uuid[], p_motivo text, p_tipo text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into notificacoes (tipo, autor, autor_nome, paciente_id, profissional_id, motivo, atendimentos)
  select p_tipo, auth.uid(), (select nome from usuarios where id = auth.uid()), a.paciente_id,
         (select profissional_id from usuarios where id = auth.uid()), p_motivo,
         jsonb_agg(jsonb_build_object('id', a.id, 'inicio', a.inicio) order by a.inicio)
    from atendimentos a
   where a.id = any (p_alvos)
   group by a.paciente_id;
$$;

revoke all on function notificar_exclusao(uuid[], text, text) from public, anon, authenticated;

-- O profissional exclui os próprios atendimentos direto, e a equipe é avisada.
create function profissional_excluir_atendimentos(p_id uuid, p_alcance alcance_serie, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  alvos uuid[];
begin
  perform garantir_meus_atendimentos(p_id, p_alcance);
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da exclusão.';
  end if;
  alvos := array(select atendimentos_do_alcance(p_id, p_alcance));
  update atendimentos
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = trim(p_motivo)
   where id = any (alvos);
  perform notificar_exclusao(alvos, trim(p_motivo), 'exclusao');
  return cardinality(alvos);
end;
$$;

-- Os pedidos de exclusão em aberto valem como exclusões feitas, com o aviso de cada pedido.
insert into notificacoes (tipo, criado_em, autor, autor_nome, paciente_id, profissional_id, motivo, atendimentos)
select 'exclusao', a.exclusao_solicitada_em, u.id, u.nome, a.paciente_id, u.profissional_id,
       min(a.exclusao_motivo), jsonb_agg(jsonb_build_object('id', a.id, 'inicio', a.inicio) order by a.inicio)
  from atendimentos a
  left join usuarios u on u.id = a.exclusao_solicitada_por
 where a.exclusao_solicitada_em is not null and a.excluido_em is null
 group by a.exclusao_solicitada_em, a.exclusao_solicitada_por, u.id, u.nome, u.profissional_id, a.paciente_id;

update atendimentos
   set excluido_em = now(), excluido_por = (select u.id from usuarios u where u.id = exclusao_solicitada_por), motivo_exclusao = exclusao_motivo
 where exclusao_solicitada_em is not null and excluido_em is null;

drop function profissional_solicitar_exclusao(uuid, alcance_serie, text);
drop function confirmar_exclusao(uuid);
drop function recusar_exclusao(uuid);
drop function atendimentos_do_pedido(uuid);

-- 2. Ocultar paciente -------------------------------------------------------------------

create table pacientes_ocultos (
  paciente_id uuid not null references pacientes on delete cascade,
  profissional_id uuid not null references profissionais on delete cascade,
  ocultado_em timestamptz not null default now(),
  primary key (paciente_id, profissional_id)
);

alter table pacientes_ocultos enable row level security;
create policy "autenticados leem" on pacientes_ocultos
  for select to authenticated using (true);

-- Quem pediu a inativação e ainda não reativou continua sem ver o paciente.
insert into pacientes_ocultos (paciente_id, profissional_id, ocultado_em)
select distinct on (paciente_id, profissional_id) paciente_id, profissional_id, pedido_em
  from inativacoes_pedidas
 where reativado_em is null and decisao is distinct from 'recusar'
 order by paciente_id, profissional_id, pedido_em desc;

drop function pedir_inativacao(uuid, text);
drop function decidir_inativacao(uuid, text);
drop function reativar_paciente_para_mim(uuid);
drop function pedir_exclusao_dos_futuros(uuid, text);
drop table inativacoes_pedidas;

-- O profissional exclui os atendimentos dele de agora em diante e deixa de ver o paciente.
create function ocultar_paciente(p_paciente uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  alvos uuid[];
begin
  if not eh_profissional() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo.';
  end if;
  if not exists (select 1 from pacientes where id = p_paciente) then
    raise exception 'Paciente não encontrado.';
  end if;
  alvos := array(
    select a.id from atendimentos a
     where a.paciente_id = p_paciente
       and a.inicio >= now()
       and a.excluido_em is null
       and exists (select 1 from atendimento_profissionais ap where ap.atendimento_id = a.id and ap.profissional_id = meu_profissional())
  );
  update atendimentos
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = trim(p_motivo)
   where id = any (alvos);
  insert into pacientes_ocultos (paciente_id, profissional_id)
  values (p_paciente, meu_profissional())
  on conflict (paciente_id, profissional_id) do update set ocultado_em = now();

  insert into notificacoes (tipo, autor, autor_nome, paciente_id, profissional_id, motivo, atendimentos)
  select 'ocultacao', auth.uid(), (select nome from usuarios where id = auth.uid()), p_paciente, meu_profissional(), trim(p_motivo),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'inicio', a.inicio) order by a.inicio) from atendimentos a where a.id = any (alvos)), '[]');
  return cardinality(alvos);
end;
$$;

-- Um atendimento novo entre os dois traz o paciente de volta para o profissional.
create function reexibir_paciente_ocultado() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from pacientes_ocultos o
   using atendimentos a
   where a.id = new.atendimento_id
     and o.paciente_id = a.paciente_id
     and o.profissional_id = new.profissional_id;
  return new;
end;
$$;

create trigger reexibir_paciente_ocultado after insert on atendimento_profissionais
  for each row execute function reexibir_paciente_ocultado();

-- Inativar e reativar: só a recepção e o ADM.
create or replace function travar_inativacao_pelo_profissional() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.ativo is distinct from new.ativo and eh_profissional() then
    raise exception 'Só a recepção ou um administrador inativa ou reativa pacientes.';
  end if;
  return new;
end;
$$;

-- 3. Guias como saldo --------------------------------------------------------------------

create table controles_de_guia (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes on delete cascade,
  -- Nulo: atendimentos de qualquer plano gastam a guia.
  plano_id uuid references planos,
  -- A partir de quando os atendimentos gastam sessão.
  marco_zero timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null
);

create index on controles_de_guia (paciente_id);

create table controles_de_guia_profissionais (
  controle_id uuid not null references controles_de_guia on delete cascade,
  profissional_id uuid not null references profissionais,
  primary key (controle_id, profissional_id)
);

create index on controles_de_guia_profissionais (profissional_id);

-- Cada atendimento cai em no máximo um controle: o profissional não pode estar em dois
-- controles do mesmo paciente e plano.
create function profissional_em_um_controle() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (
    select 1
      from controles_de_guia_profissionais cp
      join controles_de_guia c on c.id = cp.controle_id
      join controles_de_guia n on n.id = new.controle_id
     where cp.profissional_id = new.profissional_id
       and cp.controle_id <> new.controle_id
       and c.paciente_id = n.paciente_id
       and (c.plano_id is null or n.plano_id is null or c.plano_id = n.plano_id)
  ) then
    raise exception 'Este profissional já está em outra guia deste paciente.';
  end if;
  return new;
end;
$$;

create trigger profissional_em_um_controle before insert on controles_de_guia_profissionais
  for each row execute function profissional_em_um_controle();

do $$
declare
  tabela text;
begin
  foreach tabela in array array['controles_de_guia', 'controles_de_guia_profissionais'] loop
    execute format('alter table %I enable row level security', tabela);
    execute format('create policy "autenticados: leem" on %I for select to authenticated using (true)', tabela);
    execute format('create policy "equipe: altera" on %I for all to authenticated using (not eh_profissional()) with check (not eh_profissional())', tabela);
  end loop;
end;
$$;

drop view guias_dos_atendimentos;
drop function relacionar_atendimentos(uuid, uuid[], frequencia_recorrencia);
drop function gerar_guia(uuid, integer, text, frequencia_recorrencia, timestamptz[]);
drop function renovar_guia(uuid, integer, text, timestamptz[]);
drop function excluir_guia(uuid);
drop function completar_serie(uuid, timestamptz, integer, timestamptz[]);

alter table guias add column controle_id uuid references controles_de_guia on delete cascade;
alter table guias drop constraint guias_recorrencia_id_ordem_key;

-- As guias de hoje: um controle por paciente, plano e profissional das séries com guia
-- (com um atendimento por profissional, cada série tem um só). Séries do mesmo trio se juntam.
do $$
declare
  grupo record;
  novo uuid;
begin
  for grupo in
    with series as (
      select g.recorrencia_id, min(g.a_partir_de) as inicio from guias g group by g.recorrencia_id
    ), dados as (
      select s.recorrencia_id, s.inicio, base.paciente_id, base.plano_id,
             (select ap.profissional_id from atendimento_profissionais ap where ap.atendimento_id = base.id limit 1) as profissional_id
        from series s
        cross join lateral (
          select a.id, a.paciente_id, a.plano_id from atendimentos a
           where a.recorrencia_id = s.recorrencia_id
           order by (a.inicio >= s.inicio) desc, a.excluido_em is not null, a.inicio
           limit 1
        ) base
    )
    select paciente_id, plano_id, profissional_id, min(inicio) as marco, array_agg(recorrencia_id) as series
      from dados
     where paciente_id is not null
     group by paciente_id, plano_id, profissional_id
  loop
    insert into controles_de_guia (paciente_id, plano_id, marco_zero)
    values (grupo.paciente_id, grupo.plano_id, grupo.marco)
    returning id into novo;
    if grupo.profissional_id is not null then
      insert into controles_de_guia_profissionais (controle_id, profissional_id) values (novo, grupo.profissional_id);
    end if;
    update guias g
       set controle_id = novo,
           ordem = o.n
      from (
        select id, row_number() over (order by a_partir_de, ordem) as n from guias where recorrencia_id = any (grupo.series)
      ) o
     where g.id = o.id;
  end loop;
end;
$$;

-- Guia sem atendimento de paciente (série vazia) não tem onde ficar.
delete from guias where controle_id is null;

alter table guias
  alter column controle_id set not null,
  drop column recorrencia_id,
  drop column a_partir_de,
  add constraint guias_controle_ordem unique (controle_id, ordem);

-- Os atendimentos que gastam sessão de cada controle (desmarcado e excluído não gastam).
create view atendimentos_dos_controles with (security_invoker = true) as
  select a.id as atendimento_id, a.inicio, a.status, a.paciente_id, c.id as controle_id, ap.profissional_id
    from atendimentos_equipe a
    join atendimento_profissionais ap on ap.atendimento_id = a.id
    join controles_de_guia_profissionais cp on cp.profissional_id = ap.profissional_id
    join controles_de_guia c on c.id = cp.controle_id
                            and c.paciente_id = a.paciente_id
                            and (c.plano_id is null or c.plano_id = a.plano_id)
                            and a.inicio >= c.marco_zero
   where a.excluido_em is null and a.status <> 'desmarcado';

-- Que guia cobre cada atendimento: as guias do controle se gastam em ordem, e a sessão
-- conta desde o marco zero (sessao 14 de total 20 = posicao 4 de quantidade 10 na 2ª guia).
create view guias_dos_atendimentos with (security_invoker = true) as
  with faixas as (
    select g.id, g.controle_id, g.numero, g.ordem, g.quantidade,
           coalesce(sum(g.quantidade) over (partition by g.controle_id order by g.ordem rows between unbounded preceding and 1 preceding), 0) as antes,
           sum(g.quantidade) over (partition by g.controle_id) as total,
           lead(g.id) over (partition by g.controle_id order by g.ordem) is not null as renovada
      from guias g
  ), numerados as (
    select x.*, row_number() over (partition by x.controle_id order by x.inicio, x.atendimento_id) as n
      from atendimentos_dos_controles x
  )
  select v.atendimento_id, v.paciente_id, v.controle_id, v.profissional_id, f.id as guia_id, f.numero, f.ordem,
         (v.n - f.antes)::integer as posicao, f.quantidade, f.renovada, v.n::integer as sessao, f.total::integer as total
    from numerados v
    join faixas f on f.controle_id = v.controle_id and v.n > f.antes and v.n <= f.antes + f.quantidade;

create function criar_guia(
  p_paciente uuid,
  p_plano uuid,
  p_profissionais uuid[],
  p_marco_zero timestamptz,
  p_numero text,
  p_quantidade integer
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  novo uuid;
begin
  if p_quantidade is null or p_quantidade not between 1 and 500 then
    raise exception 'A guia deve ter de 1 a 500 sessões.';
  end if;
  if coalesce(cardinality(p_profissionais), 0) = 0 then
    raise exception 'Escolha ao menos um profissional.';
  end if;
  insert into controles_de_guia (paciente_id, plano_id, marco_zero)
  values (p_paciente, p_plano, p_marco_zero)
  returning id into novo;
  insert into controles_de_guia_profissionais (controle_id, profissional_id)
  select novo, x from unnest(p_profissionais) as x group by x;
  insert into guias (controle_id, ordem, numero, quantidade)
  values (novo, 1, nullif(trim(p_numero), ''), p_quantidade);
  return novo;
end;
$$;

-- Renovar: mais uma guia no saldo, gasta depois das anteriores.
create function renovar_guia(p_controle uuid, p_numero text, p_quantidade integer) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  nova uuid;
begin
  if p_quantidade is null or p_quantidade not between 1 and 500 then
    raise exception 'A guia deve ter de 1 a 500 sessões.';
  end if;
  perform 1 from controles_de_guia where id = p_controle for update;
  if not found then
    raise exception 'Guia não encontrada.';
  end if;
  insert into guias (controle_id, ordem, numero, quantidade)
  values (p_controle, (select coalesce(max(ordem), 0) + 1 from guias where controle_id = p_controle), nullif(trim(p_numero), ''), p_quantidade)
  returning id into nova;
  return nova;
end;
$$;

-- Plano, profissionais e marco zero do controle. A divisão entre profissionais é refeita sozinha.
create function editar_guia(p_controle uuid, p_plano uuid, p_profissionais uuid[], p_marco_zero timestamptz) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if coalesce(cardinality(p_profissionais), 0) = 0 then
    raise exception 'Escolha ao menos um profissional.';
  end if;
  update controles_de_guia set plano_id = p_plano, marco_zero = p_marco_zero where id = p_controle;
  if not found then
    raise exception 'Guia não encontrada.';
  end if;
  delete from controles_de_guia_profissionais where controle_id = p_controle and profissional_id <> all (p_profissionais);
  insert into controles_de_guia_profissionais (controle_id, profissional_id)
  select p_controle, x from unnest(p_profissionais) as x group by x
  on conflict do nothing;
end;
$$;

-- Desfaz um engano: só a última guia do controle. Sem guias, o controle some.
create function excluir_guia(p_guia uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  controle uuid;
begin
  delete from guias g
   where g.id = p_guia
     and not exists (select 1 from guias s where s.controle_id = g.controle_id and s.ordem > g.ordem)
  returning g.controle_id into controle;
  if not found then
    raise exception 'Só a última guia pode ser excluída.';
  end if;
  delete from controles_de_guia c where c.id = controle and not exists (select 1 from guias where controle_id = controle);
end;
$$;

-- 4. Devolutiva -----------------------------------------------------------------------------

alter table tipos_atendimento add column devolutiva boolean not null default false;

insert into tipos_atendimento (nome, devolutiva) values ('Devolutiva', true)
on conflict (nome) do update set devolutiva = true, ativo = true;

-- 5. Pendências ------------------------------------------------------------------------------
-- Calculadas na hora: somem sozinhas quando a guia é renovada ou a devolutiva é marcada.
-- O profissional só vê as dos pacientes dele.
--
-- Devolutiva (por paciente, todos os profissionais juntos), quando não há uma já marcada:
--   • faltas nos últimos 30 dias, depois da última devolutiva: 3, ou 2 se o paciente teve até
--     5 atendimentos na janela (cerca de 1 por semana);
--   • 15 atendimentos ou 1 mês desde a última devolutiva (sem nenhuma: desde o primeiro
--     atendimento, e nunca antes de 23/11/2026, quando a regra começou).
-- Guia: restam 3 sessões ou menos de um controle em uso (atendimento agendado ou nos
-- últimos 30 dias).

create function pendencias()
returns table (tipo text, chave text, paciente_id uuid, paciente_nome text, profissionais uuid[], detalhe jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with validos as (
    select a.id, a.paciente_id, a.inicio, a.status, coalesce(t.devolutiva, false) as devolutiva
      from atendimentos a
      left join tipos_atendimento t on t.id = a.tipo_id
     where a.excluido_em is null and a.status <> 'desmarcado'
  ), por_paciente as (
    select v.paciente_id,
           max(v.inicio) filter (where v.devolutiva and v.inicio <= now()) as ultima,
           bool_or(v.devolutiva and v.inicio > now()) as marcada,
           min(v.inicio) filter (where not v.devolutiva) as primeiro
      from validos v
     group by v.paciente_id
  ), base as (
    select p.id, p.nome, d.ultima,
           coalesce(d.ultima, greatest(d.primeiro, timestamptz '2026-11-23 00:00:00-03')) as desde
      from pacientes p
      join por_paciente d on d.paciente_id = p.id
     where p.ativo and not coalesce(d.marcada, false)
  ), contas as (
    select b.id, b.nome, b.ultima, b.desde,
           count(*) filter (where not v.devolutiva and v.inicio < now() and v.inicio >= b.desde) as atendimentos,
           count(*) filter (where v.inicio < now() and v.inicio >= now() - interval '30 days' and v.inicio > coalesce(b.ultima, '-infinity'::timestamptz)) as na_janela,
           count(*) filter (where v.status = 'faltou' and v.inicio < now() and v.inicio >= now() - interval '30 days' and v.inicio > coalesce(b.ultima, '-infinity'::timestamptz)) as faltas
      from base b
      join validos v on v.paciente_id = b.id
     group by b.id, b.nome, b.ultima, b.desde
  ), devolutivas as (
    select c.*, case when c.na_janela <= 5 then 2 else 3 end as limiar from contas c
  ), todas as (
    select 'devolutiva'::text as tipo, 'devolutiva:' || d.id as chave, d.id as paciente_id, d.nome as paciente_nome,
           array(
             select distinct ap.profissional_id
               from atendimentos a
               join atendimento_profissionais ap on ap.atendimento_id = a.id
              where a.paciente_id = d.id and a.excluido_em is null and a.status <> 'desmarcado' and a.inicio >= now() - interval '60 days'
           ) as profissionais,
           jsonb_build_object(
             'faltas', d.faltas, 'limiar', d.limiar, 'atendimentos', d.atendimentos, 'ultima', d.ultima, 'desde', d.desde,
             'motivos', to_jsonb(array_remove(array[
               case when d.faltas >= d.limiar then 'faltas' end,
               case when d.atendimentos >= 15 then 'atendimentos' end,
               case when d.atendimentos > 0 and d.desde <= now() - interval '1 month' then 'mes' end
             ], null))
           ) as detalhe
      from devolutivas d
     where d.faltas >= d.limiar or d.atendimentos >= 15 or (d.atendimentos > 0 and d.desde <= now() - interval '1 month')
    union all
    select 'guia', 'guia:' || c.id, c.paciente_id, p.nome,
           array(select cp.profissional_id from controles_de_guia_profissionais cp where cp.controle_id = c.id),
           jsonb_build_object('controle', c.id, 'total', t.total, 'usadas', u.usadas, 'agendadas', u.agendadas,
                              'restantes', t.total - u.usadas, 'plano', pl.nome)
      from controles_de_guia c
      join pacientes p on p.id = c.paciente_id
      left join planos pl on pl.id = c.plano_id
      cross join lateral (select coalesce(sum(g.quantidade), 0) as total from guias g where g.controle_id = c.id) t
      cross join lateral (
        select count(*) filter (where x.inicio < now()) as usadas,
               count(*) filter (where x.inicio >= now()) as agendadas,
               max(x.inicio) as ultima
          from atendimentos_dos_controles x
         where x.controle_id = c.id
      ) u
     where p.ativo
       and t.total - u.usadas <= 3
       and (u.agendadas > 0 or u.ultima >= now() - interval '30 days')
  )
  select * from todas
   where auth.uid() is not null
     and (not eh_profissional() or meu_profissional() = any (todas.profissionais));
$$;

do $$
declare
  funcao text;
begin
  foreach funcao in array array[
    'profissional_excluir_atendimentos(uuid, alcance_serie, text)',
    'ocultar_paciente(uuid, text)',
    'criar_guia(uuid, uuid, uuid[], timestamptz, text, integer)',
    'renovar_guia(uuid, text, integer)',
    'editar_guia(uuid, uuid, uuid[], timestamptz)',
    'excluir_guia(uuid)',
    'pendencias()'
  ] loop
    execute format('revoke all on function %s from public, anon', funcao);
    execute format('grant execute on function %s to authenticated', funcao);
  end loop;
end;
$$;
