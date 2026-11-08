-- Arquivos PDF e Word do paciente, enviados pela ficha ou pela tela de atendimento.
-- Sigilo: cada arquivo só é visto por quem enviou, pelo profissional do atendimento a que
-- está ligado e por ADMs; os colegas e a recepção não veem. O bucket é privado, e o caminho
-- no Storage não leva o nome do arquivo nem do paciente. Excluir só esconde: o arquivo
-- continua guardado, como os demais registros clínicos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arquivos-pacientes',
  'arquivos-pacientes',
  false,
  20971520,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

create table arquivos_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes on delete restrict,
  -- Nula: enviado pela ficha do paciente.
  atendimento_id uuid references atendimentos on delete set null,
  nome text not null check (length(nome) between 1 and 200),
  tipo_mime text not null,
  tamanho bigint not null,
  caminho text not null unique,
  enviado_por uuid not null references usuarios,
  -- Quem envia fica no próprio registro: o profissional não lê a tabela de usuários.
  enviado_por_nome text not null,
  enviado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuarios
);

create index on arquivos_paciente (paciente_id, enviado_em desc);
create index on arquivos_paciente (atendimento_id);

alter table arquivos_paciente enable row level security;

create policy "quem enviou, quem atendeu ou ADM lê os arquivos" on arquivos_paciente
  for select to authenticated
  using (
    pode_ver_clinico()
    and excluido_em is null
    and (
      eh_adm()
      or enviado_por = auth.uid()
      or exists (
        select 1 from atendimento_profissionais ap
         where ap.atendimento_id = arquivos_paciente.atendimento_id
           and ap.profissional_id = meu_profissional()
      )
    )
  );

create policy "clínico envia arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos-pacientes' and public.pode_ver_clinico());

-- O link só sai para o arquivo que a política acima deixa este login ver.
create policy "clínico lê arquivos registrados" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'arquivos-pacientes'
    and public.pode_ver_clinico()
    and exists (select 1 from public.arquivos_paciente a where a.caminho = name)
  );

-- Registra um arquivo que o próprio login acabou de enviar. Tipo e tamanho vêm do Storage.
create function registrar_arquivo(p_paciente uuid, p_atendimento uuid, p_nome text, p_caminho text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  objeto storage.objects;
  novo uuid;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  if split_part(p_caminho, '/', 1) <> p_paciente::text then
    raise exception 'Arquivo de outro paciente.';
  end if;
  if p_atendimento is not null and not exists (select 1 from atendimentos where id = p_atendimento and paciente_id = p_paciente) then
    raise exception 'Atendimento de outro paciente.';
  end if;
  select * into objeto from storage.objects
   where bucket_id = 'arquivos-pacientes' and name = p_caminho and owner_id = auth.uid()::text;
  if not found then
    raise exception 'Arquivo não encontrado.';
  end if;

  insert into arquivos_paciente (paciente_id, atendimento_id, nome, tipo_mime, tamanho, caminho, enviado_por, enviado_por_nome)
  select p_paciente, p_atendimento, p_nome, objeto.metadata ->> 'mimetype', (objeto.metadata ->> 'size')::bigint, p_caminho, u.id, u.nome
    from usuarios u
   where u.id = auth.uid()
  returning id into novo;
  return novo;
end;
$$;

-- Quem enviou ou um ADM.
create function excluir_arquivo(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  update arquivos_paciente
     set excluido_em = now(), excluido_por = auth.uid()
   where id = p_id
     and excluido_em is null
     and (enviado_por = auth.uid() or eh_adm());
  if not found then
    raise exception 'Só quem enviou ou um administrador exclui o arquivo.';
  end if;
end;
$$;

revoke all on function registrar_arquivo(uuid, uuid, text, text) from public, anon;
grant execute on function registrar_arquivo(uuid, uuid, text, text) to authenticated;
revoke all on function excluir_arquivo(uuid) from public, anon;
grant execute on function excluir_arquivo(uuid) to authenticated;
