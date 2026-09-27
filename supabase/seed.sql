-- Dados FICTÍCIOS para desenvolvimento e testes (banco local). Nenhum dado real.
-- Roda automaticamente em `supabase start` (primeira vez) e `supabase db reset`.
--
-- A agenda é gerada em relação à data de hoje (semana passada, atual e as duas
-- próximas), então "Hoje" sempre mostra uma semana preenchida. A escolha de quem
-- tem atendimento em cada horário é determinística (hash), não aleatória: o
-- mesmo dia gera sempre a mesma agenda.

insert into planos (nome, cor, duracao_padrao_min, valor_padrao) values
  ('AMA', '#F6D365', 30, null),
  ('APAE', '#A8DDB5', 30, null),
  ('Particular', '#D9534F', 45, null),
  ('Particular - Tabela B', '#F2A19D', 45, 150),
  ('Unimed', '#2E7D5B', 45, 120),
  ('Unimed - Reembolso', '#4A90D9', 45, 200),
  ('Reuniões e Visitas', '#D0D3D4', 45, null);

insert into tipos_atendimento (nome) values
  ('Sessão Psicologia'),
  ('Sessão Fonoaudiologia'),
  ('Sessão ABA'),
  ('Atendimento Pedagógico'),
  ('Consulta Nutricional');

insert into profissionais (nome, especialidade, nome_legado) values
  ('Ana Beatriz Costa', 'Psicóloga', null),
  ('Bruno Almeida', 'Fonoaudiólogo', null),
  ('Carla Mendes', 'Neuropsicopedagoga', null),
  ('Daniel Rocha', 'Nutricionista', null),
  ('Elisa Fontes', 'Psicóloga', null),
  ('Fábio Nunes', 'Estagiário de Fono', null);

-- 48 pacientes com nomes inventados (combinação de listas) e plano variado.
insert into pacientes (nome, responsavel, data_nascimento, celular, plano_id)
select
  (array['Alice','Bento','Cecília','Davi','Elena','Felipe','Giovana','Heitor','Isis','Joaquim','Laura','Miguel'])[1 + (g - 1) % 12]
    || ' ' || (array['Andrade','Barros','Cardoso','Duarte'])[1 + (g - 1) / 12],
  (array['Mariana','Paulo','Renata','Sérgio','Tatiana','Vinícius'])[1 + g % 6] || ' ' || (array['Andrade','Barros','Cardoso','Duarte'])[1 + (g - 1) / 12],
  date '2014-01-01' + (g * 97) % 3650,
  '(49) 90000-' || lpad(g::text, 4, '0'),
  (select id from planos order by nome offset (g % 7) limit 1)
from generate_series(1, 48) as g;

-- Agenda: para cada profissional e dia útil, horários a cada 45 min (manhã e
-- tarde, sem o almoço). Cerca de 60% dos horários ficam ocupados. Gerada numa
-- tabela temporária e depois gravada em atendimentos + atendimento_profissionais.
create temporary table agenda_gerada (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid,
  paciente_id uuid,
  plano_id uuid,
  tipo_id uuid,
  inicio timestamptz,
  fim timestamptz,
  valor numeric,
  status status_atendimento
);

with
  profs as (select id, row_number() over (order by nome) as n, especialidade from profissionais),
  pacs as (select id, row_number() over (order by nome) as n, plano_id from pacientes),
  segunda as (select date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date as d),
  dias as (select (select d from segunda) + s * 7 + wd as dia from generate_series(-1, 2) s, generate_series(0, 4) wd),
  horarios as (select h from unnest(array['08:00','08:45','09:30','10:15','11:00','13:30','14:15','15:00','15:45','16:30']::time[]) h),
  vagas as (
    select p.id as profissional_id, p.n as pn, p.especialidade, dia, h,
           abs(hashtext(p.n || dia::text || h::text)::bigint) as sorteio
    from profs p cross join dias cross join horarios
  ),
  escolhidas as (
    select v.*, pac.id as paciente_id, pac.plano_id
    from vagas v
    join pacs pac on pac.n = 1 + (v.sorteio / 10) % 48
    where v.sorteio % 10 < 6
  )
