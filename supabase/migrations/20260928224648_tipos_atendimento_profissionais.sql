-- Quem atende cada tipo de atendimento (configurável na tela de tipos).
-- Tipo sem ninguém vinculado: qualquer profissional atende (ex.: "Reuniões e Visitas").
--
-- Carga inicial igual às regras que estavam fixas no código (por especialidade):
-- psicologia e ABA → psicólogos; fono → fonoaudiólogos e estagiários de fono;
-- pedagógico → (neuro)psicopedagogos; nutrição → nutricionistas.

create table tipos_atendimento_profissionais (
  tipo_id uuid not null references tipos_atendimento on delete cascade,
  profissional_id uuid not null references profissionais on delete cascade,
  primary key (tipo_id, profissional_id)
);

create index on tipos_atendimento_profissionais (profissional_id);

alter table tipos_atendimento_profissionais enable row level security;
create policy "autenticados: acesso total" on tipos_atendimento_profissionais
  for all to authenticated using (true) with check (true);

insert into tipos_atendimento_profissionais (tipo_id, profissional_id)
select t.id, p.id
from tipos_atendimento t
join profissionais p on
     (t.nome ~* 'psic' and p.especialidade ~* 'psic[óo]log')
  or (t.nome ~* '\mABA\M' and p.especialidade ~* 'psic[óo]log')
  or (t.nome ~* 'fono' and p.especialidade ~* 'fono|estagi')
  or (t.nome ~* 'pedag' and p.especialidade ~* 'pedag|neuro')
  or (t.nome ~* 'nutri' and p.especialidade ~* 'nutri');
