import type { Metadata } from "next";
import { usuarioAtual } from "@/lib/auth/usuario";
import { opcoesDoFormulario } from "../agenda/actions-novo-atendimento";
import { EscolherPaciente } from "./escolher-paciente";

export const metadata: Metadata = { title: "Anamnese · Nurture" };

export default async function AnamnesePage({ searchParams }: PageProps<"/anamnese">) {
  const { paciente } = await searchParams;
  const [opcoes, eu] = await Promise.all([opcoesDoFormulario(), usuarioAtual()]);
  return (
    <EscolherPaciente
      pacientes={opcoes.pacientes}
      planos={opcoes.planos}
      pacienteInicial={typeof paciente === "string" && /^[0-9a-f-]{36}$/i.test(paciente) ? paciente : null}
      comModelo={!!eu?.profissionalId}
    />
  );
}
