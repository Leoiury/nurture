"use client";

// Seção "Guia" do painel do atendimento: situação da guia, gerar, renovar,
// excluir e relacionar atendimentos (juntar à série deste).

import { useEffect, useState } from "react";
import { AVISO_DE_RENOVACAO, situacaoDaGuia } from "@/lib/agenda/guias";
import { ROTULO_FREQUENCIA, type Frequencia } from "@/lib/agenda/recorrencia";
import { FUSO } from "@/lib/agenda/tempo";
import {
  atendimentosParaRelacionar,
  excluirGuia,
  guiaDoAtendimento,
  preverGuia,
  relacionarAtendimentos,
  salvarGuia,
  type GuiaDoAtendimento,
  type ParaRelacionar,
  type PedidoDeGuia,
} from "./actions-guias";
import { IconeGuia } from "./icone-guia";

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" });
const dataHoraCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
const botaoPrimario = "rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const botaoSecundario = "shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-50";

type Props = {
  atendimentoId: string;
  status: string;
  /** Muda quando o painel recarrega (ex.: status alterado). */
  versao: number;
  /** Depois de gerar, renovar, excluir ou relacionar. */
  aoAlterar: (aviso: string) => void;
};

type Modo = "ver" | "gerar" | "renovar" | "relacionar";

export function GuiaDoAtendimento({ atendimentoId, status, versao, aoAlterar }: Props) {
  const [guia, setGuia] = useState<GuiaDoAtendimento | null>(null);
  const [modo, setModo] = useState<Modo>("ver");
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    guiaDoAtendimento(atendimentoId)
      .then((g) => ativo && setGuia(g))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [atendimentoId, versao, recarga]);

  if (!guia) return erro ? <p className="text-danger">{erro}</p> : null;

  function concluido(aviso: string) {
    setModo("ver");
    setRecarga((n) => n + 1);
    aoAlterar(aviso);
  }

  const situacao = situacaoDaGuia(guia.atual, guia.exigeGuia, status);
  const atual = guia.atual;
  const restantes = atual ? atual.quantidade - atual.posicao : 0;

  return (
    <section aria-label="Guia" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-semibold">
        Guia
        {situacao && <IconeGuia situacao={situacao} tamanho={16} />}
      </h3>

      {modo === "ver" && (
        <>
          {atual ? (
            <p>
              {atual.numero ? `Nº ${atual.numero}` : "Sem número"} · sessão {atual.posicao} de {atual.quantidade}
              <span className="text-muted">
                {" · "}
                {atual.renovada
                  ? "já renovada"
                  : restantes === 0
                    ? "última sessão"
                    : `${restantes === 1 ? "falta 1 sessão" : `faltam ${restantes} sessões`}${restantes < AVISO_DE_RENOVACAO ? ": renove" : ""}`}
              </span>
            </p>
          ) : guia.inicioDaCadeia ? (
            <p className="text-muted">A guia desta série começa em {dataCurta.format(new Date(guia.inicioDaCadeia))}.</p>
          ) : (
            <p className={situacao === "falta" ? "text-danger" : "text-muted"}>{situacao === "falta" ? "O plano exige guia e este atendimento não tem." : "Sem guia."}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {guia.podeGerar && (
              <button type="button" onClick={() => setModo("gerar")} className={botaoSecundario}>
                Gerar guia
              </button>
            )}
            {guia.renovar && (
              <button type="button" onClick={() => setModo("renovar")} className={botaoSecundario}>
                Renovar guia
              </button>
            )}
            {status !== "desmarcado" && (
              <button type="button" onClick={() => setModo("relacionar")} className={botaoSecundario}>
                Relacionar atendimentos
              </button>
            )}
          </div>
          {guia.excluir && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Excluir esta guia? Os atendimentos continuam na agenda.")) return;
                const r = await excluirGuia(guia.excluir!);
                if (r.ok) concluido("Guia excluída.");
                else setErro(r.erro);
              }}
              className="self-start text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
            >
              Excluir guia…
            </button>
          )}
          {erro && (
            <p role="alert" className="text-danger">
              {erro}
            </p>
          )}
        </>
      )}

      {(modo === "gerar" || modo === "renovar") && (
        <FormDaGuia
          renovar={modo === "renovar" ? guia.renovar! : null}
          atendimentoId={atendimentoId}
          avulso={!guia.serie}
          aoCancelar={() => setModo("ver")}
          aoConcluir={concluido}
        />
      )}

      {modo === "relacionar" && <FormRelacionar atendimentoId={atendimentoId} aoCancelar={() => setModo("ver")} aoConcluir={concluido} />}
    </section>
  );
}

