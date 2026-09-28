// Destaque de feriados, pontos facultativos e recessos na agenda.

import { ROTULO_TIPO_DIA, semExpediente, type DiaEspecial } from "@/lib/agenda/feriados";

/** "Feriado · Natal" — o primeiro da lista é o mais restritivo; os demais vão no tooltip. */
export function EtiquetaDiaEspecial({ dias, compacta = false }: { dias: DiaEspecial[] | undefined; compacta?: boolean }) {
  if (!dias?.length) return null;
  const [principal] = dias;
  const titulo = dias.map((d) => `${ROTULO_TIPO_DIA[d.tipo]}: ${d.nome}`).join(" · ");
  return (
    <span
      title={titulo}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-full bg-amber-100 px-2 py-px font-medium text-amber-900 ${
        compacta ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <span className="truncate">{compacta ? principal.nome : `${ROTULO_TIPO_DIA[principal.tipo]} · ${principal.nome}`}</span>
    </span>
  );
}

/** Fundo hachurado leve para dias sem expediente (feriado ou recesso); atendimentos continuam visíveis. */
export function FundoSemExpediente({ dias }: { dias: DiaEspecial[] | undefined }) {
  if (!semExpediente(dias)) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(217,119,6,0.06) 0 6px, transparent 6px 14px)" }}
    />
  );
}

/** Tom do cabeçalho de um dia especial. */
export function fundoDoCabecalho(dias: DiaEspecial[] | undefined): string | undefined {
  return dias?.length ? "color-mix(in srgb, #fef3c7 70%, white)" : undefined;
}
