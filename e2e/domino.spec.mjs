import { test, expect } from "@playwright/test";

async function stubApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };

    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    if (url.includes("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ user: null, session: null })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({})
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => {
    window.DOMINO_SERVER_URL = "http://127.0.0.1:3000";
    window.localStorage?.setItem("dominoDebugLogs", "false");
  });
});

test("start screen loads and stays within mobile viewport", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#start-screen")).toHaveClass(/active/);
  await expect(page.locator("#account-btn")).toHaveClass(/start-profile-btn/);
  await expect(page.locator("#account-btn")).toHaveClass(/icon-btn/);
  await expect(page.locator("#account-btn")).toHaveAttribute("aria-label", "\u0412\u0445\u043e\u0434");
  await expect(page.locator("#account-btn")).toHaveText("");
  await expect(page.locator("#start-screen .start-topbar")).toBeVisible();
  await expect(page.locator("#start-lang-select")).toHaveCount(1);
  await expect(page.locator("#start-lang-select")).toHaveValue(/^(az|ru|en)$/);
  await expect(page.locator("#start-screen .btn-lang")).toHaveCount(0);
  await expect(page.locator("#open-online-modal-btn")).not.toHaveText("");
  await expect(page.locator("#start-coin-shop-btn")).not.toHaveText("");
  await expect(page.locator("#start-coin-shop-btn")).toHaveClass(/start-top-shop-btn/);
  await expect(page.locator("#start-cosmetics-shop-btn")).toHaveClass(/start-top-shop-btn/);
  await expect(page.locator("#start-screen .start-actions .start-shop-btn")).toHaveCount(0);
  await expect(page.locator("#account-modal-title")).toHaveText("\u0410\u043a\u043a\u0430\u0443\u043d\u0442");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test("guest start screen hides auth-only top buttons and keeps language visible", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#start-screen")).toHaveClass(/auth-required/);
  await expect(page.locator("#account-btn")).toBeHidden();
  await expect(page.locator("#start-coin-shop-btn")).toBeHidden();
  await expect(page.locator("#start-cosmetics-shop-btn")).toBeHidden();
  await expect(page.locator("#start-lang-select")).toBeVisible();

  const topbarBounds = await page.locator("#start-screen .start-topbar").boundingBox();
  expect(topbarBounds).not.toBeNull();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test("open rooms modal uses a standard title bar and close button", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => document.getElementById("open-rooms-btn")?.click());

  await expect(page.locator("#open-rooms-modal")).toHaveClass(/active/);
  await expect(page.locator("#open-rooms-modal .section-kicker")).toHaveCount(0);
  await expect(page.locator("#open-rooms-modal h2")).toHaveText(/Açıq otaqlar|Open rooms|Открытые комнаты/);
  await expect(page.locator("#open-rooms-modal-close")).toHaveText("×");
  await expect(page.locator("#open-rooms-modal-close")).toHaveAttribute("aria-label", /Bağla|Close|Закрыть/);

  await page.locator("#open-rooms-modal-close").click();
  await expect(page.locator("#open-rooms-modal")).not.toHaveClass(/active/);
});

