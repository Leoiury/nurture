"use client";

// Guarda um texto sozinho enquanto se digita, e ao sair da página. Uma gravação por
// vez, na ordem: duas ao mesmo tempo poderiam chegar invertidas e sobrescrever o texto
// mais novo. O que mudar durante uma gravação entra logo depois dela.

import { useCallback, useEffect, useRef, useState } from "react";

const ESPERA = 800;

export type SituacaoDoTexto = "guardado" | "guardando" | "erro";

export function useGuardarSozinho<T>(valorInicial: T, gravar: (valor: T) => Promise<{ ok: boolean }>) {
  const [situacao, setSituacao] = useState<SituacaoDoTexto>("guardado");
  const atual = useRef(valorInicial);
  const pendente = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emAndamento = useRef<Promise<void> | null>(null);
  const gravarAtual = useRef(gravar);
  useEffect(() => {
    gravarAtual.current = gravar;
  }, [gravar]);

  const guardarAgora = useCallback((): Promise<void> => {
    const rodar = (): Promise<void> => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = null;
      if (emAndamento.current || !pendente.current) return emAndamento.current ?? Promise.resolve();
      pendente.current = false;
      setSituacao("guardando");
      const gravacao = gravarAtual.current(atual.current)
        .catch(() => ({ ok: false }))
        .then((r) => {
          emAndamento.current = null;
          if (!r.ok) {
            pendente.current = true; // tenta de novo na próxima mudança ou ao sair
            return setSituacao("erro");
          }
          // Só está guardado quando não sobrou nada para gravar.
          if (pendente.current) return rodar();
          setSituacao("guardado");
        });
      emAndamento.current = gravacao;
      return gravacao;
    };
    return rodar();
  }, []);

  const mudou = useCallback(
    (valor: T) => {
      atual.current = valor;
      pendente.current = true;
      setSituacao("guardando");
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void guardarAgora(), ESPERA);
    },
    [guardarAgora],
  );

  /** Para de guardar (antes de salvar ou descartar) e espera a gravação em andamento. */
  const parar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    pendente.current = false;
    await emAndamento.current;
  }, []);

  /** Volta a guardar depois de um salvamento que falhou. */
  const retomar = useCallback(() => {
    pendente.current = true;
  }, []);

  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") void guardarAgora();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      void guardarAgora();
    };
  }, [guardarAgora]);

  // Grava o estado de partida (registro novo ou com as perguntas sincronizadas).
  useEffect(() => {
    pendente.current = true;
    void guardarAgora();
  }, [guardarAgora]);

  return { situacao, mudou, guardarAgora, parar, retomar, atual };
}
