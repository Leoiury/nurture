"use client";

// Painel lateral de um atendimento: detalhes, status rápido, editar, desmarcar,
// excluir e observações.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/agenda/dados";
import { idade } from "@/lib/pacientes";
import { ROTULO_FREQUENCIA } from "@/lib/agenda/recorrencia";
import { FUSO, partesNoFuso, formatarHora } from "@/lib/agenda/tempo";
import {
  adicionarObservacao,
  alterarStatus,
  detalhesAtendimento,
  previaDoAlcance,
  type Alcance,
  type DetalhesAtendimento,
  type Resultado,
} from "./actions";
import { useAcoesDaAgenda } from "./acoes-da-agenda";
import { nomeAbreviado } from "./comum";
import { recomecarAtendimento } from "../atendimento/actions";
import { GuiaDoAtendimento } from "./guia-do-atendimento";
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

/** Os dados do atendimento no formato do formulário de edição. */
export function dadosDeEdicao({ atendimento: a, serie }: DetalhesAtendimento): DadosEdicao {
  const inicio = partesNoFuso(a.inicio);
  return {
    id: a.id,
    recorrenciaId: a.recorrencia_id,
    serie,
    pacienteId: a.paciente_id ?? "",
    pacienteNome: a.paciente?.nome ?? "",
    profissionais: a.profissionais.map((x) => x.profissional.id),
    data: inicio.data,
    hora: formatarHora(inicio.minutos),
    duracaoMin: Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60_000),
    planoId: a.plano_id,
    tipoId: a.tipo_id,
    valor: a.valor,
  };
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
  const router = useRouter();
  const acoes = useAcoesDaAgenda();
  const pendencias = acoes.pendencias?.(id) ?? null;
  const [dados, setDados] = useState<DetalhesAtendimento | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [modo, setModo] = useState<Modo>("ver");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novaObservacao, setNovaObservacao] = useState("");
  const [confirmandoRecomeco, setConfirmandoRecomeco] = useState(false);

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
    if (dados) aoEditar(dadosDeEdicao(dados));
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
            {/* No planejamento: o painel mostra a agenda real; as mudanças do rascunho ficam aqui. */}
            {pendencias && (
              <section aria-label="Alterações no planejamento" className="flex flex-col gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900 ring-1 ring-amber-200">
                <p className="text-xs font-semibold tracking-wide uppercase">No planejamento</p>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {pendencias.descricoes.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    pendencias.desfazer();
                    aoFechar();
                  }}
                  className="self-start text-xs font-medium underline underline-offset-2"
                >
                  Desfazer no planejamento
                </button>
              </section>
            )}

            {/* Tipo Anamnese: abre a anamnese, e não o registro. */}
            {modo === "ver" && !acoes.planejamento && dados.anamnese && (dados.anamnese.atende || dados.anamnese.id) && (
              <section aria-label="Anamnese do atendimento" className="flex flex-col gap-2">
                <Link
                  href={dados.anamnese.id ? `/anamnese/${dados.anamnese.id}` : `/anamnese?atendimento=${a.id}`}
                  className={`${dados.anamnese.salva ? botaoSecundario : botaoPrimario} self-start`}
                >
                  {dados.anamnese.salva ? "Ver" : dados.anamnese.id ? "Continuar" : "Realizar"} {dados.anamnese.nome}
                </Link>
              </section>
            )}

            {/* Realizar o atendimento (quem atende) ou ler os registros. */}
            {modo === "ver" && !acoes.planejamento && dados.registro && !dados.anamnese && (
              <section aria-label="Registro do atendimento" className="flex flex-col gap-2">
                {dados.registro.atende && dados.registro.iniciado ? (
                  confirmandoRecomeco ? (
                    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
                      <p>O texto em andamento será apagado, e você começa do zero. As versões já salvas continuam guardadas.</p>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setConfirmandoRecomeco(false)} className={botaoSecundario}>
                          Cancelar
                        </button>
                        <button type="button" disabled={trabalhando} onClick={() => executar(() => recomecarAtendimento(a.id), () => router.push(`/atendimento/${a.id}?editar=1`))} className={botaoPrimario}>
                          Recomeçar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/atendimento/${a.id}?editar=1`} className={botaoPrimario}>
                        Continuar atendimento
                      </Link>
                      <button type="button" onClick={() => setConfirmandoRecomeco(true)} className={botaoSecundario}>
                        Recomeçar atendimento
                      </button>
                    </div>
                  )
                ) : dados.registro.atende ? (
                  <Link href={`/atendimento/${a.id}`} className={`${botaoPrimario} self-start`}>
                    Realizar atendimento
                  </Link>
                ) : (
                  dados.registro.iniciado && (
                    <Link href={`/atendimento/${a.id}`} className={`${botaoSecundario} self-start`}>
                      Ver registros
                    </Link>
                  )
                )}
              </section>
            )}

            {/* Ações */}
            {modo === "ver" && dados.podeAlterar && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={editar} className={botaoPrimario}>
                    Editar
                  </button>
                  {acoes.planejamento ? (
                    a.status !== "desmarcado" && (
                      <button type="button" onClick={() => setModo("desmarcar")} className={botaoSecundario}>
                        Desmarcar
                      </button>
                    )
                  ) : a.status === "desmarcado" ? (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => executar(() => alterarStatus(a.id, "marcado"), recarregar)}
                      className={botaoSecundario}
                    >
                      Reativar
                    </button>
                  ) : null}
                </div>
                {a.status !== "desmarcado" && !acoes.planejamento && (
                  <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-0.5 rounded-2xl bg-black/[0.04] p-1">
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
                    {/* Desmarcar pede o motivo: abre o formulário em vez de trocar na hora. */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={false}
                      disabled={trabalhando}
                      onClick={() => setModo("desmarcar")}
                      className="flex-1 rounded-full px-2 py-1.5 text-[13px] text-muted transition hover:text-foreground"
                    >
                      {ROTULO_STATUS.desmarcado}
                    </button>
                  </div>
                )}
              </section>
            )}

            {modo === "desmarcar" && (
              <FormDesmarcar
                alvo={alvoDaAcao(a)}
                pago={dados.financeiro?.recebido ?? 0}
                trabalhando={trabalhando}
                aoCancelar={() => setModo("ver")}
                aoConfirmar={(alcance, motivo) =>
                  executar(
                    () => acoes.desmarcar(a.id, alcance, motivo),
                    (r) => {
                      if (acoes.planejamento) return aoFechar(); // a grade mostra o resultado
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
                profissional={dados.semValores}
                alvo={alvoDaAcao(a)}
                pago={dados.financeiro?.recebido ?? 0}
                trabalhando={trabalhando}
                aoCancelar={() => setModo("ver")}
                aoConfirmar={(alcance, motivo) => executar(() => acoes.excluir(a.id, alcance, motivo), aoFechar)}
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
              {!dados.semValores && (
                <>
                  <dt className="text-muted">Plano</dt>
                  <dd className="flex items-center gap-1.5">
                    {a.plano && <span className="inline-block size-3 rounded-sm" style={{ background: a.plano.cor }} />}
                    {a.plano?.nome ?? "—"}
                  </dd>
                </>
              )}
              <dt className="text-muted">Tipo</dt>
              <dd>{a.tipo?.nome ?? "—"}</dd>
              {!dados.semValores && (
                <>
                  <dt className="text-muted">Valor</dt>
                  <dd>{a.valor != null ? moeda.format(a.valor) : "—"}</dd>
                </>
              )}
              {dados.financeiro && (a.valor ?? 0) > 0 && (
                <>
                  <dt className="text-muted">Pagamento</dt>
                  <dd>
                    <SeloDoPagamento valor={a.valor ?? 0} {...dados.financeiro} />
                  </dd>
                </>
              )}
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

            {/* Guia do convênio (fora do planejamento: age direto na agenda) */}
            {!acoes.planejamento && a.paciente_id && (
              <GuiaDoAtendimento
                atendimentoId={a.id}
                status={a.status}
                versao={versao}
                aoAlterar={(texto) => {
                  setAviso(texto);
                  recarregar();
                }}
              />
            )}

            {/* Observações (não fazem parte do planejamento) */}
            <section className={`flex flex-col gap-2 ${acoes.planejamento ? "hidden" : ""}`}>
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
                  {!dados.semValores && <Linha rotulo="Plano padrão">{p.plano?.nome ?? "—"}</Linha>}
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
            {modo === "ver" && dados.podeAlterar && (
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

/** O atendimento sobre o qual se desmarca ou exclui, com o que as opções de alcance citam. */
type AlvoDaAcao = { id: string; paciente: string; quando: string; profissional: string | null };

const diaDaSemanaLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" });
const dataDaPrevia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" });

function alvoDaAcao(a: DetalhesAtendimento["atendimento"]): AlvoDaAcao {
  const dia = diaDaSemanaLongo.format(new Date(a.inicio));
  // "toda segunda-feira", mas "todo sábado" e "todo domingo".
  const todo = dia === "sábado" || dia === "domingo" ? "todo" : "toda";
  return {
    id: a.id,
    paciente: a.paciente?.nome ?? "paciente",
    quando: `${todo} ${dia} às ${formatarHora(partesNoFuso(a.inicio).minutos)}`,
    profissional: a.profissionais[0]?.profissional.nome ?? null,
  };
}

/**
 * Só este; todos do paciente no mesmo dia da semana e horário; ou este e todos os
 * próximos do paciente. Os dois últimos: só de agora em diante e com o mesmo profissional
 * (o banco aplica a mesma regra). Antes de confirmar, mostra quais atendimentos entram.
 */
function EscolhaDeAlcance({ alvo, valor, aoMudar, desmarcar }: { alvo: AlvoDaAcao; valor: Alcance; aoMudar: (a: Alcance) => void; desmarcar?: boolean }) {
  const [previa, setPrevia] = useState<{ alcance: Alcance; lista: { id: string; inicio: string }[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (valor === "este") return;
    let ativo = true;
    previaDoAlcance(alvo.id, valor)
      .then((lista) => ativo && (setPrevia({ alcance: valor, lista }), setErro(null)))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [alvo.id, valor]);

  const com = alvo.profissional ? ` com ${nomeAbreviado(alvo.profissional)}` : "";
  const opcoes: [Alcance, string][] = [
    ["este", desmarcar ? "Desmarcar só este" : "Excluir só este"],
    ["mesmo_horario", `Todos de ${alvo.paciente} ${alvo.quando}${com}`],
    ["proximos_do_paciente", `Este e todos os próximos de ${alvo.paciente}${com}`],
  ];
  const lista = previa?.alcance === valor ? previa.lista : null;
  const MOSTRAR = 8;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Aplicar a</legend>
      {opcoes.map(([v, rotulo]) => (
        <label key={v} className="flex cursor-pointer items-start gap-2">
          <input type="radio" name="alcance" checked={valor === v} onChange={() => aoMudar(v)} className="mt-0.5 accent-[var(--accent)]" />
          {rotulo}
        </label>
      ))}
      {valor !== "este" && (
        <div role="status" aria-label="Atendimentos atingidos" className="mt-1 rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-border">
          {erro ? (
            <span className="text-danger">{erro}</span>
          ) : !lista ? (
            <span className="text-muted">Conferindo…</span>
          ) : (
            <>
              <p className="font-medium">{lista.length === 1 ? "1 atendimento" : `${lista.length} atendimentos`} (só de agora em diante):</p>
              <p className="mt-0.5 text-muted first-letter:uppercase">
                {lista
                  .slice(0, MOSTRAR)
                  .map((x) => dataDaPrevia.format(new Date(x.inicio)).replace(",", ""))
                  .join(" · ")}
                {lista.length > MOSTRAR && ` · e mais ${lista.length - MOSTRAR}`}
              </p>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** Situação do pagamento no painel (só para a direção). */
function SeloDoPagamento({ valor, recebido, baixado }: { valor: number; recebido: number; baixado: number }) {
  const falta = Math.max(0, valor - recebido - baixado);
  const [rotulo, cor] =
    falta < 0.005
      ? [baixado > 0 ? "Encerrado (com baixa)" : "Pago", "bg-emerald-50 text-emerald-800"]
      : recebido + baixado > 0
        ? [`Pago em parte · falta ${moeda.format(falta)}`, "bg-amber-50 text-amber-800"]
        : ["Em aberto", "bg-red-50 text-red-800"];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cor}`}>{rotulo}</span>;
}

/** Aviso ao desmarcar/excluir um atendimento que já tem pagamento. */
function AvisoDePago({ pago }: { pago: number }) {
  if (pago <= 0) return null;
  return (
    <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
      Este atendimento já tem {moeda.format(pago)} pago. O pagamento continua ligado a ele e vai aparecer em Financeiro → Pagamentos → A revisar.
    </p>
  );
}

function FormDesmarcar({
  alvo,
  pago,
  trabalhando,
  aoCancelar,
  aoConfirmar,
}: {
  alvo: AlvoDaAcao;
  pago: number;
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
      <AvisoDePago pago={pago} />
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
      <EscolhaDeAlcance alvo={alvo} valor={alcance} aoMudar={setAlcance} desmarcar />
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
  profissional,
  alvo,
  pago,
  trabalhando,
  aoCancelar,
  aoConfirmar,
}: {
  /** Perfil profissional: a recepção e a direção recebem o aviso da exclusão. */
  profissional: boolean;
  alvo: AlvoDaAcao;
  pago: number;
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
        {profissional
          ? "O atendimento some da agenda, e a recepção e a direção recebem um aviso. Para faltas e cancelamentos, use “Desmarcar”."
          : "O atendimento some da agenda, mas fica guardado com esta observação, a data e quem excluiu. Para faltas e cancelamentos, use “Desmarcar”."}
      </p>
      <AvisoDePago pago={pago} />
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        placeholder="Motivo da exclusão (obrigatório)"
        aria-label="Motivo da exclusão"
        className={entrada}
      />
      <EscolhaDeAlcance alvo={alvo} valor={alcance} aoMudar={setAlcance} />
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
