-- Despesas recorrentes: um modelo que lança uma despesa por mês, no dia escolhido
-- (dia 31 em mês curto → último dia do mês). Os lançamentos são despesas comuns
-- (podem ser pagas, editadas ou excluídas no mês); gerada_ate guarda até que mês
-- já foram lançados, para um lançamento excluído não voltar.

create table despesas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  descricao text not null check (length(trim(descricao)) > 0),
  categoria text,
  valor numeric(10, 2) not null check (valor > 0),
  dia smallint not null check (dia between 1 and 31),
  -- Meses como o dia 1 do mês. fim vazio = sem data para acabar.
  inicio date not null check (extract(day from inicio) = 1),
  fim date check (extract(day from fim) = 1),
  gerada_ate date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null,
  check (fim is null or fim >= inicio)
);

alter table despesas add column recorrente_id uuid references despesas_recorrentes on delete set null;
create index on despesas (recorrente_id);

alter table despesas_recorrentes enable row level security;
create policy "adm: acesso total" on despesas_recorrentes for all to authenticated using (eh_adm()) with check (eh_adm());

-- Data do lançamento no mês m (dia 1): o dia escolhido, limitado ao fim do mês.
create function dia_no_mes(p_mes date, p_dia integer) returns date
language sql immutable as $$
  select least(p_mes + (p_dia - 1), (p_mes + interval '1 month' - interval '1 day')::date)
$$;

-- Lança as despesas recorrentes que faltam até o mês de p_ate (no máximo 12
-- meses à frente de hoje). Chamada ao abrir o financeiro. Retorna quantas lançou.
create function lancar_despesas_recorrentes(p_ate date) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r record;
  m date;
  ate date;
  limite date := least(date_trunc('month', p_ate)::date, (date_trunc('month', current_date) + interval '12 months')::date);
  n integer := 0;
begin
  if not eh_adm() then
    return 0;
  end if;
  for r in
    select * from despesas_recorrentes
     where coalesce(gerada_ate, (inicio - interval '1 month')::date) < least(limite, coalesce(fim, limite))
       for update
  loop
    ate := least(limite, coalesce(r.fim, limite));
    m := coalesce((r.gerada_ate + interval '1 month')::date, r.inicio);
    while m <= ate loop
      insert into despesas (data, descricao, categoria, valor, observacao, recorrente_id)
      values (dia_no_mes(m, r.dia), r.descricao, r.categoria, r.valor, r.observacao, r.id);
      n := n + 1;
      m := (m + interval '1 month')::date;
    end loop;
    update despesas_recorrentes set gerada_ate = ate where id = r.id;
  end loop;
  return n;
end;
$$;

-- Altera o modelo e os lançamentos ainda não pagos a partir do mês atual; os
-- lançamentos não pagos depois do novo fim são removidos.
create function alterar_despesa_recorrente(
  p_id uuid,
  p_descricao text,
  p_categoria text,
  p_valor numeric,
  p_dia integer,
  p_fim date default null
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  este_mes date := date_trunc('month', current_date)::date;
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode alterar despesas.';
  end if;
  update despesas_recorrentes
     set descricao = trim(p_descricao), categoria = nullif(trim(coalesce(p_categoria, '')), ''), valor = p_valor, dia = p_dia,
         fim = date_trunc('month', p_fim)::date,
         gerada_ate = case when p_fim is not null and gerada_ate > p_fim then date_trunc('month', p_fim)::date else gerada_ate end
   where id = p_id;
  if not found then
    raise exception 'Despesa recorrente não encontrada.';
  end if;

  delete from despesas
   where recorrente_id = p_id and paga_em is null and p_fim is not null and data >= (date_trunc('month', p_fim) + interval '1 month')::date;
  update despesas
     set descricao = trim(p_descricao), categoria = nullif(trim(coalesce(p_categoria, '')), ''), valor = p_valor,
         data = dia_no_mes(date_trunc('month', data)::date, p_dia)
   where recorrente_id = p_id and paga_em is null and data >= este_mes;
end;
$$;
