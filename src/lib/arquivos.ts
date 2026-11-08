// Arquivos do paciente: regras sem dependência de servidor, usadas também no navegador.

export const BUCKET_DE_ARQUIVOS = "arquivos-pacientes";
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const JPEG = { mime: "image/jpeg", assinatura: [0xff, 0xd8, 0xff] };

// null: qualquer byte (o tamanho, no começo do WebP).
const TIPOS: Record<string, { mime: string; assinatura: (number | null)[] }> = {
  pdf: { mime: "application/pdf", assinatura: [0x25, 0x50, 0x44, 0x46] },
  doc: { mime: "application/msword", assinatura: [0xd0, 0xcf, 0x11, 0xe0] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", assinatura: [0x50, 0x4b, 0x03, 0x04] },
  jpg: JPEG,
  jpeg: JPEG,
  png: { mime: "image/png", assinatura: [0x89, 0x50, 0x4e, 0x47] },
  webp: { mime: "image/webp", assinatura: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
};

export const EXTENSOES_ACEITAS = Object.keys(TIPOS).map((e) => `.${e}`).join(",");

/** Quantos bytes do começo do arquivo bastam para conferir o tipo. */
export const BYTES_DA_ASSINATURA = Math.max(...Object.values(TIPOS).map((t) => t.assinatura.length));

export const extensaoDoArquivo = (nome: string) => nome.split(".").pop()?.toLowerCase() ?? "";

export const mimeDoArquivo = (nome: string) => TIPOS[extensaoDoArquivo(nome)]?.mime ?? null;

export const ehPdf = (mime: string) => mime === TIPOS.pdf.mime;

export const ehImagem = (mime: string) => mime.startsWith("image/");

/** PDF e imagens abrem no navegador; Word baixa. */
export const abreNoNavegador = (mime: string) => ehPdf(mime) || ehImagem(mime);

export const rotuloDoTipo = (mime: string) => (ehPdf(mime) ? "PDF" : ehImagem(mime) ? "Imagem" : "Word");

/** O que impede o envio, ou null. Confere o começo do arquivo: a extensão sozinha engana. */
export function problemaNoArquivo(nome: string, tamanho: number, primeirosBytes: Uint8Array): string | null {
  const tipo = TIPOS[extensaoDoArquivo(nome)];
  if (!tipo || !nome.includes(".")) return "Envie apenas PDF, Word ou imagem (.pdf, .doc, .docx, .jpg, .png, .webp).";
  if (nome.length > 200) return "O nome do arquivo é longo demais.";
  if (tamanho === 0) return "O arquivo está vazio.";
  if (tamanho > TAMANHO_MAXIMO) return "O arquivo passa de 20 MB.";
  if (tipo.assinatura.some((byte, i) => byte !== null && primeirosBytes[i] !== byte)) return "O conteúdo não confere com a extensão do arquivo.";
  return null;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
