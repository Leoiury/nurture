-- Datas comemorativas (lembretes na agenda, com antecedência, como os aniversários).
-- Repetem todo ano, de um de três jeitos:
--   fixa:   dia e mês (ex.: 12/10); dia -1 = último dia do mês (ex.: fevereiro);
--   móvel:  n-ésimo dia da semana do mês (ex.: 2º domingo de maio; ordem -1 = último);
--   Páscoa: dias em relação ao domingo de Páscoa (ex.: Carnaval = -47).

create table datas_comemorativas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  mes smallint check (mes between 1 and 12),
  dia smallint check (dia = -1 or dia between 1 and 31),
  ordem smallint check (ordem in (-1, 1, 2, 3, 4, 5)),
  dia_semana smallint check (dia_semana between 0 and 6), -- 0 = domingo
  pascoa smallint check (pascoa between -100 and 100),
  criado_em timestamptz not null default now(),
  check (
    (mes is not null and dia is not null and ordem is null and dia_semana is null and pascoa is null)
    or (mes is not null and dia is null and ordem is not null and dia_semana is not null and pascoa is null)
    or (mes is null and dia is null and ordem is null and dia_semana is null and pascoa is not null)
  )
);

alter table datas_comemorativas enable row level security;
create policy "autenticados: leem" on datas_comemorativas for select to authenticated using (true);
create policy "adm: altera" on datas_comemorativas for all to authenticated using (eh_adm()) with check (eh_adm());

-- Lista inicial da clínica (editável em Configurações → Datas comemorativas).
-- Campanhas do mês inteiro entram no dia 1º (o lembrete chega 15 dias antes).
insert into datas_comemorativas (nome, descricao, mes, dia, pascoa) values
  ('Janeiro Branco', 'Saúde mental e emocional (campanha do mês).', 1, 1, null),
  ('Ano-Novo', 'Mensagem de boas-vindas e retomada dos atendimentos.', 1, 1, null),
  ('Carnaval', null, null, null, -47),
  ('Dia das Doenças Raras', 'Diagnóstico, cuidado e apoio às famílias.', 2, -1, null),
  ('Dia Mundial e Nacional da Síndrome de Down', 'Valorização, inclusão e participação das pessoas com síndrome de Down.', 3, 21, null),
  ('Dia Mundial de Conscientização sobre o Autismo', null, 4, 2, null),
  ('Dia Mundial da Saúde', null, 4, 7, null),
  ('Dia Nacional de Combate ao Abuso e à Exploração Sexual de Crianças e Adolescentes', 'Conteúdo cuidadoso sobre proteção e direitos da criança.', 5, 18, null),
  ('Festa Junina da clínica', 'Convivência entre crianças, famílias e equipe. Data a combinar: ajuste o dia quando definido.', 6, 1, null),
  ('Dia Nacional da Saúde', null, 8, 5, null),
  ('Dia do Psicólogo', 'Apresentar e valorizar o trabalho da equipe de Psicologia.', 8, 27, null),
  ('Setembro Amarelo', 'Saúde mental, acolhimento e prevenção do suicídio, com linguagem adequada ao público (campanha do mês).', 9, 1, null),
  ('Dia Nacional de Luta da Pessoa com Deficiência', null, 9, 21, null),
  ('Dia Nacional dos Surdos', 'Inclusão, acessibilidade e comunicação.', 9, 26, null),
  ('Dia Mundial da Paralisia Cerebral', null, 10, 6, null),
  ('Dia Mundial da Saúde Mental', null, 10, 10, null),
  ('Dia das Crianças', 'Pode ser uma comemoração da clínica, sem precisar associá-la a uma campanha.', 10, 12, null),
  ('Dia do Fisioterapeuta e do Terapeuta Ocupacional', null, 10, 13, null),
  ('Dia Mundial da Prematuridade', 'Se o tema fizer parte dos atendimentos e da história das famílias acompanhadas.', 11, 17, null),
  ('Dia Internacional das Pessoas com Deficiência', null, 12, 3, null),
  ('Dia do Fonoaudiólogo', null, 12, 9, null),
  ('Natal e encerramento do ano', 'Confraternização, agradecimento às famílias e fechamento das atividades.', 12, 25, null);
