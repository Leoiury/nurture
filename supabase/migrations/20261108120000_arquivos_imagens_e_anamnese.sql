-- Arquivos do paciente: também imagens (JPG, PNG, WebP), e anexos na anamnese e na triagem.
-- Quem vê continua restrito: quem enviou, o profissional do atendimento ligado, o autor da
-- anamnese ligada e ADMs.

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/jpeg',
     'image/png',
     'image/webp'
   ]
 where id = 'arquivos-pacientes';

-- Nula: enviado pela ficha ou pela tela de atendimento.
alter table arquivos_paciente add column anamnese_id uuid references anamneses on delete set null;

create index on arquivos_paciente (anamnese_id);

drop policy "quem enviou, quem atendeu ou ADM lê os arquivos" on arquivos_paciente;
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
      or exists (
        select 1 from anamneses an
         where an.id = arquivos_paciente.anamnese_id
           and an.profissional_id = meu_profissional()
      )
    )
  );

drop function registrar_arquivo(uuid, uuid, text, text);

-- Registra um arquivo que o próprio login acabou de enviar. Tipo e tamanho vêm do Storage.
-- Enviado pela anamnese: fica ligado também ao atendimento dela, se houver.
create function registrar_arquivo(p_paciente uuid, p_atendimento uuid, p_anamnese uuid, p_nome text, p_caminho text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  objeto storage.objects;
  atendimento uuid := p_atendimento;
  novo uuid;
begin
  if not pode_ver_clinico() then
    raise exception 'Sem permissão.';
  end if;
  if split_part(p_caminho, '/', 1) <> p_paciente::text then
    raise exception 'Arquivo de outro paciente.';
  end if;
  if p_anamnese is not null then
    select coalesce(atendimento, an.atendimento_id) into atendimento
      from anamneses an
     where an.id = p_anamnese and an.paciente_id = p_paciente;
    if not found then
      raise exception 'Anamnese de outro paciente.';
    end if;
  end if;
  if atendimento is not null and not exists (select 1 from atendimentos where id = atendimento and paciente_id = p_paciente) then
    raise exception 'Atendimento de outro paciente.';
  end if;
  select * into objeto from storage.objects
   where bucket_id = 'arquivos-pacientes' and name = p_caminho and owner_id = auth.uid()::text;
  if not found then
    raise exception 'Arquivo não encontrado.';
  end if;

  insert into arquivos_paciente (paciente_id, atendimento_id, anamnese_id, nome, tipo_mime, tamanho, caminho, enviado_por, enviado_por_nome)
  select p_paciente, atendimento, p_anamnese, p_nome, objeto.metadata ->> 'mimetype', (objeto.metadata ->> 'size')::bigint, p_caminho, u.id, u.nome
    from usuarios u
   where u.id = auth.uid()
  returning id into novo;
  return novo;
end;
$$;

revoke all on function registrar_arquivo(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function registrar_arquivo(uuid, uuid, uuid, text, text) to authenticated;
