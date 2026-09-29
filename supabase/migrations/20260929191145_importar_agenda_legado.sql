-- Importação da agenda do sistema anterior (relatório .xlsx, um ou vários meses),
-- feita pela tela Configurações → Importar agenda.
--
-- Regras:
-- - atendimentos são casados pelo id_legado;
-- - se o atendimento foi modificado no app depois da última importação (há
--   alteração feita por uma pessoa no histórico), vale a versão do app;
-- - apagado no sistema anterior: exclusão lógica aqui (se ainda não foi mexido no app).

-- Quando o atendimento foi gravado pela última importação.
alter table atendimentos add column importado_em timestamptz;

-- Correspondência convênio do sistema anterior → plano (escolhida na tela e lembrada).
create table convenios_legado (
  nome text primary key, -- nome normalizado (sem acentos, espaços e pontuação)
  plano_id uuid references planos on delete cascade,
  criado_em timestamptz not null default now()
);
alter table convenios_legado enable row level security;
create policy "adm: acesso total" on convenios_legado
  for all to authenticated using (eh_adm()) with check (eh_adm());

-- Alterado no app (por uma pessoa) depois da última importação?
-- Alterações feitas pela própria importação têm o mesmo instante (now() da
-- transação) que importado_em, e por isso não contam.
create function modificado_no_app(p_id uuid, p_importado_em timestamptz) returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from atendimentos_alteracoes h
    where h.atendimento_id = p_id
      and h.operacao <> 'criacao'
      and h.alterado_por is not null
      and h.alterado_em > coalesce(p_importado_em, '-infinity'::timestamptz)
  )
$$;

-- Aplica (ou só simula) as linhas já resolvidas pela aplicação. Cada linha:
-- { mes, id_legado, excluir, paciente_id, profissional_id, plano_id, tipo_id,
--   inicio, fim, valor, status, motivo, observacao }
-- Devolve contagens por mês: novos, atualizados, iguais, mantidos (modificados no
-- app), excluidos (apagados no sistema anterior) e ignorados.
create function importar_agenda_legado(p_linhas jsonb, p_simular boolean default false) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  l jsonb;
  atual atendimentos;
  novo uuid;
  acao text;
  mes text;
  resultado jsonb := '{}';
  profissionais_atuais uuid[];
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode importar a agenda.';
  end if;

  for l in select value from jsonb_array_elements(p_linhas) loop
    mes := l ->> 'mes';
    select * into atual from atendimentos where id_legado = (l ->> 'id_legado')::integer;

    if found and modificado_no_app(atual.id, atual.importado_em) then
      acao := 'mantidos';

    elsif (l ->> 'excluir')::boolean then
      if found and atual.excluido_em is null then
        acao := 'excluidos';
        if not p_simular then
          update atendimentos
             set excluido_em = now(), excluido_por = auth.uid(),
                 motivo_exclusao = 'Apagado no sistema anterior (importação)', importado_em = now()
           where id = atual.id;
        end if;
      else
        acao := 'ignorados';
      end if;

    elsif found then
      select array_agg(profissional_id order by profissional_id) into profissionais_atuais
        from atendimento_profissionais where atendimento_id = atual.id;
      if atual.excluido_em is null
         and atual.inicio = (l ->> 'inicio')::timestamptz
         and atual.fim = (l ->> 'fim')::timestamptz
         and atual.status::text = l ->> 'status'
         and atual.motivo_desmarcacao is not distinct from (l ->> 'motivo')
         and atual.paciente_id is not distinct from (l ->> 'paciente_id')::uuid
         and atual.plano_id is not distinct from (l ->> 'plano_id')::uuid
         and atual.tipo_id is not distinct from (l ->> 'tipo_id')::uuid
         and atual.valor is not distinct from (l ->> 'valor')::numeric
         and profissionais_atuais = array[(l ->> 'profissional_id')::uuid] then
        acao := 'iguais';
      else
        acao := 'atualizados';
        if not p_simular then
          update atendimentos
             set inicio = (l ->> 'inicio')::timestamptz,
                 fim = (l ->> 'fim')::timestamptz,
                 status = (l ->> 'status')::status_atendimento,
                 motivo_desmarcacao = l ->> 'motivo',
                 paciente_id = (l ->> 'paciente_id')::uuid,
                 plano_id = (l ->> 'plano_id')::uuid,
                 tipo_id = (l ->> 'tipo_id')::uuid,
                 valor = (l ->> 'valor')::numeric,
                 observacao = coalesce(l ->> 'observacao', observacao),
                 -- Apagado antes no sistema anterior e de volta nele: reaparece.
                 excluido_em = null, excluido_por = null, motivo_exclusao = null,
                 importado_em = now()
           where id = atual.id;
          delete from atendimento_profissionais
           where atendimento_id = atual.id and profissional_id <> (l ->> 'profissional_id')::uuid;
          insert into atendimento_profissionais (atendimento_id, profissional_id)
          values (atual.id, (l ->> 'profissional_id')::uuid)
          on conflict do nothing;
        end if;
      end if;

    else
      acao := 'novos';
      if not p_simular then
        insert into atendimentos (id_legado, paciente_id, plano_id, tipo_id, inicio, fim, valor, status,
                                  motivo_desmarcacao, observacao, importado_em)
        values ((l ->> 'id_legado')::integer, (l ->> 'paciente_id')::uuid, (l ->> 'plano_id')::uuid,
                (l ->> 'tipo_id')::uuid, (l ->> 'inicio')::timestamptz, (l ->> 'fim')::timestamptz,
                (l ->> 'valor')::numeric, (l ->> 'status')::status_atendimento, l ->> 'motivo',
                l ->> 'observacao', now())
        returning id into novo;
        insert into atendimento_profissionais (atendimento_id, profissional_id)
        values (novo, (l ->> 'profissional_id')::uuid);
      end if;
    end if;

    if resultado -> mes is null then
      resultado := resultado || jsonb_build_object(mes, '{}'::jsonb);
    end if;
    resultado := jsonb_set(resultado, array[mes, acao], to_jsonb(coalesce((resultado #>> array[mes, acao])::integer, 0) + 1));
  end loop;

  return resultado;
end;
$$;
