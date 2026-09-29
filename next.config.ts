import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Importar agenda: relatórios .xlsx de vários meses passam do 1MB padrão
      // (o limite de requisição da Vercel é 4,5MB).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
