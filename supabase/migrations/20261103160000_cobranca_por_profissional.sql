-- Cobrança: um atendimento com vários profissionais é cobrado como se cada um tivesse
-- feito um atendimento separado. `valor` continua sendo o de cada profissional; o total
-- é calculado, e por isso acompanha qualquer mudança de valor ou de profissionais.
--
-- Cada tipo diz se é cobrado. Os novos atendimentos de um tipo sem cobrança ficam sem valor.

create function valor_cobrado(a atendimentos) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select round(a.valor * greatest((select count(*) from atendimento_profissionais ap where ap.atendimento_id = a.id), 1), 2)
$$;

revoke all on function valor_cobrado(atendimentos) from public, anon;
grant execute on function valor_cobrado(atendimentos) to authenticated, service_role;

create or replace function saldo_do_atendimento(p_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(valor_cobrado(a), 0)
         - coalesce((select sum(pa.valor) from pagamentos_atendimentos pa where pa.atendimento_id = a.id), 0)
         - coalesce((select sum(b.valor) from baixas_atendimentos b where b.atendimento_id = a.id), 0)
    from atendimentos a
   where a.id = p_id
$$;

create or replace view atendimentos_em_aberto with (security_invoker = true) as
select a.id, a.inicio, a.status, valor_cobrado(a)::numeric(10, 2) as valor, a.paciente_id, a.plano_id, a.tipo_id
  from atendimentos a
 where a.excluido_em is null
   and a.status in ('atendido', 'faltou')
   and a.valor > 0
   and saldo_do_atendimento(a.id) > 0.005;

-- Por enquanto, todos os tipos continuam cobrados.
alter table tipos_atendimento add column cobrar boolean not null default true;

create function atendimento_sem_valor_se_nao_cobrado() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.valor is not null and exists (select 1 from tipos_atendimento where id = new.tipo_id and not cobrar) then
    new.valor := null;
  end if;
  return new;
end;
$$;

create trigger sem_valor_se_nao_cobrado before insert or update of valor, tipo_id on atendimentos
  for each row execute function atendimento_sem_valor_se_nao_cobrado();

-- Ao mudar a chave, só o que ainda vai acontecer acompanha: o histórico fica como está.
create function tipo_mudou_cobranca() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update atendimentos
     set valor = case when new.cobrar then coalesce(valor, valor_do_plano(plano_id, new.area)) end
   where tipo_id = new.id
     and excluido_em is null
     and inicio >= now()
     and status in ('marcado', 'confirmado');
  return new;
end;
$$;

create trigger mudou_cobranca after update of cobrar on tipos_atendimento
  for each row when (old.cobrar is distinct from new.cobrar)
  execute function tipo_mudou_cobranca();
