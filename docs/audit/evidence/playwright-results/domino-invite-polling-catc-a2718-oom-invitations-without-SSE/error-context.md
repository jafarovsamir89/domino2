# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> invite polling catches incoming room invitations without SSE
- Location: e2e/domino.spec.mjs:2347:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 2
Received:    0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - button "Profile" [ref=e5] [cursor=pointer]:
          - img [ref=e7]
        - button "Messages" [ref=e10] [cursor=pointer]:
          - img [ref=e12]
      - generic [ref=e15]:
        - button "Coins" [ref=e16] [cursor=pointer]:
          - img [ref=e18]
          - generic [ref=e22]: Coins
        - button "Skins" [ref=e23] [cursor=pointer]:
          - img [ref=e25]
          - generic [ref=e29]: Skins
      - generic [ref=e30]:
        - combobox "Language" [ref=e31] [cursor=pointer]:
          - option "AZ"
          - option "RU"
          - option "EN" [selected]
        - text: ▾
    - generic [ref=e32]:
      - generic [ref=e34]:
        - generic:
          - generic:
            - generic:
              - generic:
                - heading "Domino (Muggins)" [level=1]
        - generic:
          - generic:
            - generic:
              - generic:
                - heading [level=1]: Domino (Muggins)
      - generic "Game mode selection" [ref=e35]:
        - tablist "Game mode" [ref=e36]:
          - button "Muggins" [pressed] [ref=e37]
          - button "Classic" [ref=e38]
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]: Daily bonus
            - generic [ref=e43]: Could not load bonus
          - generic [ref=e44]:
            - strong
        - generic [ref=e46]:
          - button "Could not load bonus" [disabled]
      - generic [ref=e47]:
        - button "Solo play" [ref=e48] [cursor=pointer]
        - generic [ref=e49]:
          - button "Online" [ref=e50] [cursor=pointer]
          - button: Private rooms
          - button: Open rooms
        - button "Rating" [ref=e51] [cursor=pointer]
    - generic: Все права защищены © SimpleSoft - Domino ver 1.33
  - status
  - generic:
    - generic:
      - generic: Friends
    - generic:
      - generic: No recipient available
    - generic:
      - generic:
        - generic: У вас нет полученных подарков. Вы можете купить подарок за монеты.
        - button: Купить подарок
  - generic:
    - generic:
      - generic:
        - generic: Players
        - generic: "0"
      - button: ×
```

# Test source

```ts
  2391 | 
  2392 |     window.EventSource = FakeEventSource;
  2393 |   });
  2394 | 
  2395 |   await page.route("**/platform/game-token", async (route) => {
  2396 |     return route.fulfill({
  2397 |       status: 200,
  2398 |       contentType: "application/json",
  2399 |       headers: headersFor(route),
  2400 |       body: JSON.stringify({
  2401 |         token: "test-token",
  2402 |         user: {
  2403 |           id: "u-1",
  2404 |           name: "Samir",
  2405 |           email: "samir@example.com",
  2406 |           role: "player"
  2407 |         },
  2408 |         player: {
  2409 |           id: "p-1",
  2410 |           displayName: "Samir",
  2411 |           avatarUrl: "",
  2412 |           isGuest: false
  2413 |         }
  2414 |       })
  2415 |     });
  2416 |   });
  2417 | 
  2418 |   await page.route("**/social/summary", async (route) => route.fulfill({
  2419 |     status: 200,
  2420 |     contentType: "application/json",
  2421 |     headers: headersFor(route),
  2422 |     body: JSON.stringify({
  2423 |       inboxUnreadCount: 0,
  2424 |       chatUnreadCount: 0,
  2425 |       inviteUnreadCount: 0,
  2426 |       friendRequestCount: 0,
  2427 |       totalUnreadCount: 0
  2428 |     })
  2429 |   }));
  2430 | 
  2431 |   await page.route("**/social/friends", async (route) => route.fulfill({
  2432 |     status: 200,
  2433 |     contentType: "application/json",
  2434 |     headers: headersFor(route),
  2435 |     body: JSON.stringify({ accepted: [], incoming: [], outgoing: [], items: [] })
  2436 |   }));
  2437 | 
  2438 |   await page.route("**/social/inbox*", async (route) => route.fulfill({
  2439 |     status: 200,
  2440 |     contentType: "application/json",
  2441 |     headers: headersFor(route),
  2442 |     body: JSON.stringify({ unreadCount: 0, items: [] })
  2443 |   }));
  2444 | 
  2445 |   await page.route("**/social/messages*", async (route) => route.fulfill({
  2446 |     status: 200,
  2447 |     contentType: "application/json",
  2448 |     headers: headersFor(route),
  2449 |     body: JSON.stringify({ items: [] })
  2450 |   }));
  2451 | 
  2452 |   await page.route("**/social/invitations**", async (route) => {
  2453 |     inviteRequestCount += 1;
  2454 |     const payload = inviteRequestCount < 2
  2455 |       ? { incoming: [], sent: [], items: [] }
  2456 |       : {
  2457 |           incoming: [
  2458 |             {
  2459 |               id: "inv-poll",
  2460 |               status: "pending",
  2461 |               roomId: "room-poll",
  2462 |               roomCode: "POLL",
  2463 |               roomMode: "ffa",
  2464 |               stakeKey: "stake_50",
  2465 |               stakeAmount: 50,
  2466 |               humanSeats: 2,
  2467 |               totalPlayers: 2,
  2468 |               isTeamMode: false,
  2469 |               inviter: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false },
  2470 |               invitee: { id: "p-1", displayName: "Samir", avatarSeed: null, avatarUrl: null, isGuest: false }
  2471 |             }
  2472 |           ],
  2473 |           sent: [],
  2474 |           items: []
  2475 |         };
  2476 |     return route.fulfill({
  2477 |       status: 200,
  2478 |       contentType: "application/json",
  2479 |       headers: headersFor(route),
  2480 |       body: JSON.stringify(payload)
  2481 |     });
  2482 |   });
  2483 | 
  2484 |   await page.goto("/index.html");
  2485 |   await page.waitForFunction(() => Boolean(window.game?.startGameInviteRefresh));
  2486 |   await page.evaluate(() => {
  2487 |     window.game?.stopGameInviteRefresh?.();
  2488 |     window.game?.startGameInviteRefresh?.({ intervalMs: 250, durationMs: 3000 });
  2489 |   });
  2490 | 
