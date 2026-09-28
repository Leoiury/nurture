-- "Reuniões e Visitas" deixa de ser plano e passa a ser tipo de atendimento.
-- (No sistema anterior era um "convênio"; na importação virou plano.)
--
-- Atendimentos com esse plano: tipo passa a ser "Reuniões e Visitas", sem plano;
-- o tipo anterior fica registrado numa observação automática.
-- Pacientes com esse plano padrão: ficam sem plano padrão.

insert into tipos_atendimento (nome) values ('Reuniões e Visitas')
on conflict (nome) do nothing;

insert into atendimentos_observacoes (atendimento_id, texto, automatica)
select a.id,
       '"Reuniões e Visitas" deixou de ser plano e passou a ser o tipo'
       || coalesce(' (tipo anterior: ' || t.nome || ')', ''),
       true
from atendimentos a
join planos p on p.id = a.plano_id and p.nome = 'Reuniões e Visitas'
left join tipos_atendimento t on t.id = a.tipo_id;

update atendimentos
   set tipo_id = (select id from tipos_atendimento where nome = 'Reuniões e Visitas'),
       plano_id = null
 where plano_id = (select id from planos where nome = 'Reuniões e Visitas');

update pacientes
   set plano_id = null
 where plano_id = (select id from planos where nome = 'Reuniões e Visitas');

delete from planos where nome = 'Reuniões e Visitas';
