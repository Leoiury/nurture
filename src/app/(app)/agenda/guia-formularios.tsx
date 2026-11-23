"use client";

// Peças da guia como saldo, usadas no painel do atendimento e na ficha do paciente:
// o resumo de um controle (guias, uso por profissional) e os formulários de criar,
// renovar e editar.

import { useEffect, useState, type ReactNode } from "react";
import { AVISO_DE_RENOVACAO } from "@/lib/agenda/guias";
import { FUSO, partesNoFuso } from "@/lib/agenda/tempo";
import { criarGuia, editarGuia, excluirGuia, opcoesDaGuia, renovarGuia, type ControleDeGuia, type DadosDaGuia, type OpcoesDaGuia } from "./actions-guias";

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

export const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
export const botaoPrimario = "rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50";
export const botaoSecundario = "shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-50";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const falha = { ok: false as const, erro: "Falha de conexão." };

/** Sessões livres: o que sobra depois das usadas e das já reservadas por atendimentos marcados. */
export function livres(c: ControleDeGuia) {
  return c.total - c.usadas - c.agendadas;
}

type Modo = "ver" | "renovar" | "editar";

/** Um controle de guia: saldo, guias recebidas, uso por profissional e as ações da recepção. */
export function ResumoDaGuia({ controle: c, podeEditar, aoAlterar }: { controle: ControleDeGuia; podeEditar: boolean; aoAlterar: (aviso: string) => void }) {
  const [modo, setModo] = useState<Modo>("ver");
  const [erro, setErro] = useState<string | null>(null);
  const sobra = livres(c);
  const restantes = c.total - c.usadas;
  const ultima = c.guias.at(-1);

  function concluido(aviso: string) {
    setModo("ver");
    aoAlterar(aviso);
  }

  return (
    <div aria-label={`Guia ${c.plano ?? "de qualquer plano"}`} role="group" className="flex flex-col gap-2 rounded-2xl bg-black/[0.03] p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium">
          {c.plano ?? "Qualquer plano"} <span className="font-normal text-muted">· desde {dataCurta.format(new Date(c.marcoZero))}</span>
        </p>
        <p className={`tabular-nums ${restantes <= AVISO_DE_RENOVACAO ? "font-medium text-amber-800" : "text-muted"}`}>
          {plural(c.usadas, "usada", "usadas")} de {c.total}
        </p>
      </div>
      <p className="text-muted">
        {c.agendadas > 0 && `${plural(c.agendadas, "sessão agendada", "sessões agendadas")} · `}
        {sobra >= 0 ? (
          plural(sobra, "sessão livre", "sessões livres")
        ) : (
          <span className="text-danger">{plural(-sobra, "atendimento marcado sem guia", "atendimentos marcados sem guia")}</span>
        )}
      </p>
      <ul aria-label="Uso por profissional" className="flex flex-col gap-0.5">
        {c.profissionais.map((p) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span className="truncate">{p.nome}</span>
            <span className="shrink-0 text-muted tabular-nums">
              {plural(p.usadas, "usada", "usadas")}
              {p.agendadas > 0 && ` · ${p.agendadas} agendada${p.agendadas === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {c.guias.map((g) => `${g.numero ? `Nº ${g.numero}` : "Sem número"}: ${g.quantidade}`).join(" · ")}
      </p>

      {modo === "ver" && podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModo("renovar")} className={botaoSecundario}>
            Renovar guia
          </button>
          <button type="button" onClick={() => setModo("editar")} className={botaoSecundario}>
            Editar
          </button>
          {ultima && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(c.guias.length === 1 ? "Excluir esta guia? Os atendimentos continuam na agenda." : "Excluir a última guia recebida? Os atendimentos continuam na agenda.")) return;
                const r = await excluirGuia(ultima.id).catch(() => falha);
                if (r.ok) concluido(c.guias.length === 1 ? "Guia excluída." : "Última guia excluída.");
                else setErro(r.erro);
              }}
              className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
            >
              {c.guias.length === 1 ? "Excluir guia…" : "Excluir a última guia…"}
            </button>
          )}
        </div>
      )}
      {modo === "renovar" && <FormRenovar controleId={c.id} aoCancelar={() => setModo("ver")} aoConcluir={concluido} />}
      {modo === "editar" && (
        <FormDosDados
          titulo="Editar guia"
          inicial={{ planoId: c.planoId, profissionais: c.profissionais.map((p) => p.id), marcoZero: partesNoFuso(c.marcoZero).data }}
          rotuloSalvar="Salvar"
          aoCancelar={() => setModo("ver")}
          aoSalvar={async (dados) => {
            const r = await editarGuia(c.id, dados).catch(() => falha);
            if (r.ok) concluido("Guia atualizada.");
            return r;
          }}
        />
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

function CampoNumeroEQuantidade({ numero, quantidade, aoMudarNumero, aoMudarQuantidade, rotulo }: { numero: string; quantidade: string; aoMudarNumero: (v: string) => void; aoMudarQuantidade: (v: string) => void; rotulo: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Número da guia</span>
        <input value={numero} onChange={(e) => aoMudarNumero(e.target.value)} placeholder="Opcional" className={entrada} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{rotulo}</span>
        <input type="number" min={1} max={500} value={quantidade} onChange={(e) => aoMudarQuantidade(e.target.value)} className={entrada} />
      </label>
    </div>
  );
}

function FormRenovar({ controleId, aoCancelar, aoConcluir }: { controleId: string; aoCancelar: () => void; aoConcluir: (aviso: string) => void }) {
  const [numero, setNumero] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const n = Number(quantidade);

  async function salvar() {
    setTrabalhando(true);
    setErro(null);
    const r = await renovarGuia(controleId, numero, n).catch(() => falha);
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    aoConcluir("Guia renovada.");
  }

  return (
    <section aria-label="Renovar guia" className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-border">
      <p className="font-semibold">Renovar guia</p>
      <p className="text-muted">As sessões entram no saldo e são usadas depois das guias anteriores.</p>
      <CampoNumeroEQuantidade numero={numero} quantidade={quantidade} aoMudarNumero={setNumero} aoMudarQuantidade={setQuantidade} rotulo="Novas sessões" />
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Voltar
        </button>
        <button type="button" disabled={trabalhando || !(n >= 1)} onClick={salvar} className={botaoPrimario}>
          {trabalhando ? "Salvando…" : "Renovar guia"}
        </button>
      </div>
    </section>
  );
}

/** Nova guia: plano, profissionais, marco zero, número e quantidade. */
export function FormNovaGuia({ pacienteId, inicial, aoCancelar, aoConcluir }: { pacienteId: string; inicial: DadosDaGuia; aoCancelar: () => void; aoConcluir: (aviso: string) => void }) {
  const [numero, setNumero] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  return (
    <FormDosDados
      titulo="Gerar guia"
      inicial={inicial}
      rotuloSalvar="Gerar guia"
      aoCancelar={aoCancelar}
      extra={<CampoNumeroEQuantidade numero={numero} quantidade={quantidade} aoMudarNumero={setNumero} aoMudarQuantidade={setQuantidade} rotulo="Sessões" />}
      aoSalvar={async (dados) => {
        const r = await criarGuia(pacienteId, dados, numero, Number(quantidade)).catch(() => falha);
        if (r.ok) aoConcluir("Guia gerada.");
        return r;
      }}
    />
  );
}

function FormDosDados({
  titulo,
  inicial,
  rotuloSalvar,
  extra,
  aoCancelar,
  aoSalvar,
}: {
  titulo: string;
  inicial: DadosDaGuia;
  rotuloSalvar: string;
  extra?: ReactNode;
  aoCancelar: () => void;
  aoSalvar: (dados: DadosDaGuia) => Promise<{ ok: true } | { ok: false; erro: string }>;
}) {
  const [opcoes, setOpcoes] = useState<OpcoesDaGuia | null>(null);
  const [dados, setDados] = useState<DadosDaGuia>(inicial);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    opcoesDaGuia()
      .then((o) => ativo && setOpcoes(o))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar() {
    setTrabalhando(true);
    setErro(null);
    const r = await aoSalvar(dados);
    setTrabalhando(false);
    if (!r.ok) setErro(r.erro);
  }

  const escolhidos = new Set(dados.profissionais);
  return (
    <section aria-label={titulo} className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-border">
      <p className="font-semibold">{titulo}</p>
      {!opcoes ? (
        !erro && <p className="text-muted">Carregando…</p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Plano</span>
            <select value={dados.planoId ?? ""} onChange={(e) => setDados({ ...dados, planoId: e.target.value || null })} className={entrada}>
              <option value="">Qualquer plano</option>
              {opcoes.planos
                .filter((p) => p.ativo || p.id === dados.planoId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Profissionais</legend>
            <p className="mb-1 text-xs text-muted">As sessões são divididas entre eles conforme forem atendendo.</p>
            <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
              {opcoes.profissionais.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-black/[0.03]">
                  <input
                    type="checkbox"
                    checked={escolhidos.has(p.id)}
                    onChange={(e) =>
                      setDados({ ...dados, profissionais: e.target.checked ? [...dados.profissionais, p.id] : dados.profissionais.filter((x) => x !== p.id) })
                    }
                    className="size-4 accent-[var(--accent)]"
                  />
                  {p.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Marco zero</span>
            <input type="date" value={dados.marcoZero} onChange={(e) => setDados({ ...dados, marcoZero: e.target.value })} className={entrada} />
            <span className="text-xs text-muted">Os atendimentos a partir desta data gastam sessão (faltas também; desmarcados não).</span>
          </label>
          {extra}
        </>
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
        <button type="button" disabled={trabalhando || !opcoes || dados.profissionais.length === 0} onClick={salvar} className={botaoPrimario}>
          {trabalhando ? "Salvando…" : rotuloSalvar}
        </button>
      </div>
    </section>
  );
}
