"use client";

// Painel (sheet) para lançar um novo atendimento — avulso ou em série — ou editar
// um existente. Padrões automáticos (sempre editáveis): o plano vem do paciente;
// duração e valor vêm do plano; o tipo vem do primeiro profissional (tipos que ele atende).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ROTULO_TIPO_DIA, semExpediente, type DiaEspecial } from "@/lib/agenda/feriados";
import {
  MAXIMO_DE_SESSOES,
  ROTULO_FREQUENCIA,
  candidatasDaSerie,
  datasDaSerie,
  datasSemBloqueios,
  descricaoMensal,
  type Frequencia,
} from "@/lib/agenda/recorrencia";
import { hoje as dataDeHoje, nomeCurtoDoDia, partesNoFuso } from "@/lib/agenda/tempo";
import { lerValor } from "@/lib/agenda/valores";
import { atendeOTipo, tipoSugerido } from "@/lib/agenda/tipos";
import { paraBusca } from "@/lib/pacientes";
import { useAcoesDaAgenda } from "./acoes-da-agenda";
import type { Alcance } from "./actions";
import {
  buscarHorariosLivres,
  criarPaciente,
  diasEspeciaisNoPeriodo,
  opcoesDoFormulario,
  verificarConflitos,
  type BuscaDeHorarios,
  type Conflito,
  type HorarioSugerido,
  type OpcoesDoFormulario,
  type Serie,
} from "./actions-novo-atendimento";
import { nomeAbreviado } from "./comum";

/** Atendimento existente aberto para edição. */
export type DadosEdicao = {
  id: string;
  recorrenciaId: string | null;
  serie: { total: number; seguintes: number } | null;
  pacienteId: string;
  pacienteNome: string;
  profissionais: string[];
  data: string;
  hora: string;
  duracaoMin: number;
  planoId: string | null;
  tipoId: string | null;
  valor: number | null;
};

type Props = {
  aoFechar: () => void;
  /** Pré-preenchimento (ex.: ao clicar num horário vazio da grade). */
  inicial?: { data?: string; hora?: string; profissionalId?: string };
  /** Se informado, o painel edita este atendimento em vez de criar um novo. */
  edicao?: DadosEdicao;
};


const DURACOES = [30, 45, 60];
const STATUS_INICIAIS = [
  { valor: "marcado", rotulo: "Marcado" },
  { valor: "confirmado", rotulo: "Confirmado" },
  { valor: "atendido", rotulo: "Atendido" },
] as const;

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dataCurta = (d: string) => `${nomeCurtoDoDia(d)} ${formatoData.format(new Date(`${d}T12:00:00Z`))}`;

