-- Financeiro (só a direção): pagamentos recebidos, que quitam atendimentos
-- (inteiros ou em parte), e despesas da clínica.
--
-- Esperado = atendimentos não desmarcados; realizados = status 'atendido';
-- faltas = 'faltou'. Um pagamento pode quitar vários atendimentos (de um paciente
-- ou de um convênio); o que sobra dele fica como crédito sem vínculo.

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  valor numeric(10, 2) not null check (valor > 0),
  forma text not null check (forma in ('pix', 'dinheiro', 'cartao', 'transferencia', 'boleto', 'convenio', 'outro')),
  -- De quem veio: um paciente (ou responsável) ou um plano/convênio.
  paciente_id uuid references pacientes on delete set null,
  plano_id uuid references planos on delete set null,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null
);
create index on pagamentos (data);

create table pagamentos_atendimentos (
  pagamento_id uuid not null references pagamentos on delete cascade,
  atendimento_id uuid not null references atendimentos on delete restrict,
  valor numeric(10, 2) not null check (valor > 0),
  primary key (pagamento_id, atendimento_id)
);
create index on pagamentos_atendimentos (atendimento_id);

create table despesas (
  id uuid primary key default gen_random_uuid(),
  -- Mês a que a despesa pertence (vencimento); paga_em = quando saiu do caixa.
  data date not null,
  descricao text not null check (length(trim(descricao)) > 0),
  categoria text,
  valor numeric(10, 2) not null check (valor > 0),
  paga_em date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null
);
create index on despesas (data);
create index on despesas (paga_em);

alter table pagamentos enable row level security;
alter table pagamentos_atendimentos enable row level security;
alter table despesas enable row level security;
create policy "adm: acesso total" on pagamentos for all to authenticated using (eh_adm()) with check (eh_adm());
create policy "adm: acesso total" on pagamentos_atendimentos for all to authenticated using (eh_adm()) with check (eh_adm());
create policy "adm: acesso total" on despesas for all to authenticated using (eh_adm()) with check (eh_adm());

-- Registra o pagamento e o que ele quita, numa transação. p_itens:
-- [{ "atendimento_id": uuid, "valor": number }]. Cada item não pode passar do
-- que falta pagar no atendimento, e a soma não pode passar do pagamento.
create function registrar_pagamento(
  p_data date,
  p_valor numeric,
  p_forma text,
  p_paciente uuid default null,
  p_plano uuid default null,
  p_observacao text default null,
  p_itens jsonb default '[]'
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  novo uuid;
  item jsonb;
  quitar numeric;
  falta numeric;
  total numeric := 0;
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode registrar pagamentos.';
  end if;
  insert into pagamentos (data, valor, forma, paciente_id, plano_id, observacao)
  values (p_data, p_valor, p_forma, p_paciente, p_plano, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into novo;

  for item in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    quitar := (item ->> 'valor')::numeric;
    select coalesce(a.valor, 0) - coalesce((select sum(pa.valor) from pagamentos_atendimentos pa where pa.atendimento_id = a.id), 0)
      into falta
      from atendimentos a
     where a.id = (item ->> 'atendimento_id')::uuid and a.excluido_em is null
       for update;
    if not found then
      raise exception 'Um dos atendimentos não existe mais.';
    end if;
    if quitar > falta then
      raise exception 'O valor quitado passa do que falta pagar num dos atendimentos.';
    end if;
    insert into pagamentos_atendimentos (pagamento_id, atendimento_id, valor)
    values (novo, (item ->> 'atendimento_id')::uuid, quitar);
    total := total + quitar;
  end loop;

  if total > p_valor then
    raise exception 'A soma dos atendimentos passa do valor do pagamento.';
  end if;
  return novo;
end;
$$;
