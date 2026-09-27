import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// Trava de segurança: os testes de navegador só rodam contra o Supabase LOCAL
// (dados fictícios). Sem o .env.development.local apontando para 127.0.0.1, o
// `npm run dev` usaria o banco de produção.
const envLocal = ".env.development.local";
if (!CI && !(existsSync(envLocal) && /NEXT_PUBLIC_SUPABASE_URL=http:\/\/(127\.0\.0\.1|localhost)/.test(readFileSync(envLocal, "utf8")))) {
  throw new Error("Testes e2e exigem o Supabase local. Rode `npm run db:local` antes (precisa do Docker Desktop aberto).");
}

const SESSAO = "tests/e2e/.auth/usuario.json";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    // Faz login uma vez e guarda a sessão para os demais testes.
    { name: "login", testMatch: /autenticar\.setup\.ts/ },
    {
      name: "agenda",
      testIgnore: /(autenticar\.setup|sem-login\.spec)\.ts/,
      dependencies: ["login"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: SESSAO },
    },
    { name: "sem-login", testMatch: /sem-login\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
