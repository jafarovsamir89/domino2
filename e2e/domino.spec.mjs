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

test("authenticated profile shows four stats cards without Xal and leaderboard uses Reyting", async ({ page }) => {
  await page.route("**/platform/game-token", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        token: "test-token",
        user: {
          id: "u-1",
          name: "Samir",
          email: "samir@example.com",
          role: "player"
        },
        player: {
          id: "p-1",
          displayName: "Samir",
          avatarUrl: "",
          isGuest: false
        },
        stats: {
          rating: 1234,
          points: 88,
          wins: 11,
          losses: 4,
          draws: 0,
          matchesPlayed: 15,
          currentStreak: 2,
          bestStreak: 5,
          titleCode: "rookie"
        },
        wallet: {
          balance: 777,
          availableBalance: 777,
          spendableBalance: 777,
          reservedBalance: 0
        },
        recentMatches: []
      })
    });
  });

  await page.route("**/leaderboard*", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        items: [
          { id: "p-1", rank: 1, displayName: "Samir", rating: 1234, matchesPlayed: 15, wins: 11, losses: 4 },
          { id: "p-2", rank: 2, displayName: "Alice", rating: 1200, matchesPlayed: 13, wins: 9, losses: 4 }
        ]
      })
    });
  });

  await page.route("**/social/friends", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        accepted: [
          {
            id: "f-1",
            status: "accepted",
            relation: "accepted",
            friend: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false }
          }
        ],
        incoming: [
          {
            id: "f-2",
            status: "pending",
            relation: "incoming",
            friend: { id: "p-3", displayName: "Bob", avatarSeed: null, avatarUrl: null, isGuest: false }
          }
        ],
        outgoing: [],
        items: []
      })
    });
  });

  await page.route("**/social/players/search?query=*", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        items: [
          { id: "p-4", displayName: "Charlie", avatarSeed: null, avatarUrl: null, isGuest: false }
        ]
      })
    });
  });

  await page.route("**/social/friends/request", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        item: {
          id: "f-3",
          status: "pending",
          relation: "outgoing",
          friend: { id: "p-4", displayName: "Charlie", avatarSeed: null, avatarUrl: null, isGuest: false }
        }
      })
    });
  });

  await page.route("**/social/players/p-2/profile", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        item: {
          id: "p-2",
          displayName: "Alice",
          avatarSeed: null,
          avatarUrl: null,
          stats: {
            rating: 1200,
            matchesPlayed: 13,
            wins: 9,
            losses: 4
          },
          friendshipStatus: "none"
        }
      })
    });
  });

  let threadHidden = false;

  await page.route("**/social/messages", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        items: threadHidden ? [] : [
          {
            player: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false },
            lastMessage: {
              id: "m-1",
              senderPlayerId: "p-2",
              receiverPlayerId: "p-1",
              text: "Hello",
              createdAt: "2024-03-01T10:00:00.000Z",
              readAt: null,
              sender: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false },
              receiver: { id: "p-1", displayName: "Samir", avatarSeed: null, avatarUrl: null, isGuest: false }
            },
            unreadCount: 1,
            messageCount: 1
          }
        ]
      })
    });
  });

  await page.route("**/social/summary", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        inboxUnreadCount: 2,
        chatUnreadCount: 0,
        inviteUnreadCount: 1,
        friendRequestCount: 1,
        totalUnreadCount: 4
      })
    });
  });

  await page.route("**/social/inbox*", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        unreadCount: threadHidden ? 0 : 2,
        items: threadHidden ? [] : [
          {
            id: "i-1",
            playerId: "p-1",
            type: "direct_message",
            title: "Message from Alice",
            body: "Hello from Alice",
            status: "unread",
            payloadJson: { messageId: "m-1", senderPlayerId: "p-2", senderDisplayName: "Alice", receiverPlayerId: "p-1" },
            createdAt: "2024-03-03T10:00:00.000Z",
            readAt: null,
            expiresAt: null,
            isUnread: true,
            isClaimable: false,
            relatedPlayerId: "p-2",
            relatedMessageId: "m-1"
          }
        ]
      })
    });
  });

  await page.route("**/social/messages/p-2", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          item: {
            id: "m-2",
            senderPlayerId: "p-1",
            receiverPlayerId: "p-2",
            text: "Ping",
            createdAt: "2024-03-01T10:10:00.000Z",
            readAt: null,
            sender: { id: "p-1", displayName: "Samir", avatarSeed: null, avatarUrl: null, isGuest: false },
            receiver: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false }
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        items: [
          {
            id: "m-1",
            senderPlayerId: "p-2",
            receiverPlayerId: "p-1",
            text: "Hello",
            createdAt: "2024-03-01T10:00:00.000Z",
            readAt: null,
            sender: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false },
            receiver: { id: "p-1", displayName: "Samir", avatarSeed: null, avatarUrl: null, isGuest: false }
          }
        ]
      })
    });
  });

  await page.route("**/social/messages/p-2/delete", async (route) => {
    threadHidden = true;
    const headers = {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({ ok: true })
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("dominoPlatformGameToken", "test-token");
    window.localStorage.setItem("dominoPlatformProfile", JSON.stringify({
      id: "p-1",
      displayName: "Samir",
      isGuest: false,
      rating: 1234,
      wins: 11,
      losses: 4,
      draws: 0,
      matchesPlayed: 15,
      points: 88,
      coins: 777
    }));
    window.localStorage.setItem("dominoAuthProfile", JSON.stringify({
      id: "p-1",
      name: "Samir",
      displayName: "Samir",
      isGuest: false
    }));
  });

  await page.goto("/index.html");
  await page.evaluate(() => document.getElementById("account-btn")?.click());

  await expect(page.locator("#account-modal")).toHaveClass(/active/);
  await expect(page.locator("#account-profile-panel")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#account-auth-panel")).toHaveClass(/is-hidden/);
  await expect(page.locator("#account-points-value")).toHaveCount(0);
  await expect(page.locator("#account-stats-grid .account-stat-card")).toHaveCount(4);
  await expect(page.locator("#account-stats-grid")).toContainText(/Reyting|Rating|Рейтинг/);
  await expect(page.locator("#account-stats-grid")).toContainText(/Coin|Coins|Монеты/);
  await expect(page.locator("#account-stats-grid")).toContainText(/Oyunlar|Games|Игры/);
  await expect(page.locator("#account-stats-grid")).toContainText(/Qələbələr|Wins|Победы/);
  await expect(page.locator("#account-stats-grid")).not.toContainText(/Xal|Points|ELO/i);

  await page.evaluate(() => document.getElementById("account-modal-close")?.click());

  await expect(page.locator("#open-leaderboard-btn")).toHaveText(/Reytinq|Rating|Рейтинг/);
  await page.evaluate(() => document.getElementById("open-leaderboard-btn")?.click());
  await expect(page.locator("#leaderboard-modal")).toHaveClass(/active/);
  await expect(page.locator("#leaderboard-list .leaderboard-card")).toHaveCount(2);
  await expect(page.locator("#leaderboard-list")).toContainText(/Reyting|Rating|Рейтинг/);
  await page.locator("#leaderboard-list .leaderboard-card .leaderboard-name-btn").last().click();
  await expect(page.locator("#player-profile-modal")).toHaveClass(/active/);
  await expect(page.locator("#player-profile-modal textarea")).toHaveCount(0);
  await page.evaluate(() => {
    const game = window.game;
    if (!game) return;
    game.currentRoomState = {
      roomId: "room-1",
      roomCode: "ABCD",
      roomMode: "ffa",
      stakeKey: "stake_50",
      stakeAmount: 50,
      humanSeats: 2,
      totalPlayers: 2,
      isTeamMode: false,
      gameActive: false
    };
    game.network = { ...(game.network || {}), isHost: true };
    game.renderPlayerProfileModal?.();
  });
  await expect(page.locator("#player-profile-invite-btn")).toBeVisible();
  await expect(page.locator("#player-profile-message-btn")).toBeVisible();
  await page.locator("#player-profile-message-btn").click();
  await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  await expect(page.locator("#social-center-modal-title")).toContainText(/Messages|Mesajlar|Сообщения/);
  await expect(page.locator("#social-center-tabs [data-social-tab='inbox']")).toHaveClass(/is-active/);
  await expect(page.locator("#social-center-tabs [data-social-tab='invites']")).toBeVisible();
  await expect(page.locator("#social-center-tabs [data-social-tab='friends']")).toBeVisible();
  await expect(page.locator("#social-center-tabs [data-social-tab='chats']")).toHaveCount(0);
  await page.locator("#social-center-tabs [data-social-tab='inbox']").click();
  await expect(page.locator("#social-inbox-panel")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(1);
  await expect(page.locator("#social-inbox-list .inbox-card")).toContainText(/Alice|Hello from Alice/);
  await page.locator("#social-inbox-list .inbox-card .btn").first().click();
  await expect(page.locator("#social-chats-panel")).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#account-messages-conversation-title")).toContainText(/Alice/);
  await expect(page.locator("#player-profile-modal")).not.toHaveClass(/active/);
  await page.evaluate(() => document.getElementById("social-center-modal-close")?.click());
  await expect(page.locator("#social-center-modal")).not.toHaveClass(/active/);
  await page.evaluate(() => document.getElementById("open-social-btn")?.click());
  await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(1);
  await page.locator("#social-inbox-list .inbox-card .btn").nth(1).click();
  await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(0);

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

test("in-game pause menu keeps only continue and exit and round summary hides winner hand details", async ({ page }) => {
  await page.goto("/index.html");

  await page.evaluate(() => {
    document.getElementById("menu-screen")?.classList.add("active");
    document.getElementById("game-over-screen")?.classList.add("active");
    document.getElementById("round-end-details")?.replaceChildren();
  });

  await expect(page.locator("#menu-screen .menu-panel .btn-menu")).toHaveCount(2);
  await expect(page.locator("#menu-screen")).not.toContainText(/Profile|Профиль|Coin|Coins|Магазин|Skin|Скины/i);
  await expect(page.locator("#menu-screen")).toContainText(/Davam et|Продолжить|Continue/);
  await expect(page.locator("#menu-screen")).toContainText(/Çıxış|Выход|Exit/);

  await page.evaluate(async () => {
    const { Renderer } = await import("/js/renderer.js");
    const mockApp = {
      t: (key) => ({
        "label-hand-points": "El",
        "label-bonus": "Bonus",
        "label-total": "Total",
        "msg-fish": "Fish",
        "out-suffix": "out"
      }[key] || key),
      createTileEl: () => {
        const tile = document.createElement("span");
        tile.className = "tile";
        tile.textContent = "tile";
        return tile;
      }
    };
    const renderer = new Renderer(mockApp);
    renderer.renderDealEnd("Samir", [
      { name: "Samir", isWinner: true, handPoints: 0, score: 100, leftoverHands: [[{ a: 1, b: 2 }]] },
      { name: "Elvin", isWinner: false, handPoints: 12, score: 88, leftoverHands: [[{ a: 3, b: 4 }]] }
    ], false, 10);
  });

  const roundRows = page.locator("#round-end-details .detail-row");
  await expect(roundRows).toHaveCount(2);
  await expect(roundRows.nth(0)).not.toContainText(/El:\s*0|El:/i);
  await expect(roundRows.nth(0).locator(".tile")).toHaveCount(0);
  await expect(roundRows.nth(1)).toContainText(/El:\s*12/i);
  await expect(roundRows.nth(1).locator(".tile")).toHaveCount(1);

  const gameOverButtons = page.locator("#game-over-screen .game-over-actions .btn");
  await expect(gameOverButtons).toHaveCount(2);
  const firstBox = await gameOverButtons.nth(0).boundingBox();
  const secondBox = await gameOverButtons.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (firstBox && secondBox) {
    expect(Math.abs(firstBox.width - secondBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(1);
  }

  await page.evaluate(() => {
    document.getElementById("game-over-screen")?.classList.remove("active");
    document.getElementById("round-end-screen")?.classList.remove("active");
    document.getElementById("menu-screen")?.classList.remove("active");
  });
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
test("team score names open the player profile modal above the table", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(() => {
    const dominoGame = typeof game !== "undefined" ? game : window.game;
    if (!dominoGame) return null;
    dominoGame.roomPlayerRefs = [
      { playerId: "p-1", displayName: "Samir", isBot: false },
      { playerId: "bot-1", displayName: "AI", isBot: true },
      { playerId: "p-2", displayName: "Alice", isBot: false },
      { playerId: "bot-2", displayName: "AI 2", isBot: true }
    ];
    dominoGame.playerNames = ["Samir", "AI", "Alice", "AI 2"];
    dominoGame.teamScores = [12, 8];
    dominoGame.teamRoundWins = [1, 0];
    dominoGame.isTeamMode = true;
    dominoGame.currentPlayer = 0;
    dominoGame.playerCount = 4;
    dominoGame.renderer.renderScores([
      { name: dominoGame.getTeamDisplayName(0), score: 12, roundWins: 1, index: 0, playerId: "p-1", isBot: false },
      { name: dominoGame.getTeamDisplayName(1), score: 8, roundWins: 0, index: 1, playerId: "p-2", isBot: false }
    ], 0);
    const buttons = Array.from(document.querySelectorAll("#scores-bar .score-name-button"));
    buttons[0]?.click();
    const modal = document.getElementById("player-profile-modal");
    return {
      buttonCount: buttons.length,
      modalActive: Boolean(modal?.classList.contains("active")),
      modalZ: window.getComputedStyle(modal || document.body).zIndex
    };
  });

  expect(result).toBeTruthy();
  expect(result.buttonCount).toBe(2);
  expect(result.modalActive).toBe(true);
  expect(result.modalZ).toBe("32000");
});

test("game invite attaches the resolved room code instead of the room id", async ({ page }) => {
  await page.goto("/index.html");
  const payload = await page.evaluate(async () => {
    const dominoGame = typeof game !== "undefined" ? game : window.game;
    if (!dominoGame) return null;
    dominoGame.gameInviteState = {
      inviteId: "invite-1",
      inviteePlayerId: "player-2",
      inviteeDisplayName: "Alice",
      sessionId: "session-1",
      role: "inviter",
      roomLinked: false,
      createPromptShown: false,
      waitingPromptShown: false
    };
    dominoGame.getCurrentRoomSnapshot = () => ({
      roomMode: "ffa",
      stakeKey: "stake_200",
      stakeAmount: 200,
      humanSeats: 2,
      totalPlayers: 2,
      isTeamMode: false
    });
    dominoGame.network.resolveRoomCode = async (roomId) => (String(roomId || "") === "room-123" ? "ABCD" : null);
    let captured = null;
    dominoGame.account.inviteFriendToRoom = async (_sessionId, nextPayload) => {
      captured = nextPayload;
      return { item: { id: "invite-2", roomCode: nextPayload.roomCode } };
    };
    await dominoGame.attachGameInviteRoom("room-123");
    return captured;
  });

  expect(payload).toBeTruthy();
  expect(payload.roomCode).toBe("ABCD");
});

