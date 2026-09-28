-- Mover um atendimento (arrastar o card): novo início, mesma duração; opcionalmente
-- troca um profissional por outro (a coluna de onde saiu pela de destino), mantendo
-- os demais de um atendimento conjunto. Histórico e observações saem dos gatilhos.

create function mover_atendimento(
  p_id uuid,
  p_inicio timestamptz,
  p_de_profissional uuid default null,
  p_para_profissional uuid default null
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update atendimentos
     set inicio = p_inicio, fim = p_inicio + (fim - inicio)
   where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  if p_de_profissional is not null and p_para_profissional is not null and p_de_profissional <> p_para_profissional then
    delete from atendimento_profissionais where atendimento_id = p_id and profissional_id = p_de_profissional;
    insert into atendimento_profissionais (atendimento_id, profissional_id)
    values (p_id, p_para_profissional)
    on conflict do nothing;
  end if;
end;
$$;
