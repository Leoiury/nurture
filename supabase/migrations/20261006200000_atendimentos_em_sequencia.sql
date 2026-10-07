-- Atendimentos em sequência: um atendimento com cada profissional, colados um no
-- outro (ex.: fono 09:00 e psicologia 09:45 para o mesmo paciente). Cada item tem
-- os argumentos de criar_atendimentos; todos são criados numa transação só.

create function criar_atendimentos_em_sequencia(p_itens jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  a jsonb;
  quantidade integer := 0;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) < 2 then
    raise exception 'Informe ao menos dois atendimentos.';
  end if;
  for a in select * from jsonb_array_elements(p_itens) loop
    select quantidade + count(*) into quantidade
    from criar_atendimentos(
      p_paciente_id => (a ->> 'p_paciente_id')::uuid,
      p_profissionais => array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x),
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
  end loop;
  return quantidade;
end;
$$;
