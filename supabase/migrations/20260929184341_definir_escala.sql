-- Escala semanal de um profissional (tabela jornadas): troca a escala inteira
-- numa transação. Lista vazia: sem escala própria (vale o expediente padrão).
-- p_intervalos: [{ "dia_semana": 1, "hora_inicio": "13:00", "hora_fim": "18:00" }, ...]

create function definir_escala(p_profissional uuid, p_intervalos jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if jsonb_typeof(p_intervalos) <> 'array' then
    raise exception 'Escala inválida.';
  end if;

  delete from jornadas where profissional_id = p_profissional;

  insert into jornadas (profissional_id, dia_semana, hora_inicio, hora_fim)
  select p_profissional, (i ->> 'dia_semana')::smallint, (i ->> 'hora_inicio')::time, (i ->> 'hora_fim')::time
  from jsonb_array_elements(p_intervalos) as i;
  get diagnostics quantidade = row_count;

  -- Intervalos sobrepostos no mesmo dia não fazem sentido.
  if exists (
    select 1 from jornadas a join jornadas b
      on a.profissional_id = b.profissional_id and a.dia_semana = b.dia_semana and a.id < b.id
     and a.hora_inicio < b.hora_fim and b.hora_inicio < a.hora_fim
    where a.profissional_id = p_profissional
  ) then
    raise exception 'Há intervalos sobrepostos na escala.';
  end if;

  return quantidade;
end;
$$;