function FormDaGuia({
  renovar,
  atendimentoId,
  avulso,
  aoCancelar,
  aoConcluir,
}: {
  renovar: { id: string; numero: string | null } | null;
  atendimentoId: string;
  avulso: boolean;
  aoCancelar: () => void;
  aoConcluir: (aviso: string) => void;
}) {
  const [numero, setNumero] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  const [frequencia, setFrequencia] = useState<Frequencia>("semanal");
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof preverGuia>> | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const n = Number(quantidade);
  const valida = Number.isInteger(n) && n >= 1 && n <= 120;
  const pedido: PedidoDeGuia | null = !valida
    ? null
    : renovar
      ? { tipo: "renovar", guiaId: renovar.id, quantidade: n, numero }
      : { tipo: "gerar", atendimentoId, quantidade: n, numero, frequencia };

  // Prévia: quantos já estão na agenda e quais serão criados.
  const chave = JSON.stringify(pedido && { ...pedido, numero: "" });
  useEffect(() => {
    if (!pedido) return;
    let ativo = true;
    const t = setTimeout(() => preverGuia(pedido).then((p) => ativo && setPrevia(p)), 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave resume o pedido
  }, [chave]);

  async function salvar() {
    if (!pedido) return;
    setTrabalhando(true);
    setErro(null);
    const r = await salvarGuia(pedido).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    const criados = r.quantidade ?? 0;
    aoConcluir(`${renovar ? "Guia renovada" : "Guia gerada"}${criados ? ` · ${criados === 1 ? "1 atendimento criado" : `${criados} atendimentos criados`}` : ""}.`);
  }

  return (
    <section aria-label={renovar ? "Renovar guia" : "Gerar guia"} className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4">
      <p className="font-semibold">{renovar ? "Renovar guia" : "Gerar guia"}</p>
      {renovar && <p className="text-muted">A nova guia começa no atendimento seguinte ao último da guia {renovar.numero ? `nº ${renovar.numero}` : "atual"}.</p>}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Número da guia</span>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Opcional" className={entrada} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{renovar ? "Quantidade de novas sessões" : "Quantidade de sessões"}</span>
        <input type="number" min={1} max={120} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={entrada} />
      </label>
      {avulso && !renovar && n > 1 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Repetir</legend>
          {(Object.keys(ROTULO_FREQUENCIA) as Frequencia[]).map((f) => (
            <label key={f} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="frequencia" checked={frequencia === f} onChange={() => setFrequencia(f)} className="accent-[var(--accent)]" />
              {ROTULO_FREQUENCIA[f]}
            </label>
          ))}
        </fieldset>
      )}
      {pedido &&
        previa &&
        (previa.ok ? (
          <div role="status" aria-label="Prévia da guia" className="rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
            <p>
              {previa.agendados === 1 ? "1 atendimento já agendado" : `${previa.agendados} atendimentos já agendados`} na guia.
            </p>
            {previa.novos.length > 0 && (
              <>
                <p className="mt-1">
                  {previa.novos.length === 1 ? "Será criado 1 atendimento" : `Serão criados ${previa.novos.length} atendimentos`} (
                  {ROTULO_FREQUENCIA[previa.frequencia].toLowerCase()}, sem feriados):
                </p>
                <p className="text-muted">{previa.novos.map((d) => dataHoraCurta.format(new Date(d))).join(" · ")}</p>
              </>
            )}
          </div>
        ) : (
          <p className="text-danger">{previa.erro}</p>
        ))}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Voltar
        </button>
        <button type="button" disabled={trabalhando || !pedido} onClick={salvar} className={botaoPrimario}>
          {trabalhando ? "Salvando…" : renovar ? "Renovar guia" : "Gerar guia"}
        </button>
      </div>
    </section>
  );
}

