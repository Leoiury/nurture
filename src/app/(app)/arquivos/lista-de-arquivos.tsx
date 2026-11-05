"use client";

// Lista e envio de arquivos do paciente. O envio vai direto ao Storage: o limite das
// Server Actions é bem menor que o de um arquivo.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BUCKET_DE_ARQUIVOS, EXTENSOES_ACEITAS, ehPdf, extensaoDoArquivo, formatarTamanho, mimeDoArquivo, problemaNoArquivo } from "@/lib/arquivos";
import { FUSO } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/client";
import { excluirArquivo, registrarArquivo } from "./actions";
import type { ArquivoDoPaciente } from "./dados";

const dataBr = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

type Props = {
  pacienteId: string;
  /** Na tela de atendimento: o que for enviado fica ligado a ele. */
  atendimentoId?: string;
  arquivos: ArquivoDoPaciente[];
};

export function ListaDeArquivos({ pacienteId, atendimentoId, arquivos }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  async function enviarUm(arquivo: File): Promise<string | null> {
    const primeiros = new Uint8Array(await arquivo.slice(0, 4).arrayBuffer());
    const problema = problemaNoArquivo(arquivo.name, arquivo.size, primeiros);
    if (problema) return problema;
    const caminho = `${pacienteId}/${crypto.randomUUID()}.${extensaoDoArquivo(arquivo.name)}`;
    const { error } = await createClient().storage.from(BUCKET_DE_ARQUIVOS).upload(caminho, arquivo, { contentType: mimeDoArquivo(arquivo.name)!, upsert: false });
    if (error) return "Não foi possível enviar.";
    const r = await registrarArquivo(pacienteId, atendimentoId ?? null, arquivo.name, caminho);
    return r.ok ? null : r.erro;
  }

  async function enviar(lista: File[]) {
    setErros([]);
    const novos: string[] = [];
    for (const [i, arquivo] of lista.entries()) {
      setProgresso(lista.length > 1 ? `Enviando ${i + 1} de ${lista.length}…` : "Enviando…");
      const erro = await enviarUm(arquivo).catch(() => "Falha de conexão.");
      if (erro) novos.push(`${arquivo.name}: ${erro}`);
    }
    setProgresso(null);
    setErros(novos);
    if (entrada.current) entrada.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          ref={entrada}
          type="file"
          multiple
          accept={EXTENSOES_ACEITAS}
          aria-label="Escolher arquivos"
          className="hidden"
          onChange={(e) => {
            const lista = [...(e.target.files ?? [])];
            if (lista.length) void enviar(lista);
          }}
        />
        <button type="button" disabled={!!progresso} onClick={() => entrada.current?.click()} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07] disabled:opacity-50">
          {progresso ?? "Enviar arquivo"}
        </button>
        <span className="text-xs text-muted">PDF ou Word, até 20 MB. Só você, o profissional do atendimento e os administradores veem.</span>
      </div>
      {erros.map((erro) => (
        <p key={erro} role="alert" className="text-danger">
          {erro}
        </p>
      ))}
      {arquivos.length === 0 ? (
        <p className="text-muted">Nenhum arquivo.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {arquivos.map((a) => (
            <ItemDoArquivo key={a.id} arquivo={a} pacienteId={pacienteId} atendimentoAtual={atendimentoId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDoArquivo({ arquivo: a, pacienteId, atendimentoAtual }: { arquivo: ArquivoDoPaciente; pacienteId: string; atendimentoAtual?: string }) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    setTrabalhando(true);
    const r = await excluirArquivo(a.id, pacienteId, a.atendimentoId ?? atendimentoAtual ?? null).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  return (
    <li aria-label={a.nome} className="flex flex-col gap-1 rounded-xl px-2 py-1.5 hover:bg-background">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Link comum: a rota confere o acesso a cada abertura e gera um link temporário. */}
          <a href={`/arquivos/${a.id}`} target="_blank" rel="noreferrer" className="block font-medium break-words text-accent hover:underline">
            {a.nome}
          </a>
          <p className="text-xs text-muted">
            {ehPdf(a.tipoMime) ? "PDF" : "Word"} · {formatarTamanho(a.tamanho)} · {dataBr.format(new Date(a.enviadoEm))} · {a.enviadoPor}
            {a.atendimentoId && (a.atendimentoId === atendimentoAtual ? " · neste atendimento" : (
              <>
                {" · "}
                <Link href={`/atendimento/${a.atendimentoId}`} className="hover:underline">
                  ver atendimento
                </Link>
              </>
            ))}
          </p>
        </div>
        {a.podeExcluir && !excluindo && (
          <button type="button" aria-label={`Excluir ${a.nome}`} onClick={() => setExcluindo(true)} className="shrink-0 rounded-full px-2 py-1 text-xs text-muted hover:bg-black/[0.05] hover:text-foreground">
            Excluir
          </button>
        )}
      </div>
      {excluindo && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
          <span>O arquivo deixa de aparecer para todos.</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setExcluindo(false)} className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.07]">
              Cancelar
            </button>
            <button type="button" disabled={trabalhando} onClick={() => void excluir()} className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Confirmar exclusão
            </button>
          </span>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