test("closed and open rooms create flows use contextual visibility without toggle UI", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#open-online-modal-btn")).toHaveText(/Bağlı otaqlar|Private rooms|Закрытые комнаты/);
  await page.evaluate(() => document.getElementById("open-online-modal-btn")?.click());
  await expect(page.locator("#online-modal")).toHaveClass(/active/);
  await expect(page.locator("#online-modal h2")).toHaveText(/Bağlı otaqlar|Private rooms|Закрытые комнаты/);
  await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);

  await page.locator("#online-create-choice-btn").click();
  await expect(page.locator("#online-flow-ui")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);

  await page.evaluate(() => document.getElementById("online-modal-close")?.click());
  await expect(page.locator("#online-modal")).toHaveClass(/active/);
  await expect(page.locator("#online-entry-ui")).not.toHaveClass(/is-hidden/);

  await page.evaluate(() => document.getElementById("open-rooms-btn")?.click());
  await expect(page.locator("#open-rooms-modal")).toHaveClass(/active/);
  await expect(page.locator("#open-rooms-menu-ui")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#open-rooms-list-ui")).toHaveClass(/is-hidden/);
  await expect(page.locator("#open-rooms-create-btn")).toBeVisible();
  await expect(page.locator("#open-rooms-join-btn")).toBeVisible();

  await page.locator("#open-rooms-join-btn").click();
  await expect(page.locator("#open-rooms-menu-ui")).toHaveClass(/is-hidden/);
  await expect(page.locator("#open-rooms-list-ui")).not.toHaveClass(/is-hidden/);

  await page.locator("#open-rooms-modal-close").click();
  await expect(page.locator("#open-rooms-menu-ui")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#open-rooms-list-ui")).toHaveClass(/is-hidden/);

  await page.locator("#open-rooms-create-btn").click();
  await expect(page.locator("#online-modal")).toHaveClass(/active/);
  await expect(page.locator("#open-rooms-modal")).not.toHaveClass(/active/);
  await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);
  await expect(page.locator("#online-modal .account-modal-title-wrap h2")).toHaveText(/Açıq otaq yarat|Create open room|Создать открытую комнату/);

  await page.evaluate(() => document.getElementById("online-modal-close")?.click());
  await expect(page.locator("#open-rooms-modal")).toHaveClass(/active/);
  await expect(page.locator("#open-rooms-menu-ui")).not.toHaveClass(/is-hidden/);
});

test("solo and online modals keep header title separate from description", async ({ page }) => {
  await page.goto("/index.html");

  await page.evaluate(() => document.getElementById("open-solo-modal-btn")?.click());
  await expect(page.locator("#solo-modal .account-modal-header h2")).toBeVisible();
  await expect(page.locator("#solo-modal .modal-desc")).toBeVisible();
  await expect(page.locator("#solo-modal-close")).toHaveText("×");
  await page.locator("#solo-modal-close").click();

  await page.evaluate(() => document.getElementById("open-online-modal-btn")?.click());
  await expect(page.locator("#online-modal .account-modal-header h2")).toBeVisible();
  await expect(page.locator("#online-modal .modal-desc")).toBeVisible();
  await expect(page.locator("#online-modal-close")).toHaveText("×");
  await page.locator("#online-modal-close").click();
});

test("reconnect banner appears during network reconnect and clears on recovery", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => {
    const banner = document.getElementById("connection-banner") ?? document.createElement("div");
    banner.id = "connection-banner";
    banner.className = "connection-banner is-visible";
    banner.removeAttribute("hidden");
    banner.textContent = "Reconnecting...";
    document.body.appendChild(banner);
    document.body.classList.add("is-reconnecting");
  });

  await expect(page.locator("#connection-banner")).toHaveClass(/is-visible/);
  await expect(page.locator("body")).toHaveClass(/is-reconnecting/);

  await page.evaluate(() => {
    const banner = document.getElementById("connection-banner");
    if (banner) {
      banner.classList.remove("is-visible");
      banner.setAttribute("hidden", "");
    }
    document.body.classList.remove("is-reconnecting");
  });

  await expect(page.locator("#connection-banner")).toHaveAttribute("hidden", "");
  await expect(page.locator("body")).not.toHaveClass(/is-reconnecting/);
});

test("resume banner renders stored session state", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => {
    const banner = document.getElementById("resume-session-banner") ?? document.createElement("section");
    banner.id = "resume-session-banner";
    banner.className = "resume-session-banner";
    banner.innerHTML = `
      <div class="resume-session-copy">
        <div id="resume-session-title" class="resume-session-title">Unfinished online session</div>
        <div id="resume-session-details" class="resume-session-details">Room room-1</div>
      </div>
      <button id="resume-session-btn" class="btn btn-primary">Resume</button>
    `;
    banner.classList.remove("is-hidden");
    document.body.appendChild(banner);
  });

  const banner = page.locator("#resume-session-banner");
  await expect(banner).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#resume-session-title")).toContainText(/unfinished|sessiya/i);
});
