-- Planejamento da agenda: um rascunho único de alterações (mover, criar, editar,
-- desmarcar, excluir) que a direção monta sem mexer na agenda real e depois
-- aplica de uma vez, ou descarta.
--
-- O rascunho guarda só as operações (não uma cópia da agenda). Cada operação traz
-- os mesmos argumentos das funções que a agenda já usa e, quando mexe num
-- atendimento existente, como ele estava ("esperado") quando foi alterado no
-- planejamento. Ao aplicar, se a agenda real mudou nesse meio tempo, nada é
-- aplicado e a operação em conflito é informada.

-- ADM = perfil "direcao" ou "dev" (app_metadata, que só a secret key altera).
create function eh_adm() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '') in ('direcao', 'dev')
$$;

-- Linha única (unico = true).
create table planejamento (
  unico boolean primary key default true check (unico),
  operacoes jsonb not null default '[]'::jsonb check (jsonb_typeof(operacoes) = 'array'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger set_atualizado_em before update on planejamento
  for each row execute function set_atualizado_em();

alter table planejamento enable row level security;
create policy "adm: acesso total" on planejamento
  for all to authenticated using (eh_adm()) with check (eh_adm());

-- O atendimento ainda está como o planejamento o viu?
create function planejamento_confere(p_id uuid, p_esperado jsonb) returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1
    from atendimentos a
    where a.id = p_id
      and a.excluido_em is null
      and a.inicio = (p_esperado ->> 'inicio')::timestamptz
      and a.fim = (p_esperado ->> 'fim')::timestamptz
      and a.status::text = p_esperado ->> 'status'
      and array(select ap.profissional_id::text from atendimento_profissionais ap where ap.atendimento_id = a.id order by 1)
        = array(select x from jsonb_array_elements_text(p_esperado -> 'profissionais') as x order by 1)
  )
$$;

-- Aplica as operações em ordem, numa única transação: tudo ou nada.
-- Erros saem como "CONFLITO <chave>" ou "ERRO <chave>: <mensagem>", para a tela
-- apontar a operação.
create function aplicar_planejamento(p_operacoes jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  op jsonb;
  a jsonb;
  chave text;
  quantidade integer := 0;
  lista uuid[];
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode aplicar o planejamento.';
  end if;
  if jsonb_typeof(p_operacoes) <> 'array' then
    raise exception 'Operações inválidas.';
  end if;

  for op in select value from jsonb_array_elements(p_operacoes) loop
    a := op -> 'args';
    chave := coalesce(op ->> 'chave', '?');

    if op ->> 'tipo' <> 'criar' and not planejamento_confere((a ->> 'p_id')::uuid, op -> 'esperado') then
      raise exception 'CONFLITO %', chave;
    end if;

    begin
      case op ->> 'tipo'
        when 'criar' then
          lista := array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x);
          perform criar_atendimentos(
            p_paciente_id => (a ->> 'p_paciente_id')::uuid,
            p_profissionais => lista,
            p_inicios => array(select x::timestamptz from jsonb_array_elements_text(a -> 'p_inicios') as x),
            p_duracao_min => (a ->> 'p_duracao_min')::integer,
            p_status => coalesce(a ->> 'p_status', 'marcado')::status_atendimento,
            p_plano_id => (a ->> 'p_plano_id')::uuid,
            p_tipo_id => (a ->> 'p_tipo_id')::uuid,
            p_valor => (a ->> 'p_valor')::numeric,
            p_observacao => a ->> 'p_observacao',
            p_frequencia => (a ->> 'p_frequencia')::frequencia_recorrencia,
            p_data_fim => (a ->> 'p_data_fim')::date,
            p_sessoes => (a ->> 'p_sessoes')::integer
          );
        when 'editar' then
          lista := array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x);
          perform editar_atendimentos(
            p_id => (a ->> 'p_id')::uuid,
            p_alcance => (a ->> 'p_alcance')::alcance_serie,
            p_paciente_id => (a ->> 'p_paciente_id')::uuid,
            p_profissionais => lista,
            p_data => (a ->> 'p_data')::date,
            p_hora => (a ->> 'p_hora')::time,
            p_duracao_min => (a ->> 'p_duracao_min')::integer,
            p_plano_id => (a ->> 'p_plano_id')::uuid,
            p_tipo_id => (a ->> 'p_tipo_id')::uuid,
            p_valor => (a ->> 'p_valor')::numeric
          );
        when 'mover' then
          perform mover_atendimento(
            p_id => (a ->> 'p_id')::uuid,
            p_inicio => (a ->> 'p_inicio')::timestamptz,
            p_de_profissional => (a ->> 'p_de_profissional')::uuid,
            p_para_profissional => (a ->> 'p_para_profissional')::uuid
          );
        when 'desmarcar' then
          perform desmarcar_atendimentos((a ->> 'p_id')::uuid, (a ->> 'p_alcance')::alcance_serie, a ->> 'p_motivo');
        when 'excluir' then
          perform excluir_atendimentos((a ->> 'p_id')::uuid, (a ->> 'p_alcance')::alcance_serie, a ->> 'p_motivo');
        else
          raise exception 'Operação desconhecida: %', op ->> 'tipo';
      end case;
    exception when others then
      raise exception 'ERRO %: %', chave, sqlerrm;
    end;

    quantidade := quantidade + 1;
  end loop;

  delete from planejamento where unico;
  return quantidade;
end;
$$;
