"use client";

// Planejamento da agenda (só ADMs): a agenda real com um rascunho de alterações
// por cima. As ações dos painéis e o arraste viram operações do rascunho, que é
// salvo a cada mudança e aplicado de uma vez (tudo ou nada) na revisão.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AtendimentoAgenda } from "@/lib/agenda/dados";
import {
  descreverCriacao,
  descreverDesmarcacao,
  descreverEdicao,
  descreverExclusao,
  descreverMovimento,
  esperadoDe,
  lerIdNovo,
  moverNovo,
  semAlteracoesDe,
  semNovo,
  simular,
  type Operacao,
} from "@/lib/agenda/planejamento";
import { formatarHora, instanteNoFuso } from "@/lib/agenda/tempo";
import type { AcoesDaAgenda } from "./acoes-da-agenda";
import { argsDeEdicao, type Resultado } from "./actions";
import { argsDeCriacao } from "./actions-novo-atendimento";
import { aplicarPlanejamento, descartarPlanejamento, salvarPlanejamento } from "./actions-planejamento";
import type { AlvoDoArraste } from "./arraste";
import { nomeAbreviado } from "./comum";

const novaChave = () => crypto.randomUUID();

export type Planejamento = ReturnType<typeof usePlanejamento>;

/**
 * Estado do rascunho. `inicial` null: fora do planejamento (o hook fica inerte).
 * `base`: os atendimentos reais carregados (a semana + os citados pelo rascunho).
 */
export function usePlanejamento(inicial: Operacao[] | null, base: AtendimentoAgenda[], nomePorId: Map<string, string>, aoErro: (texto: string) => void) {
  const ativo = inicial !== null;
  const [operacoes, setOperacoes] = useState<Operacao[]>(inicial ?? []);
  const [salvando, setSalvando] = useState(false);
  // Salva em sequência: a última versão sempre vence.
  const fila = useRef(Promise.resolve());
  const aoErroRef = useRef(aoErro);
  useEffect(() => {
    aoErroRef.current = aoErro;
  }, [aoErro]);

  const definir = useCallback((novas: Operacao[]) => {
    setOperacoes(novas);
    setSalvando(true);
    fila.current = fila.current.then(async () => {
      const r = await salvarPlanejamento(novas).catch(() => ({ ok: false as const, erro: "Falha de conexão ao salvar o planejamento." }));
      if (!r.ok) aoErroRef.current(r.erro);
      setSalvando(false);
    });
  }, []);

  const simulados = useMemo(() => (ativo ? simular(base, operacoes, nomePorId) : base), [ativo, base, operacoes, nomePorId]);
  // Referências atuais para as ações (chamadas depois de await).
  const atual = useRef({ operacoes, simulados });
  useEffect(() => {
    atual.current = { operacoes, simulados };
  }, [operacoes, simulados]);

  const nomes = useCallback((ids: string[]) => ids.map((id) => nomeAbreviado(nomePorId.get(id) ?? "")).join(", "), [nomePorId]);

  const acoes = useMemo<AcoesDaAgenda>(() => {
    const adicionar = (op: Operacao): Resultado => {
      definir([...atual.current.operacoes, op]);
      return { ok: true };
    };
    const alvo = (id: string) => atual.current.simulados.find((a) => a.id === id);
    return {
      planejamento: true,
      async criar(novo, exibicao) {
        const r = await argsDeCriacao(novo);
        if (!r.ok) return r;
        adicionar({ chave: novaChave(), tipo: "criar", args: r.args, exibicao, descricao: descreverCriacao(r.args, exibicao, nomes(r.args.p_profissionais)) });
        return { ok: true, quantidade: r.args.p_inicios.length };
      },
      async editar(e, exibicao) {
        const a = alvo(e.id);
        if (!a) return { ok: false, erro: "Atendimento fora do período carregado." };
        const r = await argsDeEdicao(e);
        if (!r.ok) return r;
        return adicionar({ chave: novaChave(), tipo: "editar", args: r.args, exibicao, esperado: esperadoDe(a), descricao: descreverEdicao(a, r.args) });
      },
      async desmarcar(id, alcance, motivo) {
        const a = alvo(id);
        if (!a) return { ok: false, erro: "Atendimento fora do período carregado." };
        if (!motivo.trim()) return { ok: false, erro: "Informe o motivo." };
        const args = { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() };
        return adicionar({ chave: novaChave(), tipo: "desmarcar", args, esperado: esperadoDe(a), descricao: descreverDesmarcacao(a, args) });
      },
      async excluir(id, alcance, motivo) {
        const a = alvo(id);
        if (!a) return { ok: false, erro: "Atendimento fora do período carregado." };
        if (!motivo.trim()) return { ok: false, erro: "A exclusão exige uma observação." };
        const args = { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() };
        return adicionar({ chave: novaChave(), tipo: "excluir", args, esperado: esperadoDe(a), descricao: descreverExclusao(a, args) });
      },
      pendencias(id) {
        const minhas = atual.current.operacoes.filter((op) => op.tipo !== "criar" && op.args.p_id === id);
        if (!minhas.length) return null;
        return { descricoes: minhas.map((op) => op.descricao), desfazer: () => definir(semAlteracoesDe(atual.current.operacoes, id)) };
      },
    };
  }, [definir, nomes]);

  /** Card solto em outro horário/coluna. Devolve a versão anterior, para desfazer. */
  const mover = useCallback(
    (a: AtendimentoAgenda, de: string, para: string, alvo: AlvoDoArraste): Operacao[] => {
      const antes = atual.current.operacoes;
      const novoInicio = instanteNoFuso(alvo.dia, formatarHora(alvo.minuto));
      if (lerIdNovo(a.id)) {
        definir(moverNovo(antes, a.id, novoInicio, de, para, novaChave()));
      } else {
        const op: Operacao = {
          chave: novaChave(),
          tipo: "mover",
          args: { p_id: a.id, p_inicio: novoInicio, p_de_profissional: de, p_para_profissional: para },
          esperado: esperadoDe(a),
          descricao: descreverMovimento(a, novoInicio, para !== de ? nomeAbreviado(nomePorId.get(para) ?? "") : null),
        };
        definir([...antes, op]);
      }
      return antes;
    },
    [definir, nomePorId],
  );

  return { ativo, operacoes, simulados, salvando, acoes, definir, mover };
}

