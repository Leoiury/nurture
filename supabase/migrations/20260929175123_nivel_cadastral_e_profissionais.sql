-- 1. Nível do cadastro dos pacientes (para a visão "Cadastro" em Pacientes).
--
-- Itens avaliados: responsável, nascimento, CPF, celular, endereço
-- (rua, bairro, cidade, UF e CEP) e plano. Nada faltando: completo; faltam 1 ou
-- 2: falta informação; 3 ou mais: crítico. Um gatilho mantém o nível e a lista
-- do que falta sempre atualizados.

create type nivel_cadastral as enum ('completo', 'falta_informacao', 'critico');

alter table pacientes
  add column pendencias_cadastrais text[] not null default '{}',
  add column nivel_cadastral nivel_cadastral not null default 'critico';

create function atualizar_nivel_cadastral() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  faltando text[] := '{}';
  vazio constant text := '';
begin
  if coalesce(trim(new.responsavel), vazio) = vazio then faltando := array_append(faltando, 'responsável'); end if;
  if new.data_nascimento is null then faltando := array_append(faltando, 'nascimento'); end if;
  if coalesce(trim(new.cpf), vazio) = vazio then faltando := array_append(faltando, 'CPF'); end if;
  if coalesce(trim(new.celular), vazio) = vazio then faltando := array_append(faltando, 'celular'); end if;
  if coalesce(trim(new.endereco), vazio) = vazio or coalesce(trim(new.bairro), vazio) = vazio
     or coalesce(trim(new.cidade), vazio) = vazio or coalesce(trim(new.uf), vazio) = vazio
     or coalesce(trim(new.cep), vazio) = vazio then
    faltando := array_append(faltando, 'endereço');
  end if;
  if new.plano_id is null then faltando := array_append(faltando, 'plano'); end if;

  new.pendencias_cadastrais := faltando;
  new.nivel_cadastral := case
    when cardinality(faltando) = 0 then 'completo'
    when cardinality(faltando) <= 2 then 'falta_informacao'
    else 'critico'
  end;
  return new;
end;
$$;

create trigger atualizar_nivel_cadastral before insert or update on pacientes
  for each row execute function atualizar_nivel_cadastral();

-- Calcula para os pacientes existentes (o gatilho roda no update).
update pacientes set nome = nome;

create index on pacientes (nivel_cadastral);

-- 2. Contato e registro no conselho dos profissionais (tela de profissionais).
alter table profissionais
  add column registro text, -- ex.: CRP 12/12345, CRFa 3-1234
  add column celular text,
  add column email text;