insert into agenda_gerada (profissional_id, paciente_id, plano_id, tipo_id, inicio, fim, valor, status)
select
  e.profissional_id,
  e.paciente_id,
  e.plano_id,
  (select id from tipos_atendimento where nome = case
     when e.especialidade like 'Psic%' then 'Sessão Psicologia'
     when e.especialidade like 'Fono%' or e.especialidade like 'Estagi%' then 'Sessão Fonoaudiologia'
     when e.especialidade like 'Neuro%' then 'Atendimento Pedagógico'
     else 'Consulta Nutricional' end),
  (e.dia + e.h) at time zone 'America/Sao_Paulo',
  (e.dia + e.h + make_interval(mins => pl.duracao_padrao_min)) at time zone 'America/Sao_Paulo',
  pl.valor_padrao,
  case
    when e.dia >= (now() at time zone 'America/Sao_Paulo')::date then
      case when e.sorteio % 29 = 0 then 'desmarcado' else 'marcado' end
    when e.sorteio % 17 = 0 then 'faltou'
    when e.sorteio % 23 = 0 then 'desmarcado'
    else 'atendido'
  end::status_atendimento
from escolhidas e
join planos pl on pl.id = e.plano_id;

-- Um atendimento paralelo por dia (mesmo profissional e horário), para exercitar
-- a exibição lado a lado.
insert into agenda_gerada (profissional_id, paciente_id, plano_id, tipo_id, inicio, fim, status)
select a.profissional_id, p.id, p.plano_id, a.tipo_id, a.inicio, a.inicio + interval '30 minutes', 'marcado'
from (
  select distinct on ((inicio at time zone 'America/Sao_Paulo')::date) *
  from agenda_gerada
  where extract(hour from inicio at time zone 'America/Sao_Paulo') = 14
  order by (inicio at time zone 'America/Sao_Paulo')::date, inicio
) a
join lateral (select id, plano_id from pacientes where id <> a.paciente_id order by nome limit 1) p on true;

insert into atendimentos (id, paciente_id, plano_id, tipo_id, inicio, fim, valor, status)
select id, paciente_id, plano_id, tipo_id, inicio, fim, valor, status from agenda_gerada;

insert into atendimento_profissionais (atendimento_id, profissional_id)
select id, profissional_id from agenda_gerada;

-- Atendimento conjunto: um por dia com dois profissionais (o card aparece nas
-- duas colunas).
insert into atendimento_profissionais (atendimento_id, profissional_id)
select distinct on ((g.inicio at time zone 'America/Sao_Paulo')::date)
  g.id,
  (select id from profissionais where id <> g.profissional_id order by nome limit 1)
from agenda_gerada g
where to_char(g.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') = '09:30'
order by (g.inicio at time zone 'America/Sao_Paulo')::date, g.inicio;

drop table agenda_gerada;

-- Uma série recorrente (semanal, 8 sessões) às quartas 17:15, criada pela mesma
-- função usada pelo formulário.
select criar_atendimentos(
  p_paciente_id => (select id from pacientes order by nome limit 1),
  p_profissionais => array[(select id from profissionais order by nome limit 1)],
  p_inicios => array(
    select ((date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date + 2 + s * 7) + time '17:15') at time zone 'America/Sao_Paulo'
    from generate_series(0, 7) s
  ),
  p_duracao_min => 45,
  p_plano_id => (select plano_id from pacientes order by nome limit 1),
  p_tipo_id => (select id from tipos_atendimento where nome = 'Sessão Psicologia'),
  p_observacao => 'Série de exemplo (seed)',
  p_frequencia => 'semanal',
  p_sessoes => 8
);