// Faixa do topo ------------------------------------------------------------------

type FaixaProps = { planejamento: Planejamento; urlSair: string; aoAviso: (texto: string) => void };

export function FaixaDoPlanejamento({ planejamento, urlSair, aoAviso }: FaixaProps) {
  const [revisando, setRevisando] = useState(false);
  const router = useRouter();
  const n = planejamento.operacoes.length;

  async function descartar() {
    if (!confirm("Descartar todo o planejamento? As alterações do rascunho serão perdidas.")) return;
    const r = await descartarPlanejamento().catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) return aoAviso(r.erro);
    router.push(urlSair);
  }

  return (
    <div
      data-faixa-planejamento
      role="region"
      aria-label="Planejamento"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-amber-100 px-4 py-2 text-sm text-amber-950 ring-1 ring-amber-300"
    >
      <span className="font-semibold">Planejamento</span>
      <span className="text-amber-900/80">
        {n === 0 ? "Nenhuma alteração ainda: mexa na agenda à vontade." : `${n} ${n === 1 ? "alteração" : "alterações"} no rascunho`}
        {planejamento.salvando && " · salvando…"}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={n === 0}
          onClick={() => setRevisando(true)}
          className="rounded-full bg-amber-900 px-4 py-1.5 font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Revisar e aplicar
        </button>
        <button type="button" disabled={n === 0} onClick={() => void descartar()} className="rounded-full px-3 py-1.5 hover:bg-amber-200 disabled:opacity-40">
          Descartar
        </button>
        <Link href={urlSair} className="rounded-full px-3 py-1.5 hover:bg-amber-200" title="O rascunho continua salvo">
          Sair
        </Link>
      </span>
      {revisando && <DialogoDeRevisao planejamento={planejamento} aoFechar={() => setRevisando(false)} aoAviso={aoAviso} />}
    </div>
  );
}

