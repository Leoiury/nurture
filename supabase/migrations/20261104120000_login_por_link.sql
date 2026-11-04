-- Gerar login pela ficha do profissional: o ADM escolhe o tipo de login, e a pessoa cria
-- pelo link o nome de usuário e a senha. Quem já tem login recebe um link de redefinir senha.

-- O login continua sendo um usuário do Supabase Auth (que exige e-mail): o nome de usuário
-- é traduzido no servidor. Sempre em minúsculas; sem "@", para não se confundir com e-mail.
alter table usuarios add column usuario text unique
  check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

-- tipo: 'login' cria um login com este perfil; 'senha' redefine a senha de usuario_id.
alter table convites
  add column tipo text not null default 'login' check (tipo in ('login', 'senha')),
  add column perfil perfil_usuario;

-- Os links já gerados eram todos de profissional.
update convites set perfil = 'profissional';

alter table convites add constraint convites_perfil_so_no_login check ((tipo = 'login') = (perfil is not null));
