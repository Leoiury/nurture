-- Triagem: novo tipo de atendimento que usa o mesmo modelo da anamnese, por enquanto.
-- O título separa as duas: uma triagem em andamento não se mistura com uma anamnese
-- em andamento do mesmo paciente, e a ficha mostra qual é qual.

insert into tipos_atendimento (nome, abre_anamnese) values ('Triagem', true)
on conflict (nome) do update set abre_anamnese = true, ativo = true;

alter table anamneses add column titulo text not null default 'Anamnese';

-- Quem vem de um atendimento leva o nome do tipo dele.
update anamneses a
   set titulo = t.nome
  from atendimentos at
  join tipos_atendimento t on t.id = at.tipo_id
 where at.id = a.atendimento_id
   and t.abre_anamnese;

drop index anamneses_uma_em_andamento;
create unique index anamneses_uma_em_andamento on anamneses (paciente_id, profissional_id, titulo) where salva_em is null;

create or replace function iniciar_anamnese(p_paciente uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  atual uuid;
begin
  if not pode_ver_clinico() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  select id into atual from anamneses
   where paciente_id = p_paciente and profissional_id = meu_profissional() and salva_em is null and titulo = 'Anamnese';
  if found then
    return atual;
  end if;
  insert into anamneses (paciente_id, profissional_id) values (p_paciente, meu_profissional()) returning id into atual;
  return atual;
end;
$$;

create or replace function iniciar_anamnese_do_atendimento(p_atendimento uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  atual uuid;
  paciente uuid;
  nome_do_tipo text;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  perform garantir_meus_atendimentos(p_atendimento, 'este');

  select id into atual from anamneses where atendimento_id = p_atendimento and profissional_id = meu_profissional();
  if found then
    return atual;
  end if;

  select a.paciente_id, coalesce(t.nome, 'Anamnese') into paciente, nome_do_tipo
    from atendimentos a
    left join tipos_atendimento t on t.id = a.tipo_id
   where a.id = p_atendimento;
  update anamneses set atendimento_id = p_atendimento
   where paciente_id = paciente and profissional_id = meu_profissional() and salva_em is null and titulo = nome_do_tipo
   returning id into atual;
  if found then
    return atual;
  end if;

  insert into anamneses (paciente_id, profissional_id, atendimento_id, titulo)
  values (paciente, meu_profissional(), p_atendimento, nome_do_tipo)
  returning id into atual;
  return atual;
end;
$$;
