-- Correspondência convênio do sistema anterior → plano passa a considerar também
-- o valor cobrado (ex.: "PARTICULAR" a R$ 180 e a R$ 150 podem ser tabelas
-- diferentes). valor null: atendimentos sem valor no relatório.

alter table convenios_legado drop constraint convenios_legado_pkey;
alter table convenios_legado
  add column id bigint generated always as identity primary key,
  add column valor numeric(10, 2),
  add constraint convenios_legado_nome_valor unique nulls not distinct (nome, valor);
