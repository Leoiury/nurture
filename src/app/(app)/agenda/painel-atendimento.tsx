"use client";

// Painel lateral de um atendimento: detalhes, status rápido, editar, desmarcar,
// excluir e observações.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/agenda/dados";
import { idade } from "@/lib/pacientes";
import { ROTULO_FREQUENCIA } from "@/lib/agenda/recorrencia";
import { FUSO, partesNoFuso, formatarHora } from "@/lib/agenda/tempo";
import {
  adicionarObservacao,
  alterarStatus,
  desmarcar,
  detalhesAtendimento,
  excluir,
  type Alcance,
  type DetalhesAtendimento,
  type Resultado,
} from "./actions";
import type { DadosEdicao } from "./painel-novo-atendimento";

const ROTULO_STATUS: Record<Status, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  desmarcado: "Desmarcado",
};
const STATUS_RAPIDOS = ["marcado", "confirmado", "atendido", "faltou"] as const;

export const MOTIVOS_DESMARCACAO = [
  "Paciente desmarcou",
  "Paciente faltou sem avisar",
  "Profissional ausente",
  "Feriado / recesso",
  "Outro",
] as const;

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const dataHoraCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

type Props = {
  id: string;
  aoFechar: () => void;
  aoEditar: (dados: DadosEdicao) => void;
  /** Falso quando o painel já está na página do paciente. */
  mostrarLinkDoPaciente?: boolean;
};

type Modo = "ver" | "desmarcar" | "excluir";