// Revisão ------------------------------------------------------------------------

function DialogoDeRevisao({ planejamento, aoFechar, aoAviso }: { planejamento: Planejamento; aoFechar: () => void; aoAviso: (texto: string) => void }) {
  const { operacoes } = planejamento;
  const router = useRouter();
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<{ texto: string; chave?: string } | null>(null);
  const escolhidas = operacoes.filter((op) => !fora.has(op.chave));

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  async function aplicar() {
    setAplicando(true);
    setErro(null);
    const restantes = operacoes.filter((op) => fora.has(op.chave));
    const r = await aplicarPlanejamento(escolhidas, restantes).catch(() => ({ ok: false as const, erro: "Falha de conexão.", chave: undefined }));
    setAplicando(false);
    if (!r.ok) return setErro({ texto: r.erro, chave: r.chave });
    planejamento.definir(restantes);
    aoFechar();
    aoAviso(`${r.quantidade} ${r.quantidade === 1 ? "alteração aplicada" : "alterações aplicadas"} na agenda.`);
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Revisar planejamento" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface text-foreground shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Revisar e aplicar</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-muted">
            As alterações marcadas são aplicadas juntas, na ordem abaixo: se uma falhar, nenhuma é aplicada. As desmarcadas continuam no rascunho.
          </p>
          <ol className="flex flex-col gap-1.5" aria-label="Alterações do planejamento">
            {operacoes.map((op, i) => {
              const comErro = erro?.chave === op.chave;
              return (
                <li key={op.chave}>
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2 ring-1 ${comErro ? "bg-red-50 ring-red-300" : "ring-black/5 hover:bg-background"}`}
                  >
                    <input
                      type="checkbox"
                      checked={!fora.has(op.chave)}
                      onChange={(e) => {
                        const novo = new Set(fora);
                        if (e.target.checked) novo.delete(op.chave);
                        else novo.add(op.chave);
                        setFora(novo);
                      }}
                      className="mt-0.5 size-4 accent-[var(--accent)]"
                    />
                    <span className="flex-1">
                      <span className="mr-1.5 text-xs text-muted tabular-nums">{i + 1}.</span>
                      {op.descricao}
                      {comErro && <span className="mt-1 block text-xs text-danger">{erro.texto}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          {erro && !erro.chave && (
            <p role="alert" className="mr-auto text-sm text-danger">
              {erro.texto}
            </p>
          )}
          {erro?.chave && (
            <p role="alert" className="mr-auto text-sm text-danger">
              Nada foi aplicado: veja a alteração destacada.
            </p>
          )}
          <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={aplicando || escolhidas.length === 0}
            onClick={() => void aplicar()}
            className="rounded-full bg-accent px-5 py-2 font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {aplicando ? "Aplicando…" : `Aplicar ${escolhidas.length}`}
          </button>
        </div>
      </aside>
    </>
  );
}

// Atendimento criado no planejamento ----------------------------------------------

export function PainelDoNovo({ planejamento, id, aoFechar }: { planejamento: Planejamento; id: string; aoFechar: () => void }) {
  const alvo = lerIdNovo(id);
  const op = planejamento.operacoes.find((o) => o.chave === alvo?.chave);
  const a = planejamento.simulados.find((x) => x.id === id);
  const serie = op?.tipo === "criar" && op.args.p_inicios.length > 1;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const remover = (serieInteira: boolean) => {
    planejamento.definir(semNovo(planejamento.operacoes, id, serieInteira));
    aoFechar();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Novo no planejamento" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{a?.paciente ?? "Atendimento"}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-sm">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
            Criado no planejamento: ainda não existe na agenda real. Arraste o card para mudar o horário; para outras mudanças, remova e marque de novo.
          </p>
          {op && <p>{op.descricao}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => remover(false)} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07]">
              {serie ? "Remover este" : "Remover do planejamento"}
            </button>
            {serie && (
              <button type="button" onClick={() => remover(true)} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07]">
                Remover a série
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
