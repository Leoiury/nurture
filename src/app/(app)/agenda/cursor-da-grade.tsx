"use client";

// Horário selecionado na grade, para usar a agenda pelo teclado: as setas movem a
// seleção, N marca ali, Enter abre o card do horário, Ctrl+C copia e Ctrl+V cola.
// As colunas registram os trechos de horário delas (para pular as faixas compactadas).

import { createContext, useContext } from "react";
import type { Segmento } from "@/lib/agenda/layout";

export type Cursor = { dia: string; profissionalId: string; minuto: number };

type Contexto = {
  cursor: Cursor | null;
  selecionar: (c: Cursor) => void;
  registrar: (chave: string, segmentos: Segmento[] | null) => void;
};

const ContextoDoCursor = createContext<Contexto>({ cursor: null, selecionar: () => {}, registrar: () => {} });

export const ProvedorDoCursor = ContextoDoCursor.Provider;

export function useCursorDaGrade() {
  return useContext(ContextoDoCursor);
}

export const DICA_DO_CURSOR = "Horário selecionado: aperte N (ou segure Shift e clique) para marcar aqui, Ctrl+V cola um atendimento copiado e as setas mudam o horário.";
