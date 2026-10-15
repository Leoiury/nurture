import { describe, expect, it } from "vitest";
import { credenciaisDoLoginAutomatico } from "./login-automatico";

describe("credenciaisDoLoginAutomatico", () => {
  const local = {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    LOGIN_AUTOMATICO_EMAIL: "teste@nurture.local",
    LOGIN_AUTOMATICO_SENHA: "x",
  };

  it("liga só no next dev, com o Supabase local e as credenciais", () => {
    expect(credenciaisDoLoginAutomatico(local)).toEqual({ email: "teste@nurture.local", senha: "x" });
    expect(credenciaisDoLoginAutomatico({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).not.toBeNull();
  });

  it("nunca na produção nem com o banco de verdade", () => {
    expect(credenciaisDoLoginAutomatico({ ...local, NODE_ENV: "production" })).toBeNull();
    expect(credenciaisDoLoginAutomatico({ ...local, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBeNull();
    expect(credenciaisDoLoginAutomatico({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1.evil.com" })).toBeNull();
    expect(credenciaisDoLoginAutomatico({ ...local, LOGIN_AUTOMATICO_SENHA: undefined })).toBeNull();
  });
});