export function PainelAtendimento({ id, aoFechar, aoEditar, mostrarLinkDoPaciente = true }: Props) {
  const [dados, setDados] = useState<DetalhesAtendimento | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [modo, setModo] = useState<Modo>("ver");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novaObservacao, setNovaObservacao] = useState("");

  useEffect(() => {
    let ativo = true;
    detalhesAtendimento(id)
      .then((d) => {
        if (ativo) setDados(d);
      })
      .catch((e: Error) => {
        if (ativo) setErroCarga(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [id, versao]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modo !== "ver") setModo("ver");
      else aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, modo]);

  /** Executa uma ação e recarrega o painel (ou fecha, se o atendimento sumiu). */
  async function executar(acao: () => Promise<Resultado>, depois: (r: Extract<Resultado, { ok: true }>) => void) {
    setTrabalhando(true);
    setErro(null);
    const r = await acao().catch((): Resultado => ({ ok: false, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    depois(r);
  }

  const recarregar = () => setVersao((v) => v + 1);

  const a = dados?.atendimento;
  const p = a?.paciente;

  function editar() {
    if (!a || !dados) return;
    const inicio = partesNoFuso(a.inicio);
    aoEditar({
      id: a.id,
      recorrenciaId: a.recorrencia_id,
      serie: dados.serie,
      pacienteId: a.paciente_id ?? "",
      pacienteNome: p?.nome ?? "",
      profissionais: a.profissionais.map((x) => x.profissional.id),
      data: inicio.data,
      hora: formatarHora(inicio.minutos),
      duracaoMin: Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60_000),
      planoId: a.plano_id,
      tipoId: a.tipo_id,
      valor: a.valor,
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do atendimento"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{a ? (p?.nome ?? "Sem paciente") : erroCarga ? "Erro" : "Carregando…"}</h2>
            {a && (
              <p className="text-sm text-muted first-letter:uppercase">
                {dataHora.format(new Date(a.inicio))} – {hora.format(new Date(a.fim))}
              </p>
            )}
          </div>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        {erroCarga && <p className="p-5 text-sm text-danger">{erroCarga}</p>}

        {a && dados && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 text-sm">
            {/* Ações */}
            {modo === "ver" && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={editar} className={botaoPrimario}>
                    Editar
                  </button>
                  {a.status === "desmarcado" ? (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => executar(() => alterarStatus(a.id, "marcado"), recarregar)}
                      className={botaoSecundario}
                    >
                      Reativar
                    </button>
                  ) : (
                    <button type="button" onClick={() => setModo("desmarcar")} className={botaoSecundario}>
                      Desmarcar
                    </button>
                  )}
                </div>
                {a.status !== "desmarcado" && (
                  <div role="radiogroup" aria-label="Status" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1">
                    {STATUS_RAPIDOS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={a.status === s}
                        disabled={trabalhando}
                        onClick={() => a.status !== s && executar(() => alterarStatus(a.id, s), recarregar)}
                        className={`flex-1 rounded-full px-2 py-1.5 text-[13px] transition ${
                          a.status === s ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {ROTULO_STATUS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {modo === "desmarcar" && (
              <FormDesmarcar
                serie={dados.serie}
                trabalhando={trabalhando}
                aoCancelar={() => setModo("ver")}
                aoConfirmar={(alcance, motivo) =>
                  executar(
                    () => desmarcar(a.id, alcance, motivo),
                    (r) => {
                      setAviso(r.quantidade && r.quantidade > 1 ? `${r.quantidade} atendimentos desmarcados.` : "Atendimento desmarcado.");
                      setModo("ver");
                      recarregar();
                    },
                  )
                }
              />
            )}

            {modo === "excluir" && (
              <FormExcluir
                serie={dados.serie}
                trabalhando={trabalhando}
                aoCancelar={() => setModo("ver")}
                aoConfirmar={(alcance, motivo) => executar(() => excluir(a.id, alcance, motivo), aoFechar)}
              />
            )}

            {erro && (
              <p role="alert" className="text-danger">
                {erro}
              </p>
            )}
            {aviso && modo === "ver" && (
              <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-accent">
                {aviso}
              </p>
            )}

            {/* Detalhes */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">{a.profissionais.length > 1 ? "Profissionais" : "Profissional"}</dt>
              <dd>{a.profissionais.map((x) => x.profissional.nome).join(", ")}</dd>
              <dt className="text-muted">Plano</dt>
              <dd className="flex items-center gap-1.5">
                {a.plano && <span className="inline-block size-3 rounded-sm" style={{ background: a.plano.cor }} />}
                {a.plano?.nome ?? "—"}
              </dd>
              <dt className="text-muted">Tipo</dt>
              <dd>{a.tipo?.nome ?? "—"}</dd>
              <dt className="text-muted">Valor</dt>
              <dd>{a.valor != null ? moeda.format(a.valor) : "—"}</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                {ROTULO_STATUS[a.status]}
                {a.status === "desmarcado" && a.motivo_desmarcacao && <span className="text-muted"> · {a.motivo_desmarcacao}</span>}
              </dd>
              {a.recorrencia && dados.serie && (
                <>
                  <dt className="text-muted">Série</dt>
                  <dd>
                    {ROTULO_FREQUENCIA[a.recorrencia.frequencia]} · {plural(dados.serie.total, "atendimento", "atendimentos")}
                  </dd>
                </>
              )}
            </dl>

            {/* Observações */}
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Observações</h3>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void executar(
                    () => adicionarObservacao(a.id, novaObservacao),
                    () => {
                      setNovaObservacao("");
                      recarregar();
                    },
                  );
                }}
              >
                <input
                  value={novaObservacao}
                  onChange={(e) => setNovaObservacao(e.target.value)}
                  placeholder="Escrever observação…"
                  aria-label="Nova observação"
                  className={entrada}
                />
                <button type="submit" disabled={trabalhando || !novaObservacao.trim()} className={`${botaoSecundario} disabled:opacity-50`}>
                  Adicionar
                </button>
              </form>
              {a.observacao && <Observacao texto={a.observacao} rodape="Observação do sistema anterior" automatica />}
              {dados.observacoes.length === 0 && !a.observacao && <p className="text-muted">Nenhuma observação.</p>}
              <ul className="flex flex-col gap-1.5" aria-label="Lista de observações">
                {dados.observacoes.map((o) => (
                  <li key={o.id}>
                    <Observacao
                      texto={o.texto}
                      rodape={`${dataHoraCurta.format(new Date(o.criado_em))}${o.automatica ? " · automática" : ""}`}
                      automatica={o.automatica}
                    />
                  </li>
                ))}
              </ul>
            </section>

            {/* Paciente */}
            {p && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Paciente</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  {p.data_nascimento && (
                    <Linha rotulo="Idade">
                      {idade(p.data_nascimento)} <span className="text-muted">({p.data_nascimento.split("-").reverse().join("/")})</span>
                    </Linha>
                  )}
                  {p.responsavel && <Linha rotulo="Responsável">{p.responsavel}</Linha>}
                  {p.celular && (
                    <Linha rotulo="Celular">
                      <a href={`tel:${p.celular.replace(/\D/g, "")}`} className="text-accent hover:underline">
                        {p.celular}
                      </a>
                    </Linha>
                  )}
                  {p.email && <Linha rotulo="E-mail">{p.email}</Linha>}
                  <Linha rotulo="Plano padrão">{p.plano?.nome ?? "—"}</Linha>
                </dl>
                {mostrarLinkDoPaciente && (
                  <Link
                    href={`/pacientes/${p.id}`}
                    className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-medium hover:border-accent hover:text-accent"
                  >
                    Ver página do paciente
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </section>
            )}

            {/* Excluir: raro, fica discreto no fim */}
            {modo === "ver" && (
              <button type="button" onClick={() => setModo("excluir")} className="self-start text-xs text-muted underline-offset-2 hover:text-danger hover:underline">
                Excluir atendimento…
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
const botaoPrimario = "rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const botaoSecundario = "shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-50";

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{rotulo}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </>
  );
}

function Observacao({ texto, rodape, automatica }: { texto: string; rodape: string; automatica: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${automatica ? "bg-black/[0.03] text-muted" : "bg-accent-soft/60"}`}>
      <p className="whitespace-pre-wrap">{texto}</p>
      <p className="mt-0.5 text-[11px] text-muted">{rodape}</p>
    </div>
  );
}

type Serie = DetalhesAtendimento["serie"];

/** Opções de alcance numa série (sem série, é sempre "só este"). */
function EscolhaDeAlcance({
  serie,
  valor,
  aoMudar,
  comTodos,
}: {
  serie: Serie;
  valor: Alcance;
  aoMudar: (a: Alcance) => void;
  comTodos: boolean;
}) {
  if (!serie || serie.total <= 1) return null;
  const opcoes: [Alcance, string][] = [
    ["este", "Só este"],
    ["seguintes", `Este e os próximos (${serie.seguintes})`],
    ...(comTodos ? ([["todos", `Todos da série (${serie.total})`]] as [Alcance, string][]) : []),
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Aplicar a</legend>
      {opcoes.map(([v, rotulo]) => (
        <label key={v} className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="alcance" checked={valor === v} onChange={() => aoMudar(v)} className="accent-[var(--accent)]" />
          {rotulo}
        </label>
      ))}
    </fieldset>
  );
}

function FormDesmarcar({
  serie,
  trabalhando,
  aoCancelar,
  aoConfirmar,
}: {
  serie: Serie;
  trabalhando: boolean;
  aoCancelar: () => void;
  aoConfirmar: (alcance: Alcance, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS_DESMARCACAO)[number] | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [alcance, setAlcance] = useState<Alcance>("este");
  const outro = motivo === "Outro";
  const texto = outro ? detalhe.trim() : motivo ? (detalhe.trim() ? `${motivo}: ${detalhe.trim()}` : motivo) : "";

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4" aria-label="Desmarcar atendimento">
      <p className="font-semibold">Desmarcar</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Motivo</legend>
        {MOTIVOS_DESMARCACAO.map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="motivo" checked={motivo === m} onChange={() => setMotivo(m)} className="accent-[var(--accent)]" />
            {m}
          </label>
        ))}
      </fieldset>
      <input
        value={detalhe}
        onChange={(e) => setDetalhe(e.target.value)}
        placeholder={outro ? "Descreva o motivo" : "Detalhe (opcional)"}
        aria-label="Detalhe do motivo"
        className={entrada}
      />
      <EscolhaDeAlcance serie={serie} valor={alcance} aoMudar={setAlcance} comTodos={false} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Voltar
        </button>
        <button type="button" disabled={trabalhando || !texto} onClick={() => aoConfirmar(alcance, texto)} className={botaoPrimario}>
          {trabalhando ? "Desmarcando…" : "Confirmar desmarcação"}
        </button>
      </div>
    </section>
  );
}

function FormExcluir({
  serie,
  trabalhando,
  aoCancelar,
  aoConfirmar,
}: {
  serie: Serie;
  trabalhando: boolean;
  aoCancelar: () => void;
  aoConfirmar: (alcance: Alcance, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [alcance, setAlcance] = useState<Alcance>("este");

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200" aria-label="Excluir atendimento">
      <p className="font-semibold text-danger">Excluir atendimento</p>
      <p className="text-muted">
        O atendimento some da agenda, mas fica guardado com esta observação, a data e quem excluiu. Para faltas e cancelamentos, use
        “Desmarcar”.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        placeholder="Motivo da exclusão (obrigatório)"
        aria-label="Motivo da exclusão"
        className={entrada}
      />
      <EscolhaDeAlcance serie={serie} valor={alcance} aoMudar={setAlcance} comTodos />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Voltar
        </button>
        <button
          type="button"
          disabled={trabalhando || !motivo.trim()}
          onClick={() => aoConfirmar(alcance, motivo)}
          className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {trabalhando ? "Excluindo…" : "Excluir"}
        </button>
      </div>
    </section>
  );
}