type ModoRelacionar = "profissional" | "horario" | "selecionar";

function FormRelacionar({ atendimentoId, aoCancelar, aoConcluir }: { atendimentoId: string; aoCancelar: () => void; aoConcluir: (aviso: string) => void }) {
  const [lista, setLista] = useState<ParaRelacionar[] | null>(null);
  const [modo, setModo] = useState<ModoRelacionar>("profissional");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    atendimentosParaRelacionar(atendimentoId)
      .then((l) => ativo && setLista(l))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [atendimentoId]);

  const disponiveis = (lista ?? []).filter((a) => !a.emSerieComGuia);
  const marcados = new Set(
    modo === "profissional" ? disponiveis.map((a) => a.id) : modo === "horario" ? disponiveis.filter((a) => a.mesmoHorario).map((a) => a.id) : escolhidos,
  );

  async function relacionar() {
    setTrabalhando(true);
    setErro(null);
    const r = await relacionarAtendimentos(atendimentoId, [...marcados]).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    aoConcluir(r.quantidade === 1 ? "1 atendimento relacionado." : `${r.quantidade} atendimentos relacionados.`);
  }

  const opcoes: [ModoRelacionar, string][] = [
    ["profissional", "Todos os atendimentos do paciente com esse profissional"],
    ["horario", "Todos com esse profissional nesse horário"],
    ["selecionar", "Selecionar atendimentos"],
  ];

  return (
    <section aria-label="Relacionar atendimentos" className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4">
      <p className="font-semibold">Relacionar atendimentos</p>
      <p className="text-muted">Os escolhidos, a partir deste, passam para a série deste atendimento (contam na mesma guia), com o mesmo plano e valor.</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Relacionar</legend>
        {opcoes.map(([v, rotulo]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="relacionar" checked={modo === v} onChange={() => setModo(v)} className="accent-[var(--accent)]" />
            {rotulo}
          </label>
        ))}
      </fieldset>
      {!lista ? (
        !erro && <p className="text-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-muted">Nenhum outro atendimento do paciente com esse profissional a partir deste.</p>
      ) : (
        <ul aria-label="Atendimentos do paciente" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {lista.map((a) => (
            <li key={a.id}>
              <label className={`flex items-center gap-2 rounded-lg px-2 py-1 ${a.emSerieComGuia ? "opacity-50" : "cursor-pointer hover:bg-black/[0.03]"}`}>
                <input
                  type="checkbox"
                  checked={marcados.has(a.id)}
                  disabled={a.emSerieComGuia || modo !== "selecionar"}
                  onChange={(e) => {
                    const novo = new Set(escolhidos);
                    if (e.target.checked) novo.add(a.id);
                    else novo.delete(a.id);
                    setEscolhidos(novo);
                  }}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="tabular-nums">{dataHoraCurta.format(new Date(a.inicio))}</span>
                <span className="truncate text-muted">
                  {a.profissionais}
                  {a.status === "desmarcado" && " · desmarcado"}
                  {a.emSerieComGuia && " · em outra série com guia"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Voltar
        </button>
        <button type="button" disabled={trabalhando || marcados.size === 0} onClick={relacionar} className={botaoPrimario}>
          {trabalhando ? "Relacionando…" : marcados.size === 1 ? "Relacionar 1 atendimento" : `Relacionar ${marcados.size} atendimentos`}
        </button>
      </div>
    </section>
  );
}
