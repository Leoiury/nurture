"use client";

import { useEffect, useState } from "react";
import { contarAtendimentosNoPeriodo, criarFeriado, removerFeriado } from "./actions";

const entrada =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function FormFeriado() {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"feriado" | "recesso">("feriado");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [afetados, setAfetados] = useState<number | null>(null);
  const [desmarcar, setDesmarcar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const fimEfetivo = tipo === "feriado" ? inicio : fim || inicio;

  // Quantos atendimentos marcados caem no período (para oferecer a desmarcação).
  useEffect(() => {
    if (!inicio || !fimEfetivo) return;
    let ativo = true;
    const t = setTimeout(() => {
      contarAtendimentosNoPeriodo(inicio, fimEfetivo)
        .then((n) => {
          if (ativo) setAfetados(n);
        })
        .catch(() => {
          if (ativo) setAfetados(null);
        });
    }, 300);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [inicio, fimEfetivo]);

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    const r = await criarFeriado({ nome, tipo, inicio, fim: fimEfetivo, desmarcar: desmarcar && !!afetados }).catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    setSalvando(false);
    if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
    setMensagem({
      tipo: "ok",
      texto: r.desmarcados ? `Salvo. ${r.desmarcados} atendimento(s) desmarcado(s).` : "Salvo.",
    });
    setNome("");
    setInicio("");
    setFim("");
    setDesmarcar(false);
    setAfetados(null);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo">
        {(["feriado", "recesso"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={`rounded-full px-4 py-1.5 text-sm ${tipo === t ? "bg-accent text-white" : "bg-black/[0.04] hover:bg-black/[0.07]"}`}
          >
            {t === "feriado" ? "Feriado" : "Recesso"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        Nome
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={tipo === "feriado" ? "Ex.: Aniversário de Videira" : "Ex.: Recesso de fim de ano"}
          className={`${entrada} w-full`}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          {tipo === "feriado" ? "Data" : "De"}
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={entrada} required />
        </label>
        {tipo === "recesso" && (
          <label className="flex flex-col gap-1.5 text-sm">
            Até
            <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className={entrada} />
          </label>
        )}
      </div>

      {!!afetados && (
        <label className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <input type="checkbox" checked={desmarcar} onChange={(e) => setDesmarcar(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            Há <strong>{afetados}</strong> atendimento{afetados === 1 ? "" : "s"} marcado{afetados === 1 ? "" : "s"} nesse período. Desmarcar
            {afetados === 1 ? "" : " todos"} com o motivo “Feriado / recesso”?
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={salvando || !nome.trim() || !inicio}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Cadastrar"}
        </button>
        {mensagem && (
          <p role={mensagem.tipo === "erro" ? "alert" : "status"} className={`text-sm ${mensagem.tipo === "erro" ? "text-danger" : "text-accent"}`}>
            {mensagem.texto}
          </p>
        )}
      </div>
    </form>
  );
}

export function RemoverFeriado({ id, nome }: { id: string; nome: string }) {
  const [removendo, setRemovendo] = useState(false);
  return (
    <button
      type="button"
      disabled={removendo}
      aria-label={`Remover ${nome}`}
      onClick={async () => {
        if (!confirm(`Remover “${nome}”? Os atendimentos desmarcados por ele continuam desmarcados.`)) return;
        setRemovendo(true);
        const r = await removerFeriado(id).catch(() => ({ ok: false as const, erro: "" }));
        if (!r.ok) {
          setRemovendo(false);
          alert("Não foi possível remover.");
        }
      }}
      className="rounded-full px-3 py-1 text-xs text-muted hover:bg-background hover:text-danger disabled:opacity-50"
    >
      Remover
    </button>
  );
}
