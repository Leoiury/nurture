-- Mudança de plano e de valores em massa.
--
-- 1. Observações automáticas também para mudança de valor e de plano (antes só
--    horário, status e exclusão). Ajustes em massa dizem a origem (nurture.origem).
-- 2. ajustar_valores_do_paciente: novo valor nos atendimentos do mesmo paciente e
--    mesma área (o "segmento"), só os futuros ou também os anteriores (só ADM).
-- 3. mudar_plano_dos_futuros: atendimentos futuros do paciente passam para outro
--    plano, cada um com o valor do plano para a sua área.
-- 4. reajustar_plano: depois de mudar os valores de um plano, os atendimentos
--    futuros dele que estavam com o valor antigo passam ao novo (só ADM).
-- 5. editar_atendimentos: opção de mudar o valor só do atendimento editado
--    (o resto da série mantém o seu), quando o valor tem alcance próprio.
-- 6. aplicar_planejamento aceita essas operações (e o plano padrão do paciente).
-- Desmarcados e excluídos nunca são alterados em massa.

-- 1. Observações de valor e plano --------------------------------------------------

create or replace function registrar_alteracao_atendimento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  antes jsonb;
  depois jsonb;
  origem text := nullif(current_setting('nurture.origem', true), '');
  sufixo text := case when origem is null then '' else ' (' || origem || ')' end;
  moeda constant text := 'FM999999990.00'; -- vírgula decimal: replace abaixo
begin
  if tg_op = 'INSERT' then
    insert into atendimentos_alteracoes (atendimento_id, operacao, depois)
    values (new.id, 'criacao', to_jsonb(new));
    return new;
  end if;

  -- Só os campos que mudaram (atualizado_em não conta).
  select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, to_jsonb(new) -> o.key)
    into antes, depois
  from jsonb_each(to_jsonb(old)) o
  where o.key <> 'atualizado_em' and o.value is distinct from to_jsonb(new) -> o.key;

  if antes is null then
    return new;
  end if;

  insert into atendimentos_alteracoes (atendimento_id, operacao, antes, depois)
  values (new.id, 'alteracao', antes, depois);

  -- Observações automáticas.
  if old.inicio is distinct from new.inicio or old.fim is distinct from new.fim then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Horário alterado de ' || formatar_periodo(old.inicio, old.fim)
                    || ' para ' || formatar_periodo(new.inicio, new.fim), true);
  end if;

  if old.status is distinct from new.status then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Status: ' || old.status || ' → ' || new.status
                    || case when new.status = 'desmarcado' and new.motivo_desmarcacao is not null
                            then ' (' || new.motivo_desmarcacao || ')' else '' end, true);
  end if;

  if old.plano_id is distinct from new.plano_id then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Plano alterado de ' || coalesce((select nome from planos where id = old.plano_id), 'nenhum')
                    || ' para ' || coalesce((select nome from planos where id = new.plano_id), 'nenhum') || sufixo, true);
  end if;

  if old.valor is distinct from new.valor then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Valor alterado de '
                    || coalesce('R$ ' || replace(to_char(old.valor, moeda), '.', ','), 'sem valor') || ' para '
                    || coalesce('R$ ' || replace(to_char(new.valor, moeda), '.', ','), 'sem valor') || sufixo, true);
  end if;

  if old.excluido_em is null and new.excluido_em is not null then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Excluído: ' || new.motivo_exclusao, true);
  elsif old.excluido_em is not null and new.excluido_em is null then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Exclusão desfeita', true);
  end if;

  return new;
end;
$$;

-- Valor de um plano para uma área (sem valor da área: o padrão).
create function valor_do_plano(p_plano uuid, p_area text) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select case p_area
           when 'fonoaudiologia' then coalesce(valor_fonoaudiologia, valor_padrao)
           when 'psicologia' then coalesce(valor_psicologia, valor_padrao)
           when 'nutricao' then coalesce(valor_nutricao, valor_padrao)
           when 'psicopedagogia' then coalesce(valor_psicopedagogia, valor_padrao)
           else valor_padrao
         end
  from planos where id = p_plano
$$;

