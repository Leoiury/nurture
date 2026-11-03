"use client";

// Imprimir, baixar em PDF ou Word e copiar o registro de um atendimento.

import { useEffect, useRef, useState } from "react";
import type { ConteudoDoRegistro } from "@/lib/atendimento/conteudo";
import { TITULO_DO_DOCUMENTO, nomeDoArquivo, paraHtml, paraPdf, paraTexto, secoesDoRegistro, type DadosDoDocumento } from "@/lib/atendimento/exportar";
import { ITEM_DO_MENU, MenuSuspenso } from "./menu-suspenso";
import { pastaLiberada, salvarArquivo } from "./pasta-de-arquivos";

type Formato = "pdf" | "docx";

async function gerarPdf(d: DadosDoDocumento, c: ConteudoDoRegistro): Promise<Blob> {
  // Bibliotecas pesadas: só carregam quando alguém exporta.
  const [{ default: pdfMake }, { default: fontes }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.addVirtualFileSystem(fontes);
  return pdfMake.createPdf(paraPdf(d, secoesDoRegistro(c))).getBlob();
}

async function gerarWord(d: DadosDoDocumento, c: ConteudoDoRegistro): Promise<Blob> {
  const [{ Packer }, { paraWord }] = await Promise.all([import("docx"), import("@/lib/atendimento/exportar-word")]);
  return Packer.toBlob(paraWord(d, secoesDoRegistro(c)));
}

const ESTILO_DE_IMPRESSAO = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 8pt; }
  h2 { font-size: 13pt; margin: 14pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 4pt; }
  hr { border: 0; border-top: 1px solid #9ca3af; margin: 8pt 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Imprime por um quadro à parte: a página da tela, com cabeçalhos fixos, não entra. */
function imprimir(d: DadosDoDocumento, c: ConteudoDoRegistro) {
  document.querySelector("iframe[data-impressao]")?.remove();
  const quadro = document.createElement("iframe");
  quadro.setAttribute("data-impressao", "");
  quadro.setAttribute("aria-hidden", "true");
  quadro.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  quadro.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${TITULO_DO_DOCUMENTO}</title><style>${ESTILO_DE_IMPRESSAO}</style></head><body>${paraHtml(d, secoesDoRegistro(c))}</body></html>`;
  quadro.onload = () => {
    quadro.contentWindow?.focus();
    quadro.contentWindow?.print();
  };
  document.body.appendChild(quadro);
}

/** Copia com a formatação; onde o navegador não deixa, só o texto. */
async function copiar(d: DadosDoDocumento, c: ConteudoDoRegistro) {
  const secoes = secoesDoRegistro(c);
  const texto = paraTexto(d, secoes);
  if (typeof ClipboardItem === "undefined") return navigator.clipboard.writeText(texto);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([paraHtml(d, secoes)], { type: "text/html" }),
      "text/plain": new Blob([texto], { type: "text/plain" }),
    }),
  ]);
}

type Situacao = { tipo: "gerando"; formato: Formato } | { tipo: "pronto"; texto: string } | { tipo: "erro"; texto: string };

type Props = {
  dados: DadosDoDocumento;
  /** O conteúdo na hora do clique: na edição, ele muda enquanto se digita. */
  obterConteudo: () => ConteudoDoRegistro;
};

export function AcoesDeExportacao({ dados, obterConteudo }: Props) {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), []);

  function avisar(s: Situacao) {
    setSituacao(s);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setSituacao(null), 6000);
  }

  async function baixar(formato: Formato) {
    if (temporizador.current) clearTimeout(temporizador.current);
    setSituacao({ tipo: "gerando", formato });
    try {
      // Primeiro a permissão da pasta: ela precisa vir logo depois do clique.
      const pasta = await pastaLiberada();
      const conteudo = obterConteudo();
      const arquivo = formato === "pdf" ? await gerarPdf(dados, conteudo) : await gerarWord(dados, conteudo);
      avisar({ tipo: "pronto", texto: await salvarArquivo(arquivo, nomeDoArquivo(dados, formato), pasta) });
    } catch {
      avisar({ tipo: "erro", texto: `Não foi possível gerar o ${formato === "pdf" ? "PDF" : "Word"}.` });
    }
  }

  async function aoCopiar() {
    try {
      await copiar(dados, obterConteudo());
      avisar({ tipo: "pronto", texto: "Texto copiado com a formatação." });
    } catch {
      avisar({ tipo: "erro", texto: "O navegador não permitiu copiar." });
    }
  }

  const gerando = situacao?.tipo === "gerando";
  return (
    <>
      <MenuSuspenso
        rotulo="Salvar como"
        estilo="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-sm font-medium ring-1 ring-border hover:bg-background"
        conteudoDoBotao={
          <>
            Salvar como
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        }
      >
        <button type="button" role="menuitem" disabled={gerando} onClick={() => void baixar("pdf")} className={ITEM_DO_MENU}>
          PDF
        </button>
        <button type="button" role="menuitem" disabled={gerando} onClick={() => void baixar("docx")} className={ITEM_DO_MENU}>
          Word
        </button>
        <button type="button" role="menuitem" onClick={() => imprimir(dados, obterConteudo())} className={ITEM_DO_MENU}>
          Imprimir
        </button>
        <button type="button" role="menuitem" onClick={() => void aoCopiar()} className={ITEM_DO_MENU}>
          Copiar texto
        </button>
      </MenuSuspenso>
      {situacao && (
        <div role={situacao.tipo === "erro" ? "alert" : "status"} aria-label="Exportação" className="fixed top-20 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-5 py-2.5 text-sm text-white shadow-lg">
          {gerando && <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          <span className="truncate">{situacao.tipo === "gerando" ? `Gerando o ${situacao.formato === "pdf" ? "PDF" : "Word"}…` : situacao.texto}</span>
        </div>
      )}
    </>
  );
}