> 2491 |   await expect.poll(() => inviteRequestCount, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
       |                                                                  ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  2492 |   await expect(page.locator("#open-social-btn .start-social-badge")).toHaveText("1");
  2493 |   await page.locator("#open-social-btn").click();
  2494 |   await expect(page.locator("#social-invites-incoming-list .friend-card")).toHaveCount(1);
  2495 | });
  2496 | 
  2497 | test("open rooms modal uses a standard title bar and close button", async ({ page }) => {
  2498 |   await page.goto("/index.html");
  2499 |   await page.evaluate(() => document.getElementById("open-rooms-btn")?.click());
  2500 | 
  2501 |   await expect(page.locator("#open-rooms-modal")).toHaveClass(/active/);
  2502 |   await expect(page.locator("#open-rooms-modal .section-kicker")).toHaveCount(0);
  2503 |   await expect(page.locator("#open-rooms-modal h2")).toHaveText(/Açıq otaqlar|Open rooms|Открытые комнаты/);
  2504 |   await expect(page.locator("#open-rooms-modal-close")).toHaveText("×");
  2505 |   await expect(page.locator("#open-rooms-modal-close")).toHaveAttribute("aria-label", /Bağla|Close|Закрыть/);
  2506 | 
  2507 |   await page.locator("#open-rooms-modal-close").click();
  2508 |   await expect(page.locator("#open-rooms-modal")).not.toHaveClass(/active/);
  2509 | });
  2510 | 
  2511 | test("closed and open rooms create flows use contextual visibility without toggle UI", async ({ page }) => {
  2512 |   await page.goto("/index.html");
  2513 | 
  2514 |   await expect(page.locator("#open-online-modal-btn")).toHaveText(/Bağlı otaqlar|Private rooms|Закрытые комнаты/);
  2515 |   await page.evaluate(() => document.getElementById("open-online-modal-btn")?.click());
  2516 |   await expect(page.locator("#online-modal")).toHaveClass(/active/);
  2517 |   await expect(page.locator("#online-modal h2")).toHaveText(/Bağlı otaqlar|Private rooms|Закрытые комнаты/);
  2518 |   await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);
  2519 | 
  2520 |   await page.evaluate(() => document.getElementById("online-create-choice-btn")?.click());
  2521 |   await expect(page.locator("#online-flow-ui")).not.toHaveClass(/is-hidden/);
  2522 |   await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);
  2523 | 
  2524 |   await page.evaluate(() => document.getElementById("open-rooms-btn")?.click());
  2525 |   await expect(page.locator("#open-rooms-modal")).toHaveClass(/active/);
  2526 |   await expect(page.locator("#open-rooms-menu-ui")).not.toHaveClass(/is-hidden/);
  2527 |   await expect(page.locator("#open-rooms-list-ui")).toHaveClass(/is-hidden/);
  2528 |   await expect(page.locator("#open-rooms-create-btn")).toBeVisible();
  2529 |   await expect(page.locator("#open-rooms-join-btn")).toBeVisible();
  2530 | 
  2531 |   await page.evaluate(() => document.getElementById("open-rooms-join-btn")?.click());
  2532 |   await expect(page.locator("#open-rooms-menu-ui")).toHaveClass(/is-hidden/);
  2533 |   await expect(page.locator("#open-rooms-list-ui")).not.toHaveClass(/is-hidden/);
  2534 | 
  2535 |   await page.evaluate(() => document.getElementById("open-rooms-modal-close")?.click());
  2536 |   await expect(page.locator("#open-rooms-menu-ui")).not.toHaveClass(/is-hidden/);
  2537 |   await expect(page.locator("#open-rooms-list-ui")).toHaveClass(/is-hidden/);
  2538 | 
  2539 |   await page.evaluate(() => document.getElementById("open-rooms-create-btn")?.click());
  2540 |   await expect(page.locator("#online-modal")).toHaveClass(/active/);
  2541 |   await expect(page.locator("#open-rooms-modal")).not.toHaveClass(/active/);
  2542 |   await expect(page.locator("#online-visibility-wrapper")).toHaveCount(0);
  2543 |   await expect(page.locator("#online-modal .account-modal-title-wrap h2")).toHaveText(/Açıq otaq yarat|Create open room|Создать открытую комнату/);
  2544 | });
  2545 | 
  2546 | test("solo and online modals keep header title separate from description", async ({ page }) => {
  2547 |   await page.goto("/index.html");
  2548 | 
  2549 |   await page.evaluate(() => document.getElementById("open-solo-modal-btn")?.click());
  2550 |   await expect(page.locator("#solo-modal .account-modal-header h2")).toBeVisible();
  2551 |   await expect(page.locator("#solo-modal .modal-desc")).toBeVisible();
  2552 |   await expect(page.locator("#solo-modal-close")).toHaveText("×");
  2553 |   await page.locator("#solo-modal-close").click();
  2554 | 
  2555 |   await page.evaluate(() => document.getElementById("open-online-modal-btn")?.click());
  2556 |   await expect(page.locator("#online-modal .account-modal-header h2")).toBeVisible();
  2557 |   await expect(page.locator("#online-modal .modal-desc")).toBeVisible();
  2558 |   await expect(page.locator("#online-modal-close")).toHaveText("×");
  2559 |   await page.locator("#online-modal-close").click();
  2560 | });
  2561 | 
  2562 | test("in-game pause menu keeps only continue and exit and round summary hides winner hand details", async ({ page }) => {
  2563 |   await page.goto("/index.html");
  2564 | 
  2565 |   await page.evaluate(() => {
  2566 |     document.getElementById("menu-screen")?.classList.add("active");
  2567 |     document.getElementById("game-over-screen")?.classList.add("active");
  2568 |     document.getElementById("round-end-details")?.replaceChildren();
  2569 |   });
  2570 | 
  2571 |   await expect(page.locator("#menu-screen .menu-panel .btn-menu")).toHaveCount(4);
  2572 |   await expect(page.locator("#menu-screen")).not.toContainText(/Profile|Профиль|Coin|Coins|Магазин|Skin|Скины/i);
  2573 |   await expect(page.locator("#menu-screen")).toContainText(/Davam et|Продолжить|Continue/);
  2574 |   await expect(page.locator("#menu-screen")).toContainText(/Çıxış|Выход|Exit/);
  2575 | 
  2576 |   await page.evaluate(async () => {
  2577 |     const { Renderer } = await import("/js/renderer.js");
  2578 |     const mockApp = {
  2579 |       t: (key) => ({
  2580 |         "label-hand-points": "El",
  2581 |         "label-bonus": "Bonus",
  2582 |         "label-total": "Total",
  2583 |         "msg-fish": "Fish",
  2584 |         "out-suffix": "out"
  2585 |       }[key] || key),
  2586 |       createTileEl: () => {
  2587 |         const tile = document.createElement("span");
  2588 |         tile.className = "tile";
  2589 |         tile.textContent = "tile";
  2590 |         return tile;
  2591 |       }
```