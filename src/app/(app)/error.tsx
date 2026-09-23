"use client";

import { useEffect } from "react";

export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Não foi possível carregar esta página</h2>
      <p className="max-w-sm text-sm text-muted">
        Pode ter sido uma falha momentânea de conexão. Tente de novo; se continuar, recarregue a página.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Tentar novamente
      </button>
    </div>
  );
}
