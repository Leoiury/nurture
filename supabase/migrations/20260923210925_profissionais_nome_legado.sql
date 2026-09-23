-- Nome do profissional como aparece no sistema anterior. A importação usa esta
-- coluna para reconhecer o profissional, então o nome exibido pode ser corrigido
-- livremente sem que uma nova importação crie um registro duplicado.

alter table profissionais add column nome_legado text unique;

update profissionais set nome_legado = nome;
