import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Só testes unitários; os de navegador (tests/e2e) rodam com o Playwright.
    include: ["src/**/*.test.ts"],
    environment: "node",
    // O servidor da Vercel roda em UTC: os testes também, para pegar erros de fuso.
    env: { TZ: "UTC" },
  },
});
