import { expect, test } from "@playwright/test";
import usuario from "./usuario-teste.json" with { type: "json" };

test("sem sessão, a agenda redireciona para o login", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/login$/);
});

test("senha errada mostra erro e mantém o e-mail preenchido", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(usuario.email);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page.getByLabel("E-mail")).toHaveValue(usuario.email);

  // Segunda tentativa sem redigitar o e-mail.
  await page.getByLabel("Senha").fill(usuario.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
});
