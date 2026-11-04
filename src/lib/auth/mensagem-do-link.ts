// A mensagem que o ADM envia com o link de criar login ou de redefinir senha.

export type TipoDeLink = "login" | "senha";

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export function mensagemDoLink(tipo: TipoDeLink, nome: string, link: string, expiraEm: string) {
  const fim = new Date(expiraEm);
  if (tipo === "senha") {
    return `Olá, ${nome}! Para redefinir a sua senha de acesso à agenda da clínica, abra o link e escolha uma senha nova:\n\n${link}\n\nO link é só seu: não o repasse. Ele funciona uma única vez e vale até ${data.format(fim)} às ${hora.format(fim)}. Se você não pediu isso, avise a clínica.`;
  }
  return `Olá, ${nome}! Seu acesso à agenda da clínica já pode ser criado. Abra o link, confirme seu nome e escolha seu nome de usuário e sua senha:\n\n${link}\n\nO link é só seu: não o repasse. Ele funciona uma única vez e vale até ${data.format(fim)}.`;
}

/** O endereço que abre o WhatsApp com a mensagem pronta; null se o celular não servir. */
export function linkDoWhatsApp(celular: string | null, mensagem: string): string | null {
  const digitos = (celular ?? "").replace(/\D/g, "");
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (numero.length < 12 || numero.length > 13) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
