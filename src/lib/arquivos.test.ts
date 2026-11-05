import { describe, expect, it } from "vitest";
import { ehPdf, formatarTamanho, mimeDoArquivo, problemaNoArquivo, TAMANHO_MAXIMO } from "./arquivos";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const DOC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);

describe("arquivos do paciente", () => {
  it("aceita PDF e Word, pelo começo do arquivo", () => {
    expect(problemaNoArquivo("laudo.pdf", 10, PDF)).toBeNull();
    expect(problemaNoArquivo("Laudo.PDF", 10, PDF)).toBeNull();
    expect(problemaNoArquivo("relatorio.docx", 10, DOCX)).toBeNull();
    expect(problemaNoArquivo("antigo.doc", 10, DOC)).toBeNull();
  });

  it("recusa outros tipos e extensão trocada", () => {
    expect(problemaNoArquivo("foto.png", 10, PDF)).toContain("apenas PDF ou Word");
    expect(problemaNoArquivo("pdf", 10, PDF)).toContain("apenas PDF ou Word");
    expect(problemaNoArquivo("falso.pdf", 10, DOCX)).toContain("não confere");
    expect(problemaNoArquivo("falso.docx", 10, new Uint8Array([0x3c, 0x68]))).toContain("não confere");
  });

  it("recusa vazio, grande demais e nome longo", () => {
    expect(problemaNoArquivo("a.pdf", 0, PDF)).toContain("vazio");
    expect(problemaNoArquivo("a.pdf", TAMANHO_MAXIMO, PDF)).toBeNull();
    expect(problemaNoArquivo("a.pdf", TAMANHO_MAXIMO + 1, PDF)).toContain("20 MB");
    expect(problemaNoArquivo(`${"a".repeat(200)}.pdf`, 10, PDF)).toContain("longo");
  });

  it("tipo e tamanho para a tela", () => {
    expect(mimeDoArquivo("a.docx")).toContain("wordprocessingml");
    expect(mimeDoArquivo("a.exe")).toBeNull();
    expect(ehPdf("application/pdf")).toBe(true);
    expect(ehPdf("application/msword")).toBe(false);
    expect(formatarTamanho(200)).toBe("1 KB");
    expect(formatarTamanho(2048)).toBe("2 KB");
    expect(formatarTamanho(3 * 1024 * 1024 + 300 * 1024)).toBe("3,3 MB");
  });
});
