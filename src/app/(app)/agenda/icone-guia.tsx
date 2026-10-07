// Ícone da guia no card: documento verde com "correto" (em dia), amarelo com
// relógio (perto do fim, sem renovação) ou vermelho com exclamação (o plano exige
// guia e o atendimento não tem).

import { ROTULO_SITUACAO, type SituacaoDaGuia } from "@/lib/agenda/guias";

const COR: Record<SituacaoDaGuia, string> = {
  ok: "#15803d",
  vencendo: "#ca8a04",
  falta: "#dc2626",
};

export function IconeGuia({ situacao, tamanho = 14 }: { situacao: SituacaoDaGuia; tamanho?: number }) {
  const cor = COR[situacao];
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" fill="none" role="img" aria-label={ROTULO_SITUACAO[situacao]} data-guia={situacao}>
      <title>{ROTULO_SITUACAO[situacao]}</title>
      {/* Folha com o canto dobrado */}
      <path d="M3 2.2h6.2L12.6 5.6v8.2H3V2.2Z" fill="white" stroke={cor} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.2 2.2v3.4h3.4" stroke={cor} strokeWidth="1.1" strokeLinejoin="round" />
      {/* Selo no canto inferior direito */}
      <circle cx="11.6" cy="11.8" r="3.6" fill={cor} />
      {situacao === "ok" && <path d="m9.9 11.9 1.2 1.2 2.3-2.4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />}
      {situacao === "vencendo" && <path d="M11.6 9.9v2l1.3.8" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />}
      {situacao === "falta" && (
        <>
          <path d="M11.6 9.7v2.4" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="11.6" cy="13.7" r="0.75" fill="white" />
        </>
      )}
    </svg>
  );
}