export function PainelNovoAtendimento({ aoFechar, inicial, edicao }: Props) {
  const acoes = useAcoesDaAgenda();
  const [opcoes, setOpcoes] = useState<OpcoesDoFormulario | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [pacienteId, setPacienteId] = useState<string | null>(edicao?.pacienteId || null);
  const [busca, setBusca] = useState(edicao?.pacienteNome ?? "");
  const [cadastrandoPaciente, setCadastrandoPaciente] = useState(false);
  const [profissionais, setProfissionais] = useState<string[]>(
    edicao?.profissionais ?? (inicial?.profissionalId ? [inicial.profissionalId] : []),
  );
  const [data, setData] = useState(edicao?.data ?? inicial?.data ?? dataDeHoje());
  const [hora, setHora] = useState(edicao?.hora ?? inicial?.hora ?? "");
  const [duracao, setDuracao] = useState(edicao?.duracaoMin ?? 45);
  const [planoId, setPlanoId] = useState<string | null>(edicao?.planoId ?? null);
  const [tipoId, setTipoId] = useState<string | null>(edicao?.tipoId ?? null);
  const [valor, setValor] = useState(edicao?.valor != null ? String(edicao.valor).replace(".", ",") : "");
  const [alcance, setAlcance] = useState<Alcance>("este");
  const [status, setStatus] = useState<(typeof STATUS_INICIAIS)[number]["valor"]>("marcado");
  const [observacao, setObservacao] = useState("");

  const [repetir, setRepetir] = useState(false);
  const [frequencia, setFrequencia] = useState<Frequencia>("semanal");
  const [fimPor, setFimPor] = useState<"data" | "sessoes">("data");
  const [ate, setAte] = useState("");
  const [sessoes, setSessoes] = useState(10);
  const [pularFeriados, setPularFeriados] = useState(true);
  const [especiais, setEspeciais] = useState<Record<string, DiaEspecial[]>>({});

  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    opcoesDoFormulario()
      .then((o) => {
        if (!ativo) return;
        setOpcoes(o);
        // Aberto a partir de uma coluna (profissional já escolhido): sugere o tipo.
        if (!edicao && inicial?.profissionalId) {
          setTipoId((atual) => atual ?? tipoSugerido(o.profissionais.find((p) => p.id === inicial.profissionalId), o.tipos));
        }
      })
      .catch((e: Error) => {
        if (ativo) setErroCarga(e.message);
      });
    return () => {
      ativo = false;
    };
    // Só na abertura: o painel é recriado (key) a cada novo horário/edição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const serie: Serie = repetir
    ? { frequencia, fim: fimPor === "data" ? { tipo: "data", ate: ate || data } : { tipo: "sessoes", quantidade: sessoes }, pularFeriados }
    : null;
  // Datas candidatas (com folga, para repor sessões puladas) — definem até quando consultar feriados.
  const candidatas = useMemo(
    () => (serie && data ? candidatasDaSerie(data, serie.frequencia, serie.fim) : data ? [data] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, repetir, frequencia, fimPor, ate, sessoes],
  );
  const bloqueado = (d: string) => semExpediente(especiais[d]);
  const datas = useMemo(
    () => {
      if (!serie) return [data];
      return serie.pularFeriados ? datasSemBloqueios(data, serie.frequencia, serie.fim, bloqueado) : datasDaSerie(data, serie.frequencia, serie.fim);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, repetir, frequencia, fimPor, ate, sessoes, pularFeriados, especiais],
  );
  // Datas da série que caíram em feriado/recesso e foram puladas (até a última data mantida).
  const puladas = serie?.pularFeriados ? candidatas.filter((d) => bloqueado(d) && d <= (datas.at(-1) ?? d)) : [];

  // Feriados e recessos do período das datas candidatas.
  useEffect(() => {
    if (!candidatas.length) return;
    let ativo = true;
    const t = setTimeout(() => {
      diasEspeciaisNoPeriodo(candidatas[0], candidatas.at(-1)!)
        .then((r) => {
          if (ativo) setEspeciais(r);
        })
        .catch(() => {});
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [candidatas]);

  // Conflitos: consulta o banco um instante depois da última mudança nos campos.
  useEffect(() => {
    if (!hora || !data) return;
    const temporizador = setTimeout(() => {
      // Na edição, o próprio atendimento (e a série, se o alcance for além dele) não conta.
      const ignorar = edicao ? { id: edicao.id, recorrenciaId: alcance === "este" ? null : edicao.recorrenciaId } : undefined;
      verificarConflitos({ data, hora, duracaoMin: duracao, serie, profissionais, pacienteId, ignorar })
        .then(setConflitos)
        .catch(() => setConflitos([]));
    }, 400);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hora, duracao, repetir, frequencia, fimPor, ate, sessoes, pularFeriados, profissionais, pacienteId, alcance]);

  const paciente = opcoes?.pacientes.find((p) => p.id === pacienteId) ?? null;
  const sugestoes = useMemo(() => {
    if (!opcoes || paciente) return [];
    const termo = paraBusca(busca);
    if (termo.length < 2) return [];
    return opcoes.pacientes.filter((p) => paraBusca(p.nome).includes(termo)).slice(0, 8);
  }, [opcoes, paciente, busca]);

  function escolherPlano(id: string | null) {
    setPlanoId(id);
    const plano = opcoes?.planos.find((p) => p.id === id);
    if (plano) {
      setDuracao(plano.duracao_padrao_min);
      setValor(plano.valor_padrao != null ? String(plano.valor_padrao).replace(".", ",") : "");
    }
  }

  function escolherPaciente(id: string, nome: string, planoPadrao: string | null) {
    setPacienteId(id);
    setBusca(nome);
    if (planoPadrao) escolherPlano(planoPadrao);
  }

  function adicionarProfissional(id: string) {
    if (!id || profissionais.includes(id)) return;
    if (profissionais.length === 0 && !tipoId && opcoes) {
      setTipoId(tipoSugerido(opcoes.profissionais.find((p) => p.id === id), opcoes.tipos));
    }
    setProfissionais([...profissionais, id]);
  }

  async function salvar() {
    setErro(null);
    const valorNumero = lerValor(valor);
    if (valorNumero !== null && Number.isNaN(valorNumero)) return setErro("Valor inválido.");
    setSalvando(true);
    const comuns = { pacienteId: pacienteId ?? "", profissionais, data, hora, duracaoMin: duracao, planoId, tipoId, valor: valorNumero };
    // Como o card aparece (usado pelo planejamento, que simula antes de gravar).
    const plano = opcoes?.planos.find((p) => p.id === planoId);
    const exibicao = {
      paciente: opcoes?.pacientes.find((p) => p.id === pacienteId)?.nome ?? busca,
      plano: plano ? { nome: plano.nome, cor: plano.cor } : null,
      tipo: opcoes?.tipos.find((t) => t.id === tipoId)?.nome ?? null,
    };
    const resultado = await (edicao
      ? acoes.editar({ ...comuns, id: edicao.id, alcance }, exibicao)
      : acoes.criar({ ...comuns, serie, status, observacao: observacao.trim() }, exibicao)
    ).catch(() => ({ ok: false as const, erro: "Falha de conexão ao salvar." }));
    setSalvando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoFechar();
  }

  const conflitosPorData = new Set(conflitos.map((c) => partesNoFuso(c.inicio).data));
  const especialDaData = especiais[data];
  const podeSalvar = !!pacienteId && profissionais.length > 0 && !!data && !!hora && datas.length > 0 && !salvando;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={edicao ? "Editar atendimento" : "Novo atendimento"}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{edicao ? "Editar atendimento" : "Novo atendimento"}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        {acoes.planejamento && (
          <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
            No planejamento: salvar só altera o rascunho. Avisos de conflito e horários livres ainda consideram a agenda real.
          </p>
        )}
        {erroCarga && <p className="p-5 text-sm text-danger">{erroCarga}</p>}
        {!opcoes && !erroCarga && <p className="p-5 text-sm text-muted">Carregando…</p>}

        {opcoes && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              {/* Paciente */}
              <Campo rotulo="Paciente" id="campo-paciente">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="campo-paciente"
                      value={busca}
                      onChange={(e) => {
                        setBusca(e.target.value);
                        setPacienteId(null);
                      }}
                      placeholder="Buscar pelo nome…"
                      autoComplete="off"
                      className={entrada}
                    />
                    {sugestoes.length > 0 && (
                      <ul role="listbox" aria-label="Pacientes encontrados" className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-black/10">
                        {sugestoes.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={false}
                              onClick={() => escolherPaciente(p.id, p.nome, p.plano_id)}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background"
                            >
                              {p.nome}
                              {p.responsavel && <span className="block text-xs text-muted">Resp.: {p.responsavel}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button type="button" onClick={() => setCadastrandoPaciente(true)} className={botaoSecundario} title="Cadastrar novo paciente">
                    + Novo
                  </button>
                </div>
                {busca.trim().length >= 2 && !paciente && sugestoes.length === 0 && (
                  <p className="text-xs text-muted">Nenhum paciente com esse nome. Use “+ Novo” para cadastrar.</p>
                )}
                {cadastrandoPaciente && (
                  <CadastroRapido
                    nomeInicial={paciente ? "" : busca}
                    planos={opcoes.planos}
                    aoCancelar={() => setCadastrandoPaciente(false)}
                    aoCriar={(novo) => {
                      setOpcoes({ ...opcoes, pacientes: [...opcoes.pacientes, novo].sort((a, b) => a.nome.localeCompare(b.nome)) });
                      escolherPaciente(novo.id, novo.nome, novo.plano_id);
                      setCadastrandoPaciente(false);
                    }}
                  />
                )}
              </Campo>

              {/* Profissionais */}
              <Campo rotulo="Profissionais" id="campo-profissional">
                <div className="flex flex-wrap gap-1.5">
                  {profissionais.map((id) => {
                    const p = opcoes.profissionais.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-3 text-sm text-accent">
                        {p ? nomeAbreviado(p.nome) : "—"}
                        <button
                          type="button"
                          onClick={() => setProfissionais(profissionais.filter((x) => x !== id))}
                          className="rounded-full px-1.5 hover:bg-accent/10"
                          aria-label={`Remover ${p?.nome}`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <select id="campo-profissional" value="" onChange={(e) => adicionarProfissional(e.target.value)} className={entrada}>
                  <option value="">{profissionais.length ? "+ Adicionar outro profissional" : "Escolher profissional…"}</option>
                  {opcoes.profissionais
                    .filter((p) => !profissionais.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.especialidade ? ` — ${p.especialidade}` : ""}
                      </option>
                    ))}
                </select>
              </Campo>

              {/* Quando */}
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data" id="campo-data">
                  <input id="campo-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required className={entrada} />
                </Campo>
                <Campo rotulo="Início" id="campo-hora">
                  <input id="campo-hora" type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} required className={entrada} />
                </Campo>
              </div>

              <Campo rotulo="Duração (min)" id="campo-duracao">
                <div className="flex items-center gap-1.5">
                  {DURACOES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuracao(d)}
                      aria-pressed={duracao === d}
                      className={`rounded-full px-3 py-1.5 text-sm ${duracao === d ? "bg-accent text-white" : "bg-black/[0.04] hover:bg-black/[0.07]"}`}
                    >
                      {d}
                    </button>
                  ))}
                  <input
                    id="campo-duracao"
                    type="number"
                    min={5}
                    max={720}
                    step={5}
                    value={duracao}
                    onChange={(e) => setDuracao(Number(e.target.value))}
                    className={`${entradaBase} w-24`}
                    aria-label="Duração em minutos"
                  />
                </div>
              </Campo>

              {/* Plano, tipo e valor */}
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Plano" id="campo-plano">
                  <select id="campo-plano" value={planoId ?? ""} onChange={(e) => escolherPlano(e.target.value || null)} className={entrada}>
                    <option value="">—</option>
                    {opcoes.planos
                      .filter((p) => p.ativo || p.id === planoId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                          {!p.ativo && " (inativo)"}
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo rotulo="Valor (R$)" id="campo-valor">
                  <input id="campo-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="—" className={entrada} />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Tipo" id="campo-tipo">
                  <select id="campo-tipo" value={tipoId ?? ""} onChange={(e) => setTipoId(e.target.value || null)} className={entrada}>
                    <option value="">—</option>
                    {opcoes.tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                {/* Na edição, status e observações ficam no painel do atendimento. */}
                {!edicao && (
                  <Campo rotulo="Status" id="campo-status">
                    <select id="campo-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={entrada}>
                      {STATUS_INICIAIS.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
              </div>
              {(() => {
                // Só avisa: a clínica pode ter exceções (ex.: cobrir um colega).
                const tipo = opcoes.tipos.find((t) => t.id === tipoId);
                const fora = tipo ? profissionais.filter((id) => !atendeOTipo(tipo, id)) : [];
                return fora.length > 0 ? (
                  <p className="-mt-2 text-xs text-muted">
                    {fora.map((id) => nomeAbreviado(opcoes.profissionais.find((p) => p.id === id)?.nome ?? "")).join(", ")}{" "}
                    {fora.length === 1 ? "não está" : "não estão"} entre quem atende “{tipo!.nome}”.
                  </p>
                ) : null;
              })()}

              <BuscaDeHorariosLivres
                pronta={!!tipoId && duracao > 0}
                criterio={{ dataInicial: data || dataDeHoje(), duracaoMin: duracao, profissionais, tipoId, pacienteId, ignorarId: edicao?.id }}
                nomeDoProfissional={(id) => nomeAbreviado(opcoes.profissionais.find((p) => p.id === id)?.nome ?? "")}
                escolhido={{ data, hora }}
                aoEscolher={(s) => {
                  setData(s.data);
                  setHora(s.hora);
                  if (profissionais.length === 0) setProfissionais(s.profissionalIds);
                }}
              />

              {!edicao && (
                <Campo rotulo="Observação" id="campo-observacao">
                  <textarea id="campo-observacao" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={entrada} />
                </Campo>
              )}

              {/* Na criação: repetição. Na edição de uma série: a quais atendimentos aplicar. */}
              {edicao ? (
                <AlcanceDaEdicao serie={edicao.serie} valor={alcance} aoMudar={setAlcance} />
              ) : (
              <section className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  Repetir
                </label>
                {repetir && (
                  <>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Frequência">
                      {(Object.keys(ROTULO_FREQUENCIA) as Frequencia[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          role="radio"
                          aria-checked={frequencia === f}
                          onClick={() => setFrequencia(f)}
                          className={`rounded-full px-3 py-1.5 text-sm ${frequencia === f ? "bg-accent text-white" : "bg-surface ring-1 ring-black/10 hover:bg-background"}`}
                        >
                          {ROTULO_FREQUENCIA[f]}
                        </button>
                      ))}
                    </div>
                    {frequencia === "mensal" && data && <p className="text-xs text-muted">Sempre na {descricaoMensal(data)}.</p>}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="fim" checked={fimPor === "data"} onChange={() => setFimPor("data")} className="accent-[var(--accent)]" />
                        Até
                      </label>
                      <input
                        type="date"
                        value={ate}
                        min={data}
                        onChange={(e) => {
                          setAte(e.target.value);
                          setFimPor("data");
                        }}
                        className={`${entradaBase} w-40`}
                        aria-label="Repetir até"
                      />
                      <label className="ml-2 flex items-center gap-1.5">
                        <input type="radio" name="fim" checked={fimPor === "sessoes"} onChange={() => setFimPor("sessoes")} className="accent-[var(--accent)]" />
                        ou
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={MAXIMO_DE_SESSOES}
                        value={sessoes}
                        onChange={(e) => {
                          setSessoes(Number(e.target.value));
                          setFimPor("sessoes");
                        }}
                        className={`${entradaBase} w-20`}
                        aria-label="Número de sessões"
                      />
                      sessões
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={pularFeriados} onChange={(e) => setPularFeriados(e.target.checked)} className="accent-[var(--accent)]" />
                      Pular feriados e recessos
                    </label>
                    <PreviaDaSerie
                      datas={datas}
                      puladas={puladas}
                      especiais={especiais}
                      comConflito={conflitosPorData}
                      semDataFinal={fimPor === "data" && !ate}
                    />
                  </>
                )}
              </section>
              )}

              {especialDaData && (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" aria-live="polite">
                  {especialDaData.map((d) => `${ROTULO_TIPO_DIA[d.tipo]}: ${d.nome}`).join(" · ")}
                  {semExpediente(especialDaData) ? " — dá para marcar mesmo assim." : ""}
                </p>
              )}

              {conflitos.length > 0 && (
                <section className="flex flex-col gap-1 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" aria-live="polite">
                  <p className="font-medium">Atenção: {conflitos.length === 1 ? "há 1 conflito" : `há ${conflitos.length} conflitos`} (dá para salvar mesmo assim)</p>
                  <ul className="list-disc pl-5 text-[13px]">
                    {conflitos.slice(0, 6).map((c, i) => (
                      <li key={i}>{c.descricao}</li>
                    ))}
                    {conflitos.length > 6 && <li>e mais {conflitos.length - 6}…</li>}
                  </ul>
                </section>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
              {erro && (
                <p role="alert" className="mr-auto text-sm text-danger">
                  {erro}
                </p>
              )}
              <button type="button" onClick={aoFechar} className={botaoSecundario}>
                Cancelar
              </button>
              <button type="submit" disabled={!podeSalvar} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50">
                {salvando
                  ? "Salvando…"
                  : edicao
                    ? quantidadeNaEdicao(edicao, alcance) > 1
                      ? `Salvar ${quantidadeNaEdicao(edicao, alcance)} atendimentos`
                      : "Salvar alterações"
                    : datas.length > 1
                      ? `Salvar ${datas.length} atendimentos`
                      : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );
}

// Base sem largura, para campos pequenos definirem a sua; "entrada" ocupa a linha toda.
const entradaBase =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
const entrada = `w-full ${entradaBase}`;
const botaoSecundario = "shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]";

function Campo({ rotulo, id, children }: { rotulo: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold tracking-wide text-muted uppercase">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

type PreviaProps = {
  datas: string[];
  puladas: string[];
  especiais: Record<string, DiaEspecial[]>;
  comConflito: Set<string>;
  semDataFinal: boolean;
};

function PreviaDaSerie({ datas, puladas, especiais, comConflito, semDataFinal }: PreviaProps) {
  if (semDataFinal) return <p className="text-xs text-muted">Escolha a data final ou o número de sessões.</p>;
  if (datas.length === 0) return <p className="text-xs text-danger">Nenhuma data: a data final é anterior ao início.</p>;
  const visiveis = datas.slice(0, 16);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted">
        {datas.length} atendimento{datas.length === 1 ? "" : "s"}: {dataCurta(datas[0])} até {dataCurta(datas.at(-1)!)}
        {datas.length >= MAXIMO_DE_SESSOES && ` (limite de ${MAXIMO_DE_SESSOES})`}
      </p>
      <ul className="flex flex-wrap gap-1" aria-label="Datas da série">
        {visiveis.map((d) => (
          <li
            key={d}
            className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${comConflito.has(d) ? "bg-amber-100 text-amber-900" : "bg-surface ring-1 ring-black/5"}`}
            title={comConflito.has(d) ? "Há conflito nesta data" : undefined}
          >
            {dataCurta(d)}
          </li>
        ))}
        {datas.length > visiveis.length && <li className="px-1 text-[11px] text-muted">+{datas.length - visiveis.length}</li>}
      </ul>
      {puladas.length > 0 && (
        <p className="text-xs text-amber-800" aria-label="Datas puladas">
          Pulada{puladas.length === 1 ? "" : "s"}:{" "}
          {puladas.map((d) => `${dataCurta(d)} (${especiais[d]?.[0]?.nome ?? "feriado"})`).join(", ")}
        </p>
      )}
    </div>
  );
}

type PacienteCriado = OpcoesDoFormulario["pacientes"][number];

function CadastroRapido({
  nomeInicial,
  planos,
  aoCancelar,
  aoCriar,
}: {
  nomeInicial: string;
  planos: OpcoesDoFormulario["planos"];
  aoCancelar: () => void;
  aoCriar: (p: PacienteCriado) => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [responsavel, setResponsavel] = useState("");
  const [celular, setCelular] = useState("");
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await criarPaciente({ nome, responsavel, celular, planoId }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoCriar(r.paciente);
  }

  return (
    <div role="group" aria-label="Novo paciente" className="mt-1 flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4">
      <p className="text-sm font-medium">Novo paciente</p>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" aria-label="Nome do paciente" className={entrada} />
      <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável (opcional)" aria-label="Responsável" className={entrada} />
      <div className="grid grid-cols-2 gap-2">
        <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="Celular" inputMode="tel" aria-label="Celular" className={entrada} />
        <select value={planoId ?? ""} onChange={(e) => setPlanoId(e.target.value || null)} aria-label="Plano do paciente" className={entrada}>
          <option value="">Plano…</option>
          {planos.filter((p) => p.ativo).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Cancelar
        </button>
        <button type="button" onClick={() => void salvar()} disabled={salvando || nome.trim().length < 3} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {salvando ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
    </div>
  );
}

/** Quantos atendimentos uma edição atinge, conforme o alcance escolhido. */
function quantidadeNaEdicao(edicao: DadosEdicao, alcance: Alcance): number {
  if (!edicao.serie || alcance === "este") return 1;
  return alcance === "seguintes" ? edicao.serie.seguintes : edicao.serie.total;
}

function AlcanceDaEdicao({ serie, valor, aoMudar }: { serie: DadosEdicao["serie"]; valor: Alcance; aoMudar: (a: Alcance) => void }) {
  if (!serie || serie.total <= 1) return null;
  const opcoes: [Alcance, string][] = [
    ["este", "Só este atendimento"],
    ["seguintes", `Este e os próximos (${serie.seguintes})`],
    ["todos", `Todos da série (${serie.total})`],
  ];
  return (
    <fieldset className="flex flex-col gap-1.5 rounded-2xl bg-black/[0.03] p-4 text-sm">
      <legend className="sr-only">Aplicar a</legend>
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Este atendimento faz parte de uma série. Aplicar a:</p>
      {opcoes.map(([v, rotulo]) => (
        <label key={v} className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="alcance-edicao" checked={valor === v} onChange={() => aoMudar(v)} className="accent-[var(--accent)]" />
          {rotulo}
        </label>
      ))}
      {valor !== "este" && (
        <p className="mt-1 text-xs text-muted">Data e horário são deslocados igualmente em todos (ex.: de terça 10:30 para quinta 14:00).</p>
      )}
    </fieldset>
  );
}

type BuscaProps = {
  pronta: boolean;
  criterio: BuscaDeHorarios;
  nomeDoProfissional: (id: string) => string;
  escolhido: { data: string; hora: string };
  aoEscolher: (s: HorarioSugerido) => void;
};

/** Busca de horários livres (depois de definidos tipo e duração). */
function BuscaDeHorariosLivres({ pronta, criterio, nomeDoProfissional, escolhido, aoEscolher }: BuscaProps) {
  const [estado, setEstado] = useState<
    { tipo: "ocioso" } | { tipo: "buscando" } | { tipo: "pronto"; sugestoes: HorarioSugerido[]; ate: string; chave: string } | { tipo: "erro" }
  >({ tipo: "ocioso" });
  const chave = JSON.stringify(criterio);

  async function buscar() {
    setEstado({ tipo: "buscando" });
    try {
      const r = await buscarHorariosLivres(criterio);
      setEstado({ tipo: "pronto", ...r, chave });
    } catch {
      setEstado({ tipo: "erro" });
    }
  }

  const porDia = new Map<string, HorarioSugerido[]>();
  if (estado.tipo === "pronto") for (const s of estado.sugestoes) porDia.set(s.data, [...(porDia.get(s.data) ?? []), s]);
  const alternativas = criterio.profissionais.length === 0;

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4" aria-label="Horários livres">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Horários livres</p>
        <button
          type="button"
          disabled={!pronta || estado.tipo === "buscando"}
          onClick={() => void buscar()}
          className="rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-black/10 hover:bg-background disabled:opacity-50"
        >
          {estado.tipo === "buscando" ? "Buscando…" : estado.tipo === "pronto" ? "Buscar de novo" : "Buscar horários livres"}
        </button>
      </div>
      {!pronta && <p className="text-xs text-muted">Escolha o tipo e a duração para buscar.</p>}
      {estado.tipo === "erro" && <p className="text-xs text-danger">Não foi possível buscar agora.</p>}
      {estado.tipo === "pronto" && (
        <>
          {estado.chave !== chave && <p className="text-xs text-amber-800">Os critérios mudaram — busque de novo para atualizar.</p>}
          {estado.sugestoes.length === 0 ? (
            <p className="text-xs text-muted">Nenhum horário livre até {dataCurta(estado.ate)}.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Sugestões de horário">
              {[...porDia].map(([dia, lista]) => (
                <li key={dia} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted capitalize">{dataCurta(dia)}</span>
                  <div className="flex flex-wrap gap-1">
                    {lista.map((s) => {
                      const ativo = s.data === escolhido.data && s.hora === escolhido.hora;
                      return (
                        <button
                          key={`${s.hora}${s.profissionalIds.join()}`}
                          type="button"
                          onClick={() => aoEscolher(s)}
                          aria-pressed={ativo}
                          className={`rounded-lg px-2 py-1 text-xs tabular-nums ${ativo ? "bg-accent text-white" : "bg-surface ring-1 ring-black/10 hover:ring-accent"}`}
                        >
                          {s.hora}
                          {alternativas && ` · ${s.profissionalIds.map(nomeDoProfissional).join(", ")}`}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted">
            Próximas 2 semanas, dias úteis, sem feriados e recessos. Expediente padrão (08–12 e 13–18) até as jornadas de cada
            profissional serem cadastradas.
          </p>
        </>
      )}
    </section>
  );
}