-- 2. Valores do paciente na mesma área ---------------------------------------------
-- Segmento: atendimentos do paciente cujo tipo é da mesma área (tipo sem área:
-- o mesmo tipo). p_ignorar: o atendimento já editado.
create function ajustar_valores_do_paciente(
  p_paciente uuid, p_area text, p_tipo uuid, p_valor numeric, p_escopo text, p_ignorar uuid default null
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if p_escopo not in ('futuros', 'todos') then
    raise exception 'Escopo inválido.';
  end if;
  if p_escopo = 'todos' and not eh_adm() then
    raise exception 'Apenas administradores alteram também os atendimentos anteriores.';
  end if;
  perform set_config('nurture.origem', 'ajuste em massa do paciente', true);

  update atendimentos a
     set valor = p_valor
    from tipos_atendimento t
   where t.id = a.tipo_id
     and a.paciente_id = p_paciente
     and a.excluido_em is null
     and a.status <> 'desmarcado'
     and a.id is distinct from p_ignorar
     and (p_escopo = 'todos' or a.inicio >= now())
     and (case when p_area is not null then t.area = p_area else a.tipo_id = p_tipo end)
     and a.valor is distinct from p_valor;
  get diagnostics quantidade = row_count;

  perform set_config('nurture.origem', '', true);
  return quantidade;
end;
$$;

-- 3. Plano dos atendimentos futuros do paciente -------------------------------------
create function mudar_plano_dos_futuros(p_paciente uuid, p_plano uuid, p_ignorar uuid default null) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  perform set_config('nurture.origem', 'mudança de plano do paciente', true);

  update atendimentos a
     set plano_id = p_plano,
         valor = valor_do_plano(p_plano, (select area from tipos_atendimento where id = a.tipo_id))
   where a.paciente_id = p_paciente
     and a.excluido_em is null
     and a.status <> 'desmarcado'
     and a.inicio >= now()
     and a.id is distinct from p_ignorar
     and a.plano_id is distinct from p_plano;
  get diagnostics quantidade = row_count;

  perform set_config('nurture.origem', '', true);
  return quantidade;
end;
$$;

-- 4. Reajuste de um plano nos atendimentos futuros ----------------------------------
-- p_antigos: valores do plano antes da mudança ({"padrao": 120, "psicologia": null, ...}).
-- Só muda quem estava com o valor antigo da sua área (valores combinados à parte ficam).
create function reajustar_plano(p_plano uuid, p_antigos jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if not eh_adm() then
    raise exception 'Apenas administradores reajustam planos.';
  end if;
  perform set_config('nurture.origem', 'reajuste do plano', true);

  with alvo as (
    select a.id, t.area,
           coalesce((p_antigos ->> t.area)::numeric, (p_antigos ->> 'padrao')::numeric) as antigo
      from atendimentos a
      left join tipos_atendimento t on t.id = a.tipo_id
     where a.plano_id = p_plano
       and a.excluido_em is null
       and a.status <> 'desmarcado'
       and a.inicio >= now()
  )
  update atendimentos a
     set valor = valor_do_plano(p_plano, alvo.area)
    from alvo
   where a.id = alvo.id
     and a.valor is not distinct from alvo.antigo
     and a.valor is distinct from valor_do_plano(p_plano, alvo.area);
  get diagnostics quantidade = row_count;

  perform set_config('nurture.origem', '', true);
  return quantidade;
end;
$$;

-- 5. Editar: valor só no atendimento editado ----------------------------------------
drop function editar_atendimentos(uuid, alcance_serie, uuid, uuid[], date, time, integer, uuid, uuid, numeric);

create function editar_atendimentos(
  p_id uuid,
  p_alcance alcance_serie,
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_data date,
  p_hora time,
  p_duracao_min integer,
  p_plano_id uuid default null,
  p_tipo_id uuid default null,
  p_valor numeric default null,
  -- true: o valor muda só em p_id; o resto da série mantém o seu.
  p_valor_so_neste boolean default false
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  base atendimentos;
  deslocamento integer;
  alvo uuid;
  novo_inicio timestamptz;
  quantidade integer := 0;
begin
  if coalesce(cardinality(p_profissionais), 0) = 0 then
    raise exception 'Informe ao menos um profissional.';
  end if;
  if p_duracao_min is null or p_duracao_min <= 0 then
    raise exception 'Duração inválida.';
  end if;

  select * into base from atendimentos where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  deslocamento := p_data - (base.inicio at time zone 'America/Sao_Paulo')::date;

  for alvo in select atendimentos_do_alcance(p_id, p_alcance) loop
    select (((a.inicio at time zone 'America/Sao_Paulo')::date + deslocamento) + p_hora) at time zone 'America/Sao_Paulo'
      into novo_inicio
    from atendimentos a where a.id = alvo;

    update atendimentos
       set paciente_id = p_paciente_id,
           plano_id = p_plano_id,
           tipo_id = p_tipo_id,
           valor = case when p_valor_so_neste and alvo <> p_id then valor else p_valor end,
           inicio = novo_inicio,
           fim = novo_inicio + make_interval(mins => p_duracao_min)
     where id = alvo;

    delete from atendimento_profissionais
     where atendimento_id = alvo and profissional_id <> all (p_profissionais);
    insert into atendimento_profissionais (atendimento_id, profissional_id)
    select alvo, p from unnest(p_profissionais) as p
    on conflict do nothing;

    quantidade := quantidade + 1;
  end loop;

  return quantidade;
end;
$$;

-- 6. Planejamento: novas operações --------------------------------------------------
create or replace function aplicar_planejamento(p_operacoes jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  op jsonb;
  a jsonb;
  chave text;
  quantidade integer := 0;
  lista uuid[];
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode aplicar o planejamento.';
  end if;
  if jsonb_typeof(p_operacoes) <> 'array' then
    raise exception 'Operações inválidas.';
  end if;

  for op in select value from jsonb_array_elements(p_operacoes) loop
    a := op -> 'args';
    chave := coalesce(op ->> 'chave', '?');

    -- Operações sobre um atendimento existente conferem como ele estava.
    if op -> 'esperado' is not null and not planejamento_confere((a ->> 'p_id')::uuid, op -> 'esperado') then
      raise exception 'CONFLITO %', chave;
    end if;

    begin
      case op ->> 'tipo'
        when 'criar' then
          lista := array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x);
          perform criar_atendimentos(
            p_paciente_id => (a ->> 'p_paciente_id')::uuid,
            p_profissionais => lista,
            p_inicios => array(select x::timestamptz from jsonb_array_elements_text(a -> 'p_inicios') as x),
            p_duracao_min => (a ->> 'p_duracao_min')::integer,
            p_status => coalesce(a ->> 'p_status', 'marcado')::status_atendimento,
            p_plano_id => (a ->> 'p_plano_id')::uuid,
            p_tipo_id => (a ->> 'p_tipo_id')::uuid,
            p_valor => (a ->> 'p_valor')::numeric,
            p_observacao => a ->> 'p_observacao',
            p_frequencia => (a ->> 'p_frequencia')::frequencia_recorrencia,
            p_data_fim => (a ->> 'p_data_fim')::date,
            p_sessoes => (a ->> 'p_sessoes')::integer
          );
        when 'editar' then
          lista := array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x);
          perform editar_atendimentos(
            p_id => (a ->> 'p_id')::uuid,
            p_alcance => (a ->> 'p_alcance')::alcance_serie,
            p_paciente_id => (a ->> 'p_paciente_id')::uuid,
            p_profissionais => lista,
            p_data => (a ->> 'p_data')::date,
            p_hora => (a ->> 'p_hora')::time,
            p_duracao_min => (a ->> 'p_duracao_min')::integer,
            p_plano_id => (a ->> 'p_plano_id')::uuid,
            p_tipo_id => (a ->> 'p_tipo_id')::uuid,
            p_valor => (a ->> 'p_valor')::numeric,
            p_valor_so_neste => coalesce((a ->> 'p_valor_so_neste')::boolean, false)
          );
        when 'mover' then
          perform mover_atendimento(
            p_id => (a ->> 'p_id')::uuid,
            p_inicio => (a ->> 'p_inicio')::timestamptz,
            p_de_profissional => (a ->> 'p_de_profissional')::uuid,
            p_para_profissional => (a ->> 'p_para_profissional')::uuid
          );
        when 'desmarcar' then
          perform desmarcar_atendimentos((a ->> 'p_id')::uuid, (a ->> 'p_alcance')::alcance_serie, a ->> 'p_motivo');
        when 'excluir' then
          perform excluir_atendimentos((a ->> 'p_id')::uuid, (a ->> 'p_alcance')::alcance_serie, a ->> 'p_motivo');
        when 'plano_padrao' then
          update pacientes set plano_id = (a ->> 'p_plano')::uuid where id = (a ->> 'p_paciente')::uuid;
        when 'plano_futuros' then
          perform mudar_plano_dos_futuros((a ->> 'p_paciente')::uuid, (a ->> 'p_plano')::uuid, (a ->> 'p_ignorar')::uuid);
        when 'valores_paciente' then
          perform ajustar_valores_do_paciente(
            (a ->> 'p_paciente')::uuid, a ->> 'p_area', (a ->> 'p_tipo')::uuid, (a ->> 'p_valor')::numeric,
            a ->> 'p_escopo', (a ->> 'p_ignorar')::uuid
          );
        else
          raise exception 'Operação desconhecida: %', op ->> 'tipo';
      end case;
    exception when others then
      raise exception 'ERRO %: %', chave, sqlerrm;
    end;

    quantidade := quantidade + 1;
  end loop;

  delete from planejamento where unico;
  return quantidade;
end;
$$;
