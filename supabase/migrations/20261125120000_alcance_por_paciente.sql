-- Excluir e desmarcar sem depender da série (o "relacionar" saiu): além de "só este",
--   • mesmo_horario: todos do paciente no mesmo dia da semana e horário;
--   • proximos_do_paciente: este e todos os próximos do paciente, em qualquer horário.
-- Os dois só pegam atendimentos de agora em diante (o passado tem registro, guia e
-- cobrança), com o mesmo profissional, e pulam os já desmarcados. O próprio atendimento
-- escolhido entra sempre. "seguintes" e "todos" (da série) continuam para a edição.

alter type alcance_serie add value if not exists 'mesmo_horario';
alter type alcance_serie add value if not exists 'proximos_do_paciente';

-- Os valores novos são comparados como texto: um valor de enum acabado de criar não pode
-- ser usado como literal na mesma transação.
create or replace function atendimentos_do_alcance(p_id uuid, p_alcance alcance_serie) returns setof uuid
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.id
  from atendimentos a
  join atendimentos base on base.id = p_id
  where a.excluido_em is null
    and (
      a.id = base.id
      or (
        p_alcance::text in ('seguintes', 'todos')
        and base.recorrencia_id is not null
        and a.recorrencia_id = base.recorrencia_id
        and (p_alcance::text = 'todos' or a.inicio >= base.inicio)
      )
      or (
        p_alcance::text in ('mesmo_horario', 'proximos_do_paciente')
        and a.paciente_id = base.paciente_id
        and a.inicio >= now()
        and a.status <> 'desmarcado'
        and exists (
          select 1
            from atendimento_profissionais ap
            join atendimento_profissionais bp on bp.profissional_id = ap.profissional_id
           where ap.atendimento_id = a.id and bp.atendimento_id = base.id
        )
        and (
          (p_alcance::text = 'proximos_do_paciente' and a.inicio >= base.inicio)
          or (
            p_alcance::text = 'mesmo_horario'
            and extract(isodow from a.inicio at time zone 'America/Sao_Paulo') = extract(isodow from base.inicio at time zone 'America/Sao_Paulo')
            and (a.inicio at time zone 'America/Sao_Paulo')::time = (base.inicio at time zone 'America/Sao_Paulo')::time
          )
        )
      )
    )
$$;

-- Prévia para a tela: quais atendimentos a ação vai atingir (datas, sem valores).
create function previa_do_alcance(p_id uuid, p_alcance alcance_serie)
returns table (id uuid, inicio timestamptz, status status_atendimento)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.inicio, a.status
    from atendimentos a
   where auth.uid() is not null
     and a.id in (select atendimentos_do_alcance(p_id, p_alcance))
   order by a.inicio;
$$;

revoke all on function previa_do_alcance(uuid, alcance_serie) from public, anon;
grant execute on function previa_do_alcance(uuid, alcance_serie) to authenticated;
