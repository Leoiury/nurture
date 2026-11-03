-- Anamnese como tipo de agendamento: o atendimento desse tipo abre a anamnese em vez
-- do registro de atendimento, e salvar a anamnese pela primeira vez o marca como atendido.
-- A marca fica em uma coluna, e não no nome: renomear o tipo não muda o comportamento.

alter table tipos_atendimento add column abre_anamnese boolean not null default false;

insert into tipos_atendimento (nome, abre_anamnese) values ('Anamnese', true)
on conflict (nome) do update set abre_anamnese = true, ativo = true;

-- Nula: anamnese feita sem agendamento, a partir do paciente.
alter table anamneses add column atendimento_id uuid references atendimentos on delete set null;

create index on anamneses (atendimento_id);

-- Abre a anamnese deste atendimento. Sem nenhuma ainda, aproveita a que estiver em
-- andamento para o paciente (só pode haver uma), ou começa outra.
create function iniciar_anamnese_do_atendimento(p_atendimento uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  atual uuid;
  paciente uuid;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  perform garantir_meus_atendimentos(p_atendimento, 'este');

  select id into atual from anamneses where atendimento_id = p_atendimento and profissional_id = meu_profissional();
  if found then
    return atual;
  end if;

  select paciente_id into paciente from atendimentos where id = p_atendimento;
  update anamneses set atendimento_id = p_atendimento
   where paciente_id = paciente and profissional_id = meu_profissional() and salva_em is null
   returning id into atual;
  if found then
    return atual;
  end if;

  insert into anamneses (paciente_id, profissional_id, atendimento_id)
  values (paciente, meu_profissional(), p_atendimento)
  returning id into atual;
  return atual;
end;
$$;

revoke all on function iniciar_anamnese_do_atendimento(uuid) from public, anon;
grant execute on function iniciar_anamnese_do_atendimento(uuid) to authenticated;

-- A mesma de antes, mais o status do atendimento na primeira vez que a anamnese é salva.
create or replace function salvar_anamnese(p_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rascunho anamneses_rascunhos;
  nova integer;
begin
  perform garantir_autor_da_anamnese(p_id);
  select versao + 1 into nova from anamneses where id = p_id for update;
  select * into rascunho from anamneses_rascunhos where anamnese_id = p_id;
  if not found then
    raise exception 'Não há alterações para salvar.';
  end if;

  insert into anamneses_versoes (anamnese_id, versao, conteudo, observacoes)
  values (p_id, nova, rascunho.conteudo, rascunho.observacoes);
  update anamneses
     set conteudo = rascunho.conteudo, observacoes = rascunho.observacoes, versao = nova, salva_em = coalesce(salva_em, now())
   where id = p_id;
  delete from anamneses_rascunhos where anamnese_id = p_id;

  if nova = 1 then
    update atendimentos set status = 'atendido', motivo_desmarcacao = null
     where id = (select atendimento_id from anamneses where id = p_id)
       and status in ('marcado', 'confirmado')
       and excluido_em is null;
  end if;
  return nova;
end;
$$;
