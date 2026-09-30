import "server-only";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type Perfil = Database["public"]["Enums"]["perfil_usuario"];

export type UsuarioAtual = {
  id: string;
  email: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
  profissionalId: string | null;
};

/** O usuário logado e seu perfil (tabela usuarios). Uma consulta por requisição. */
export const usuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) return null;
  const { data: u } = await supabase.from("usuarios").select("id, email, nome, perfil, ativo, profissional_id").eq("id", id).maybeSingle();
  if (!u) {
    // Login sem linha em usuarios (não deveria acontecer): acesso limitado.
    return { id, email: String(data.claims.email ?? ""), nome: String(data.claims.email ?? ""), perfil: "limitado", ativo: true, profissionalId: null };
  }
  return { id: u.id, email: u.email, nome: u.nome, perfil: u.perfil, ativo: u.ativo, profissionalId: u.profissional_id };
});

export async function ehAdm(): Promise<boolean> {
  const u = await usuarioAtual();
  return !!u && u.ativo && u.perfil === "adm";
}
