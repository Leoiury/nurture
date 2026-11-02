"use client";

// Editor de texto do registro de atendimento: negrito, itálico, cor, fundo, sublinhado
// colorido, linha horizontal, listas e parágrafos. Sem fonte nem tamanho de propósito,
// e as cores vêm de uma paleta: texto colado de fora não traz outra formatação.

import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, type ReactNode } from "react";
import type { Documento } from "@/lib/atendimento/conteudo";

export const CORES_DO_TEXTO = ["#b91c1c", "#c2410c", "#15803d", "#1d4ed8", "#7e22ce"];
export const CORES_DE_FUNDO = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa"];

const naPaleta = (paleta: string[], cor: unknown) => (typeof cor === "string" && paleta.includes(cor) ? cor : null);

/** Marca com a cor em um atributo próprio; só cores da paleta chegam à tela. */
function marcaColorida(nome: string, tag: string, paleta: string[], estilo: (cor: string) => string) {
  return Mark.create({
    name: nome,
    addAttributes: () => ({ cor: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nome}`), renderHTML: () => ({}) } }),
    parseHTML: () => [{ tag: `${tag}[data-${nome}]` }],
    renderHTML({ mark, HTMLAttributes }) {
      const cor = naPaleta(paleta, mark.attrs.cor);
      return [tag, mergeAttributes(HTMLAttributes, cor ? { [`data-${nome}`]: cor, style: estilo(cor) } : {}), 0];
    },
  });
}

const CorDoTexto = marcaColorida("cor", "span", CORES_DO_TEXTO, (c) => `color:${c}`);
const FundoDoTexto = marcaColorida("fundo", "mark", CORES_DE_FUNDO, (c) => `background-color:${c};color:inherit;border-radius:2px`);

// Sublinhado comum, ou com a cor escolhida.
const Sublinhado = Mark.create({
  name: "sublinhado",
  addAttributes: () => ({ cor: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-sublinhado"), renderHTML: () => ({}) } }),
  parseHTML: () => [{ tag: "u" }],
  renderHTML({ mark, HTMLAttributes }) {
    const cor = naPaleta(CORES_DO_TEXTO, mark.attrs.cor);
    return ["u", mergeAttributes(HTMLAttributes, cor ? { "data-sublinhado": cor, style: `text-decoration-color:${cor};text-decoration-thickness:2px` } : {}), 0];
  },
  addKeyboardShortcuts() {
    return { "Mod-u": () => this.editor.commands.toggleMark(this.name) };
  },
});

const EXTENSOES = [
  StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, strike: false, link: false, underline: false }),
  CorDoTexto,
  FundoDoTexto,
  Sublinhado,
];

const ESTILO_DO_TEXTO =
  "text-sm outline-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_hr]:my-3 [&_hr]:border-border [&_strong]:font-semibold";

type EditorProps = {
  valor: Documento | null;
  rotulo: string;
  aoMudar: (doc: Documento) => void;
  aoFocar: (editor: Editor) => void;
  aoSair?: () => void;
};

export function EditorDeTexto({ valor, rotulo, aoMudar, aoFocar, aoSair }: EditorProps) {
  const editor = useEditor({
    extensions: EXTENSOES,
    content: valor ?? undefined,
    // O servidor não renderiza o editor (evita diferença na hidratação).
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": rotulo, role: "textbox", "aria-multiline": "true", class: `min-h-24 ${ESTILO_DO_TEXTO}` } },
    onUpdate: ({ editor: e }) => aoMudar(e.getJSON() as Documento),
    onFocus: ({ editor: e }) => aoFocar(e),
    onBlur: () => aoSair?.(),
  });
  return <EditorContent editor={editor} className="rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft" />;
}

/** O texto já salvo, com as mesmas regras de formatação do editor. */
export function TextoDoRegistro({ valor, rotulo }: { valor: Documento | null; rotulo: string }) {
  const editor = useEditor({
    extensions: EXTENSOES,
    content: valor ?? undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": rotulo, class: ESTILO_DO_TEXTO } },
  });
  return <EditorContent editor={editor} />;
}

/** Barra única, que age sobre o último campo em que se escreveu. */
export function BarraDeFormatacao({ editor }: { editor: Editor | null }) {
  const ativo = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrito: !!e?.isActive("bold"),
      italico: !!e?.isActive("italic"),
      sublinhado: !!e?.isActive("sublinhado"),
      marcadores: !!e?.isActive("bulletList"),
      numerada: !!e?.isActive("orderedList"),
    }),
  });
  const cadeia = () => editor?.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatação" className="flex flex-wrap items-center gap-1">
      <BotaoDaBarra rotulo="Negrito" ligado={ativo?.negrito} desativado={!editor} aoClicar={() => cadeia()?.toggleBold().run()}>
        <span className="font-bold">N</span>
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Itálico" ligado={ativo?.italico} desativado={!editor} aoClicar={() => cadeia()?.toggleItalic().run()}>
        <span className="italic">I</span>
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Sublinhado" ligado={ativo?.sublinhado} desativado={!editor} aoClicar={() => cadeia()?.toggleMark("sublinhado").run()}>
        <span className="underline">S</span>
      </BotaoDaBarra>
      <Paleta rotulo="Sublinhado colorido" cores={CORES_DO_TEXTO} desativado={!editor} aoEscolher={(cor) => (cor ? cadeia()?.setMark("sublinhado", { cor }).run() : cadeia()?.unsetMark("sublinhado").run())}>
        <span className="underline decoration-red-700 decoration-2">S</span>
      </Paleta>
      <Paleta rotulo="Cor do texto" cores={CORES_DO_TEXTO} desativado={!editor} aoEscolher={(cor) => (cor ? cadeia()?.setMark("cor", { cor }).run() : cadeia()?.unsetMark("cor").run())}>
        <span className="font-semibold text-red-700">A</span>
      </Paleta>
      <Paleta rotulo="Fundo do texto" cores={CORES_DE_FUNDO} desativado={!editor} aoEscolher={(cor) => (cor ? cadeia()?.setMark("fundo", { cor }).run() : cadeia()?.unsetMark("fundo").run())}>
        <span className="rounded-sm bg-yellow-200 px-1">A</span>
      </Paleta>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <BotaoDaBarra rotulo="Lista com marcadores" ligado={ativo?.marcadores} desativado={!editor} aoClicar={() => cadeia()?.toggleBulletList().run()}>
        •≡
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Lista numerada" ligado={ativo?.numerada} desativado={!editor} aoClicar={() => cadeia()?.toggleOrderedList().run()}>
        1≡
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Linha horizontal" desativado={!editor} aoClicar={() => cadeia()?.setHorizontalRule().run()}>
        ―
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Parágrafo" desativado={!editor} aoClicar={() => cadeia()?.splitBlock().run()}>
        ¶
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Limpar formatação" desativado={!editor} aoClicar={() => cadeia()?.unsetAllMarks().run()}>
        ⌫
      </BotaoDaBarra>
    </div>
  );
}

type BotaoProps = { rotulo: string; ligado?: boolean; desativado: boolean; aoClicar: () => void; children: ReactNode };

function BotaoDaBarra({ rotulo, ligado, desativado, aoClicar, children }: BotaoProps) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ligado}
      disabled={desativado}
      // Sem tirar o foco do texto: a seleção precisa continuar lá.
      onMouseDown={(e) => e.preventDefault()}
      onClick={aoClicar}
      className={`inline-flex size-8 items-center justify-center rounded-lg text-sm disabled:opacity-40 ${ligado ? "bg-accent-soft text-accent" : "hover:bg-black/[0.05]"}`}
    >
      {children}
    </button>
  );
}

type PaletaProps = { rotulo: string; cores: string[]; desativado: boolean; aoEscolher: (cor: string | null) => void; children: ReactNode };

function Paleta({ rotulo, cores, desativado, aoEscolher, children }: PaletaProps) {
  const [aberta, setAberta] = useState(false);
  const escolher = (cor: string | null) => {
    aoEscolher(cor);
    setAberta(false);
  };
  return (
    <span className="relative">
      <BotaoDaBarra rotulo={rotulo} ligado={aberta} desativado={desativado} aoClicar={() => setAberta(!aberta)}>
        {children}
      </BotaoDaBarra>
      {aberta && (
        <span role="group" aria-label={rotulo} className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1 rounded-xl bg-surface p-1.5 shadow-lg ring-1 ring-black/10">
          {cores.map((cor) => (
            <button key={cor} type="button" aria-label={`${rotulo}: ${cor}`} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(cor)} className="size-6 rounded-md ring-1 ring-black/10" style={{ background: cor }} />
          ))}
          <button type="button" aria-label={`${rotulo}: remover`} title="Remover" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(null)} className="size-6 rounded-md text-xs text-muted ring-1 ring-black/10">
            ✕
          </button>
        </span>
      )}
    </span>
  );
}
