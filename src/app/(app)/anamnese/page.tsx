import type { Metadata } from "next";
import { usuarioAtual } from "@/lib/auth/usuario";
import { opcoesDoFormulario } from "../agenda/actions-novo-atendimento";
import { EscolherPaciente } from "./escolher-paciente";

export const metadata: Metadata = { title: "Anamnese · Nurture" };

export default async function AnamnesePage({ searchParams }: PageProps<"/anamnese">) {
  const { paciente, atendimento } = await searchParams;
  const ehId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  const [opcoes, eu] = await Promise.all([opcoesDoFormulario(), usuarioAtual()]);
  return (
    <EscolherPaciente
      pacientes={opcoes.pacientes}
      planos={opcoes.planos}
      pacienteInicial={ehId(paciente) ? paciente : null}
      atendimentoInicial={ehId(atendimento) ? atendimento : null}
      comModelo={!!eu?.profissionalId}
    />
  );
}
