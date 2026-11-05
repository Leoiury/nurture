-- Calendário do profissional: a cor do card segue o status do atendimento, e cada
-- profissional pode trocar as próprias cores. Vazio: a paleta padrão do app.

alter table usuarios add column cores_status jsonb not null default '{}';

-- Só o próprio login, e só status conhecidos com cor em hexadecimal.
create function definir_cores_status(p_cores jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p_cores) <> 'object' or exists (
    select 1 from jsonb_each_text(p_cores) c
     where c.key not in (select unnest(enum_range(null::status_atendimento))::text)
        or c.value !~ '^#[0-9A-Fa-f]{6}$'
  ) then
    raise exception 'Cores inválidas.';
  end if;
  update usuarios set cores_status = p_cores where id = auth.uid();
end;
$$;

revoke all on function definir_cores_status(jsonb) from public, anon;
grant execute on function definir_cores_status(jsonb) to authenticated;
