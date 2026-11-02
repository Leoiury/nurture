"use client";

// Pasta onde os arquivos exportados são salvos, escolhida uma vez em Configurações. Só
// no Chrome e no Edge; nos demais navegadores, ou sem permissão, vira um download comum.
// Fica neste navegador (IndexedDB): o navegador não deixa guardar o caminho no servidor.

const BANCO = "nurture-arquivos";
const LOJA = "pastas";
const CHAVE = "exportacao";

type Permissao = "granted" | "denied" | "prompt";
type PastaDoNavegador = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<Permissao>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<Permissao>;
};

export const escolherPastaDisponivel = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function naLoja<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrirBanco();
  return new Promise((resolver, rejeitar) => {
    const pedido = acao(banco.transaction(LOJA, modo).objectStore(LOJA));
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

export async function lerPasta(): Promise<PastaDoNavegador | null> {
  try {
    return (await naLoja<PastaDoNavegador | undefined>("readonly", (l) => l.get(CHAVE))) ?? null;
  } catch {
    return null; // armazenamento bloqueado: segue como download comum
  }
}

/** Abre a janela de escolha. Devolve o nome da pasta, ou null se a pessoa cancelar. */
export async function escolherPasta(): Promise<string | null> {
  // Chamado como método de window: destacado dele, o navegador recusa.
  const janela = window as unknown as { showDirectoryPicker: (o: { mode: "readwrite" }) => Promise<PastaDoNavegador> };
  try {
    const pasta = await janela.showDirectoryPicker({ mode: "readwrite" });
    await naLoja("readwrite", (l) => l.put(pasta, CHAVE));
    return pasta.name;
  } catch {
    return null;
  }
}

export async function esquecerPasta(): Promise<void> {
  await naLoja("readwrite", (l) => l.delete(CHAVE)).catch(() => null);
}

/**
 * A pasta, se puder ser usada agora. Chamar logo no clique: pedir a permissão de novo
 * só funciona como resposta direta a um gesto da pessoa.
 */
export async function pastaLiberada(): Promise<PastaDoNavegador | null> {
  const pasta = await lerPasta();
  if (!pasta) return null;
  try {
    if (!pasta.queryPermission) return pasta;
    if ((await pasta.queryPermission({ mode: "readwrite" })) === "granted") return pasta;
    return (await pasta.requestPermission?.({ mode: "readwrite" })) === "granted" ? pasta : null;
  } catch {
    return null;
  }
}

/** Grava na pasta, ou baixa. Devolve a frase para mostrar à pessoa. */
export async function salvarArquivo(arquivo: Blob, nome: string, pasta: PastaDoNavegador | null): Promise<string> {
  if (pasta) {
    try {
      const destino = await pasta.getFileHandle(nome, { create: true });
      const escrita = await destino.createWritable();
      await escrita.write(arquivo);
      await escrita.close();
      return `Salvo em ${pasta.name}: ${nome}`;
    } catch {
      // Pasta removida, sem espaço ou sem permissão: não perde o arquivo.
    }
  }
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `Baixado: ${nome}`;
}
