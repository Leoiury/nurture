import { expect, test as setup } from "@playwright/test";
import usuario from "./usuario-teste.json" with { type: "json" };

setup("login do usuário de teste", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(usuario.email);
  await page.getByLabel("Senha").fill(usuario.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  await page.context().storageState({ path: "tests/e2e/.auth/usuario.json" });
});
