"use client";

import { useState } from "react";
import { criarData, excluirData, type NovaData } from "./actions";

type Data = { id: string; nome: string; descricao: string | null; regra: string; proxima: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ORDENS: [number, string][] = [
  [1, "1ª/1º"],
  [2, "2ª/2º"],
  [3, "3ª/3º"],
  [4, "4ª/4º"],
  [-1, "Última/último"],
];

const entrada = "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
const dataBr = (d: string) => d.split("-").reverse().join("/");

export function ListaDeDatas({ datas }: { datas: Data[] }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<"fixa" | "movel" | "pascoa">("fixa");
  const [dias, setDias] = useState(-47);
  const [dia, setDia] = useState(1);
  const [mes, setMes] = useState(1);
  const [ordem, setOrdem] = useState(2);
  const [diaSemana, setDiaSemana] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) {
    setSalvando(true);
    setErro(null);
    const r = await acao().catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    depois?.();
  }

  const nova = (): NovaData =>
    tipo === "fixa"
      ? { nome, descricao, tipo, dia, mes }
      : tipo === "movel"
        ? { nome, descricao, tipo, ordem, diaSemana, mes }
        : { nome, descricao, tipo, dias };

  return (
    <>
      <form
        aria-label="Nova data comemorativa"
        onSubmit={(e) => {
          e.preventDefault();
          void executar(
            () => criarData(nova()),
            () => {
              setNome("");
              setDescricao("");
            },
          );
        }}
        className="flex flex-col gap-3 rounded-2xl bg-surface p-4 text-sm shadow-sm ring-1 ring-black/5"
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Dia do Psicólogo" className={`${entrada} w-full`} />
          </label>
          <div role="radiogroup" aria-label="Tipo de data" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1">
            {(
              [
                ["fixa", "Dia fixo"],
                ["movel", "Dia da semana"],
                ["pascoa", "Pela Páscoa"],
              ] as const
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={tipo === v}
                onClick={() => setTipo(v)}
                className={`rounded-full px-3 py-1.5 ${tipo === v ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tipo === "pascoa" ? (
            <label className="flex items-center gap-2">
              <input
                type="number"
                min={-100}
                max={100}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                aria-label="Dias em relação à Páscoa"
                className={`${entrada} w-24`}
              />
              <span className="text-muted">dias em relação ao domingo de Páscoa (negativo = antes; Carnaval = -47)</span>
            </label>
          ) : tipo === "fixa" ? (
            <select value={dia} onChange={(e) => setDia(Number(e.target.value))} aria-label="Dia" className={entrada}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value={-1}>Último dia</option>
            </select>
          ) : (
            <>
              <select value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} aria-label="Qual" className={entrada}>
                {ORDENS.map(([v, rotulo]) => (
                  <option key={v} value={v}>
                    {rotulo}
                  </option>
                ))}
              </select>
              <select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))} aria-label="Dia da semana" className={entrada}>
                {DIAS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </>
          )}
          {tipo !== "pascoa" && (
            <>
              <span className="text-muted">de</span>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} aria-label="Mês" className={entrada}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="submit" disabled={salvando || !nome.trim()} className="ml-auto rounded-full bg-accent px-4 py-2 font-medium text-white hover:brightness-110 disabled:opacity-50">
            Adicionar
          </button>
        </div>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição ou ideia para a data (opcional)"
          aria-label="Descrição"
          className={`${entrada} w-full`}
        />
        {erro && (
          <p role="alert" className="text-danger">
            {erro}
          </p>
        )}
      </form>

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5" aria-label="Datas comemorativas">
        {datas.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{d.nome}</span>
              <span className="block text-muted">
                {d.regra}
                {d.proxima !== "9999" && ` · próxima: ${dataBr(d.proxima)}`}
              </span>
              {d.descricao && <span className="block text-xs text-muted/80">{d.descricao}</span>}
            </span>
            <button
              type="button"
              disabled={salvando}
              onClick={() => confirm(`Excluir “${d.nome}”?`) && void executar(() => excluirData(d.id))}
              aria-label={`Excluir ${d.nome}`}
              className="rounded-full px-2 py-1 text-muted hover:bg-background hover:text-danger"
            >
              ✕
            </button>
          </li>
        ))}
        {datas.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nenhuma data cadastrada.</li>}
      </ul>
    </>
  );
}
