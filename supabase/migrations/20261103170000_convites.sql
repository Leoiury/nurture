-- Convites: um link por profissional para ele mesmo criar o login, já vinculado.
-- Só o hash do token fica guardado: nem quem lê o banco consegue montar o link.
-- Quem usa o link não está logado, então o uso passa pelo servidor, com a secret key.

create table convites (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais on delete cascade,
  token_hash text not null unique,
  expira_em timestamptz not null,
  usado_em timestamptz,
  revogado_em timestamptz,
  usuario_id uuid references usuarios on delete set null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- No máximo um link em aberto por profissional.
create unique index convites_um_em_aberto on convites (profissional_id) where usado_em is null and revogado_em is null;

alter table convites enable row level security;
create policy "ADMs leem" on convites
  for select to authenticated using (eh_adm());
