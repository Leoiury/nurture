"use server";

import { revalidatePath } from "next/cache";
import { ehDataValida } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";

export type DadosDoPaciente = {
  id: string;
  nome: string;
  responsavel: string;
  dataNascimento: string; // AAAA-MM-DD ou vazio
  cpf: string;
  celular: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  planoId: string | null;
  ativo: boolean;
};

type Resultado = { ok: true } | { ok: false; erro: string };

const vazioParaNulo = (s: string) => s.trim().replace(/\s+/g, " ") || null;

export async function atualizarPaciente(p: DadosDoPaciente): Promise<Resultado> {
  const nome = p.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false, erro: "Informe o nome completo." };
  if (p.dataNascimento && !ehDataValida(p.dataNascimento)) return { ok: false, erro: "Data de nascimento inválida." };
  const cpf = p.cpf.replace(/\D/g, "");
  if (cpf && cpf.length !== 11) return { ok: false, erro: "O CPF deve ter 11 dígitos." };
  const email = p.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
  const uf = p.uf.trim().toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: "UF deve ter 2 letras." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pacientes")
    .update({
      nome,
      responsavel: vazioParaNulo(p.responsavel),
      data_nascimento: p.dataNascimento || null,
      cpf: cpf || null,
      celular: vazioParaNulo(p.celular),
      email: email || null,
      endereco: vazioParaNulo(p.endereco),
      bairro: vazioParaNulo(p.bairro),
      cidade: vazioParaNulo(p.cidade),
      uf: uf || null,
      cep: vazioParaNulo(p.cep),
      plano_id: p.planoId,
      ativo: p.ativo,
    })
    .eq("id", p.id);
  if (error) return { ok: false, erro: "Não foi possível salvar." };

  revalidatePath(`/pacientes/${p.id}`);
  revalidatePath("/pacientes");
  revalidatePath("/agenda");
  return { ok: true };
}
