-- Cor do card pelo tipo de atendimento.
--
-- Um tipo pode ter cor própria: enquanto o atendimento for desse tipo, o card usa
-- a cor do tipo em vez da do plano; trocando o tipo, volta a cor do plano.
-- Primeiro uso: o tipo "Temporário", em laranja vibrante.

alter table tipos_atendimento add column cor text check (cor ~ '^#[0-9A-Fa-f]{6}$');

insert into tipos_atendimento (nome, cor) values ('Temporário', '#FF6D00')
on conflict (nome) do update set cor = excluded.cor;
