-- Valores do plano por área (fonoaudiologia, psicologia, nutrição, psicopedagogia).
-- O valor sugerido num atendimento é o da área do tipo; sem ele, o valor padrão do plano.
--
-- As colunas dos planos já foram criadas direto na produção: "if not exists"
-- registra-as aqui sem recriar (e as cria nos bancos local e de testes).

alter table planos
  add column if not exists valor_fonoaudiologia numeric(10, 2) check (valor_fonoaudiologia >= 0),
  add column if not exists valor_psicologia numeric(10, 2) check (valor_psicologia >= 0),
  add column if not exists valor_nutricao numeric(10, 2) check (valor_nutricao >= 0),
  add column if not exists valor_psicopedagogia numeric(10, 2) check (valor_psicopedagogia >= 0);

-- Área do tipo de atendimento: qual valor do plano ele usa (vazio = valor padrão).
alter table tipos_atendimento
  add column area text check (area in ('fonoaudiologia', 'psicologia', 'nutricao', 'psicopedagogia'));

-- Carga inicial pelo nome ("pedag" antes de "psic": psicopedagogia contém os dois).
-- ABA é feita por psicólogas na clínica: usa o valor de psicologia.
update tipos_atendimento
   set area = case
     when nome ~* 'fono' then 'fonoaudiologia'
     when nome ~* 'nutri' then 'nutricao'
     when nome ~* 'pedag' then 'psicopedagogia'
     when nome ~* 'psic|\mABA\M' then 'psicologia'
   end;
