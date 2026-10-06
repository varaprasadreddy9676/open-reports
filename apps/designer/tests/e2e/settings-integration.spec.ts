import { test, expect } from "@playwright/test";

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("btn-more").click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

test.describe("settings and integration guidance", () => {
  test("connection test checks authentication without saving drafts, then saves normalized settings", async ({ page }) => {
    await openSettings(page);
    await page.route("**/api/v1/templates", async (route) => {
      const key = route.request().headers()["x-api-key"];
      if (key === "valid-test-key") await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      else await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "A valid API key is required." } }) });
    });

    await page.getByTestId("settings-api-base").fill("http://127.0.0.1:3100/");
    await page.getByTestId("settings-api-key").fill("wrong-key");
    await expect(page.getByTestId("settings-api-key")).toHaveAttribute("type", "password");
    await page.getByTestId("settings-toggle-key").click();
    await expect(page.getByTestId("settings-api-key")).toHaveAttribute("type", "text");
    await page.getByTestId("settings-toggle-key").click();
    await page.getByTestId("settings-test-connection").click();
    await expect(page.getByTestId("settings-connection-status")).toContainText("was not accepted");
    expect(await page.evaluate(() => localStorage.getItem("designer.apiKey"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("designer.apiBase"))).toBeNull();

    await page.getByTestId("settings-api-key").fill("valid-test-key");
    await page.getByTestId("settings-test-connection").click();
    await expect(page.getByTestId("settings-connection-status")).toContainText("Connected");
    await page.getByTestId("settings-save").click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("designer.apiBase"))).toBe("http://127.0.0.1:3100");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("designer.apiKey"))).toBe("valid-test-key");
  });

  test("rejects invalid server URLs before sending a request", async ({ page }) => {
    await openSettings(page);
    let requestCount = 0;
    await page.route("**/api/v1/templates", async (route) => {
      requestCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.getByTestId("settings-api-base").fill("ftp://reports.example.com");
    await page.getByTestId("settings-test-connection").click();
    await expect(page.getByTestId("settings-connection-status")).toContainText("Enter a valid server URL");
    expect(requestCount).toBe(0);
  });

  test("integration guide provides backend examples and safe-key guidance", async ({ page, context }) => {
    await openSettings(page);
    await page.getByTestId("settings-tab-integrate").click();
    await expect(page.getByRole("tabpanel", { name: "Integration guide" })).toContainText("Your application keeps login, permissions, and business rules");
    await expect(page.getByRole("tabpanel", { name: "Integration guide" })).toContainText("Keep your API key on the server");
    await expect(page.getByRole("tabpanel", { name: "Integration guide" })).toContainText("data.client.logoUrl");
    await expect(page.getByRole("tabpanel", { name: "Integration guide" })).toContainText("data.client.footerText");
    await expect(page.locator(".integration-code")).toContainText("authorizedInvoice");

    await page.getByTestId("settings-example-node").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("settings-example-java")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".integration-code")).toContainText("HttpClient.newHttpClient");
    await page.getByTestId("settings-example-python").click();
    await expect(page.locator(".integration-code")).toContainText("requests.post");
    await page.getByTestId("settings-example-curl").click();
    await expect(page.locator(".integration-code")).toContainText("curl -X POST");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("settings-copy-example").click();
    await expect(page.getByTestId("settings-copy-example")).toHaveText("Copied");
    await expect(page.getByRole("link", { name: "REST API reference ↗" })).toHaveAttribute("href", /docs\/API\.md/);
  });

  test("preferences tab retains the appearance selector", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("settings-tab-preferences").click();
    await expect(page.getByLabel("Interface appearance")).toBeVisible();
    await page.getByLabel("Interface appearance").selectOption("light");
  });
});
