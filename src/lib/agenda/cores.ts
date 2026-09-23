// Paleta de cores dos planos (cor do card na agenda). A tela de criação/edição
// de planos oferece apenas estas opções, para manter a agenda legível.

export const PALETA_PLANOS = [
  { nome: "Azul", hex: "#4A90D9" },
  { nome: "Azul claro", hex: "#A7C7E7" },
  { nome: "Verde escuro", hex: "#2E7D5B" },
  { nome: "Verde claro", hex: "#A8DDB5" },
  { nome: "Turquesa", hex: "#7FD1C7" },
  { nome: "Amarelo", hex: "#F6D365" },
  { nome: "Laranja", hex: "#F4A261" },
  { nome: "Vermelho", hex: "#D9534F" },
  { nome: "Vermelho claro", hex: "#F2A19D" },
  { nome: "Rosa", hex: "#F2A7C3" },
  { nome: "Roxo", hex: "#B39DDB" },
  { nome: "Marrom", hex: "#B08968" },
  { nome: "Cinza", hex: "#D0D3D4" },
] as const;

export const TEXTO_ESCURO = "#1f2421";
export const TEXTO_CLARO = "#ffffff";

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor de texto (escura ou branca) com maior contraste sobre o fundo informado. */
export function corDoTexto(fundo: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(fundo)) return TEXTO_ESCURO;
  const l = luminancia(fundo);
  const contrasteEscuro = (l + 0.05) / (luminancia(TEXTO_ESCURO) + 0.05);
  const contrasteClaro = 1.05 / (l + 0.05);
  return contrasteEscuro >= contrasteClaro ? TEXTO_ESCURO : TEXTO_CLARO;
}
