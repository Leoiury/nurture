import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente com a secret key: ignora o RLS e administra os logins (criar usuário,
 * trocar senha, bloquear). Só no servidor, e só depois de conferir que quem
 * pediu é ADM.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  return createSupabaseClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
