# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> start screen loads and stays within mobile viewport
- Location: e2e/domino.spec.mjs:152:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('script[src*="js/app.js?v=social-live-1"]')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('script[src*="js/app.js?v=social-live-1"]')
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - combobox "Language" [ref=e5] [cursor=pointer]:
        - option "AZ"
        - option "RU"
        - option "EN" [selected]
      - text: ▾
    - generic [ref=e7]:
      - generic [ref=e8]:
        - paragraph [ref=e9]: Access
        - heading "Sign in to your account" [level=2] [ref=e10]
        - paragraph [ref=e11]: Use your account to keep rating, match history, and Google login in one place.
      - generic [ref=e12]:
        - button "Continue with Google" [ref=e13] [cursor=pointer]:
          - img [ref=e15]
          - generic [ref=e20]: Continue with Google
        - button "Continue with Apple" [ref=e21] [cursor=pointer]:
          - img [ref=e23]
          - generic [ref=e25]: Continue with Apple
      - generic [ref=e26]: Sign in to continue
      - paragraph [ref=e27]:
        - text: By continuing, you agree to the
        - link "Terms of Service" [ref=e28] [cursor=pointer]:
          - /url: terms.html
        - text: and
        - link "Privacy Policy" [ref=e29] [cursor=pointer]:
          - /url: privacy.html
        - text: and
        - link "Rules of Conduct" [ref=e30] [cursor=pointer]:
          - /url: terms.html#conduct
        - text: .
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
  55  |       token: "test-token",
  56  |       user: {
  57  |         id: "u-1",
  58  |         name: "Samir",
  59  |         email: "samir@example.com",
  60  |         role: "player"
  61  |       },
  62  |       player: {
  63  |         id: "p-1",
  64  |         displayName: "Samir",
  65  |         avatarUrl: "",
  66  |         isGuest: false
  67  |       },
  68  |       stats: {
  69  |         rating: 1234,
  70  |         points: 88,
  71  |         wins: 11,
  72  |         losses: 4,
  73  |         draws: 0,
  74  |         matchesPlayed: 15,
  75  |         currentStreak: 2,
  76  |         bestStreak: 5,
  77  |         titleCode: "rookie"
  78  |       },
  79  |       wallet: {
  80  |         balance: 777,
  81  |         availableBalance: 777,
  82  |         spendableBalance: 777,
  83  |         reservedBalance: 0
  84  |       },
  85  |       recentMatches: []
  86  |     };
  87  | 
  88  |     const originalFetch = window.fetch.bind(window);
  89  |     window.fetch = async (input, init) => {
  90  |       const url = typeof input === "string" ? input : String(input?.url || "");
  91  |       if (url.includes("/platform/game-token")) return jsonResponse(profilePayload);
  92  |       if (url.includes("/platform/status")) return jsonResponse({});
  93  |       if (url.includes("/economy/cosmetics/table-skins")) return jsonResponse({ items: [] });
  94  |       if (url.includes("/social/gifts/catalog")) return jsonResponse({ items: [] });
  95  |       if (url.includes("/social/gifts/inventory")) return jsonResponse({ items: [] });
  96  |       if (url.includes("/social/gifts/history")) return jsonResponse({ items: [] });
  97  |       if (url.includes("/social/friends")) return jsonResponse({ accepted: [], incoming: [], outgoing: [], items: [] });
  98  |       if (url.includes("/social/summary")) return jsonResponse({
  99  |         inboxUnreadCount: 0,
  100 |         chatUnreadCount: 0,
  101 |         inviteUnreadCount: 0,
  102 |         friendRequestCount: 0,
  103 |         totalUnreadCount: 0
  104 |       });
  105 |       if (url.includes("/economy/daily-bonus/status")) return jsonResponse({ available: false });
  106 |       if (url.includes("/economy/solo/reserve") || url.includes("/economy/solo/settle")) {
  107 |         window.__soloStakeRequestCount += 1;
  108 |         return jsonResponse(rejectSoloStake
  109 |           ? { ok: false, reason: "solo_stakes_disabled" }
  110 |           : { ok: true });
  111 |       }
  112 |       return originalFetch(input, init);
  113 |     };
  114 | 
  115 |     class FakeEventSource {
  116 |       constructor() {
  117 |         this.readyState = 1;
  118 |         this.onopen = null;
  119 |         this.onmessage = null;
  120 |         this.onerror = null;
  121 |       }
  122 |       addEventListener() {}
  123 |       removeEventListener() {}
  124 |       close() {}
  125 |     }
  126 | 
  127 |     window.EventSource = FakeEventSource;
  128 |   }, { konvaEnabled, rejectSoloStakeRequests });
  129 | }
  130 | 
  131 | async function startSoloGame(page) {
  132 |   await page.waitForFunction(() => Boolean(window.game?.renderer && window.game?.account));
  133 |   await page.locator("#open-solo-modal-btn").click();
  134 |   await page.locator("#player-name").fill("Samir");
  135 |   await page.locator("#start-game-btn").click();
  136 |   await expect(page.locator("#game-screen")).toHaveClass(/active/);
  137 |   await page.waitForFunction(() => Boolean(
  138 |     document.querySelector("#board-container canvas")
  139 |     || document.querySelector("#board .board-empty-placeholder")
  140 |     || document.querySelector("#board .board-layout")
  141 |   ));
  142 | }
  143 | 
  144 | test.beforeEach(async ({ page }) => {
  145 |   await stubApi(page);
  146 |   await page.addInitScript(() => {
  147 |     window.DOMINO_SERVER_URL = "http://127.0.0.1:3000";
  148 |     window.localStorage?.setItem("dominoDebugLogs", "false");
  149 |   });
  150 | });
  151 | 
  152 | test("start screen loads and stays within mobile viewport", async ({ page }) => {
  153 |   await page.goto("/index.html");
  154 | 
> 155 |   await expect(page.locator('script[src*="js/app.js?v=social-live-1"]')).toHaveCount(1);
      |                                                                          ^ Error: expect(locator).toHaveCount(expected) failed
  156 |   await expect(page.locator('script[src*="js/network.js?v=social-live-1"]')).toHaveCount(1);
  157 |   await expect(page.locator("#start-screen")).toHaveClass(/active/);
  158 |   await expect(page.locator("#account-btn")).toHaveClass(/start-profile-btn/);
  159 |   await expect(page.locator("#account-btn")).toHaveClass(/icon-btn/);
  160 |   await expect(page.locator("#account-btn")).toHaveAttribute("aria-label", /Giriş|Daxil|Вход/);
  161 |   await expect(page.locator("#account-btn")).toHaveText("");
  162 |   await expect(page.locator("#start-screen .start-topbar")).toBeVisible();
  163 |   await expect(page.locator("#start-lang-select")).toHaveCount(1);
  164 |   await expect(page.locator("#start-lang-select")).toHaveValue(/^(az|ru|en)$/);
  165 |   await expect(page.locator("#start-screen .btn-lang")).toHaveCount(0);
  166 |   await expect(page.locator("#open-online-modal-btn")).not.toHaveText("");
  167 |   await expect(page.locator("#start-coin-shop-btn")).not.toHaveText("");
  168 |   await expect(page.locator("#start-coin-shop-btn")).toHaveClass(/start-top-shop-btn/);
  169 |   await expect(page.locator("#start-cosmetics-shop-btn")).toHaveClass(/start-top-shop-btn/);
  170 |   await expect(page.locator("#start-screen .start-actions .start-shop-btn")).toHaveCount(0);
  171 |   await expect(page.locator("#account-modal-title")).toHaveText(/Hesab|Аккаунт/);
  172 | 
  173 |   const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  174 |   expect(overflow).toBe(false);
  175 | });
  176 | 
  177 | for (const gameMode of ["telefon", "classic101"]) {
  178 |   test(`solo ${gameMode} starts without calling disabled stake endpoints`, async ({ page }) => {
  179 |     await setupSoloSmoke(page, { rejectSoloStakeRequests: true });
  180 |     await page.goto("/index.html");
  181 |     await page.waitForFunction(() => Boolean(window.game?.renderer && window.game?.account));
  182 |     await page.evaluate((mode) => window.game?.setPreferredStartMode?.(mode), gameMode);
  183 |     await startSoloGame(page);
  184 | 
  185 |     const state = await page.evaluate(() => ({
  186 |       gameActive: Boolean(window.game?.gameActive),
  187 |       gameMode: window.game?.mode,
  188 |       economyMode: window.game?.soloEconomyMode,
  189 |       stakeKey: window.game?.currentRoundStakeKey,
  190 |       bankAmount: window.game?.currentRoundBankAmount,
  191 |       stakeRequestCount: window.__soloStakeRequestCount,
  192 |       stakeControlsHidden: document.getElementById("solo-stake-wrapper")?.classList.contains("is-hidden")
  193 |     }));
  194 | 
  195 |     expect(state).toEqual({
  196 |       gameActive: true,
  197 |       gameMode,
  198 |       economyMode: "free",
  199 |       stakeKey: "free",
  200 |       bankAmount: 0,
  201 |       stakeRequestCount: 0,
  202 |       stakeControlsHidden: true
  203 |     });
  204 |   });
  205 | 
  206 |   test(`solo ${gameMode} starts a fresh match after both win and loss`, async ({ page }) => {
  207 |     await setupSoloSmoke(page, { rejectSoloStakeRequests: true });
  208 |     await page.goto("/index.html");
  209 |     await page.waitForFunction(() => Boolean(window.game?.renderer && window.game?.account));
  210 |     await page.evaluate((mode) => window.game?.setPreferredStartMode?.(mode), gameMode);
  211 |     await startSoloGame(page);
  212 | 
  213 |     for (const winnerIndex of [0, 1]) {
  214 |       const previousSessionId = await page.evaluate((nextWinnerIndex) => {
  215 |         const game = window.game;
  216 |         game.clearNextDealAdvanceTimeout();
  217 |         game.clearTurnTimers();
  218 |         game._turnCycleId += 1;
  219 |         game.gameActive = false;
  220 |         game.roundOver = true;
  221 |         game.matchOver = true;
  222 |         game.scores = game.playerNames.map((_, index) => index === nextWinnerIndex ? game.ruleset.matchTarget : 0);
  223 |         game.roundWins = game.playerNames.map((_, index) => index === nextWinnerIndex ? 1 : 0);
  224 |         game.showMatchResult(nextWinnerIndex);
  225 |         return game.currentMatchSessionId;
  226 |       }, winnerIndex);
  227 | 
  228 |       await expect(page.locator("#game-over-screen")).toHaveClass(/active/);
  229 |       await page.locator("#new-game-btn").click();
  230 |       await page.waitForFunction((oldSessionId) => Boolean(
  231 |         window.game?.gameActive
  232 |         && !window.game?.roundOver
  233 |         && !window.game?.matchOver
  234 |         && window.game?.currentMatchSessionId
  235 |         && window.game.currentMatchSessionId !== oldSessionId
  236 |         && window.game?.hands?.every((hand) => Array.isArray(hand) && hand.length > 0)
  237 |       ), previousSessionId);
  238 | 
  239 |       const state = await page.evaluate(() => ({
  240 |         gameActive: Boolean(window.game?.gameActive),
  241 |         roundOver: Boolean(window.game?.roundOver),
  242 |         matchOver: Boolean(window.game?.matchOver),
  243 |         gameScreenActive: document.getElementById("game-screen")?.classList.contains("active"),
  244 |         gameOverActive: document.getElementById("game-over-screen")?.classList.contains("active"),
  245 |         stakeRequestCount: window.__soloStakeRequestCount
  246 |       }));
  247 | 
  248 |       expect(state).toEqual({
  249 |         gameActive: true,
  250 |         roundOver: false,
  251 |         matchOver: false,
  252 |         gameScreenActive: true,
  253 |         gameOverActive: false,
  254 |         stakeRequestCount: 0
  255 |       });
```