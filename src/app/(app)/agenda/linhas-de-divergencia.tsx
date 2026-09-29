"use client";

// Linha vermelha entre os dois cards de uma divergência (importado × marcado no
// app), desenhada sobre a coluna. As posições são medidas na tela, então vale
// para todas as visões; recalcula quando a coluna muda de tamanho.

import { useLayoutEffect, useRef, useState } from "react";
import type { Divergencia } from "@/lib/agenda/divergencias";

type Linha = { x1: number; y1: number; x2: number; y2: number; tipo: Divergencia["tipo"] };

/** Vai dentro da coluna: mede a partir do próprio elemento (a ref da coluna ainda não existe quando os filhos montam). */
export function LinhasDeDivergencia({ divergencias }: { divergencias: Divergencia[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const chave = divergencias.map((d) => `${d.importado}-${d.doApp}-${d.tipo}`).join();

  useLayoutEffect(() => {
    const raiz = svg.current?.parentElement;
    if (!raiz) return;
    const medir = () => {
      const base = raiz.getBoundingClientRect();
      const caixa = (id: string) => {
        const r = raiz.querySelector(`[data-atendimento="${id}"]`)?.getBoundingClientRect();
        return r && { esq: r.left - base.left, dir: r.right - base.left, topo: r.top - base.top, base: r.bottom - base.top };
      };
      const novas: Linha[] = [];
      for (const d of divergencias) {
        const a = caixa(d.importado);
        const b = caixa(d.doApp);
        if (!a || !b) continue;
        if (d.tipo === "horario") {
          // Da base do card de cima ao topo do de baixo, pelo meio de cada um.
          const [cima, baixo] = a.topo <= b.topo ? [a, b] : [b, a];
          novas.push({ x1: (cima.esq + cima.dir) / 2, y1: cima.base, x2: (baixo.esq + baixo.dir) / 2, y2: baixo.topo, tipo: d.tipo });
        } else {
          // Entre os dois cards lado a lado, na faixa de tempo em que se sobrepõem.
          const [esq, dir] = a.esq <= b.esq ? [a, b] : [b, a];
          const x = (Math.min(esq.dir, dir.esq) + Math.max(esq.dir, dir.esq)) / 2;
          novas.push({ x1: x, y1: Math.max(a.topo, b.topo) + 2, x2: x, y2: Math.min(a.base, b.base) - 2, tipo: d.tipo });
        }
      }
      setLinhas((atuais) => (JSON.stringify(atuais) === JSON.stringify(novas) ? atuais : novas));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(raiz);
    return () => observador.disconnect();
    // A chave resume as divergências (a lista é recriada a cada renderização).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return (
    <svg ref={svg} aria-hidden data-linhas-divergencia className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
      {linhas.map((l, i) => (
        <g key={i} className="text-red-600">
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={l.x1} cy={l.y1} r={3} fill="currentColor" />
          <circle cx={l.x2} cy={l.y2} r={3} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
