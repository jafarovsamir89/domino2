# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> authenticated profile shows four stats cards without Xal and leaderboard uses Reyting
- Location: e2e/domino.spec.mjs:1750:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#player-profile-invite-btn')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#player-profile-invite-btn')
    14 × locator resolved to <button disabled hidden="" type="button" title="Invite" data-i18n="friend-invite" id="player-profile-invite-btn" class="btn btn-action btn-strong">Invite</button>
       - unexpected value "hidden"

```

```yaml
- status
- heading "Rating" [level=2]
- button "Close": ×
- paragraph: Players are sorted by rating.
- button "Overall" [pressed]
- button "Weekly"
- button "Friends"
- text: "#1"
- button "Samir"
- text: "Rating: 1234 #2"
- button "Alice"
- text: "Rating: 1200"
- heading "Player profile" [level=2]
- button "Close": ×
- text: Alice Ready Rating
- strong: "1200"
- text: Games
- strong: "13"
- text: Wins
- strong: "9"
- text: Losses
- strong: "4"
- button "Add"
- group "Player profile actions":
  - button "Message"
  - button "Report"
  - button "Block"
```

# Test source

```ts
  2165 |       status: 200,
  2166 |       contentType: "application/json",
  2167 |       headers,
  2168 |       body: JSON.stringify({
  2169 |         items: [
  2170 |           {
  2171 |             id: "m-1",
  2172 |             senderPlayerId: "p-2",
  2173 |             receiverPlayerId: "p-1",
  2174 |             text: "Hello",
  2175 |             createdAt: "2024-03-01T10:00:00.000Z",
  2176 |             readAt: null,
  2177 |             sender: { id: "p-2", displayName: "Alice", avatarSeed: null, avatarUrl: null, isGuest: false },
  2178 |             receiver: { id: "p-1", displayName: "Samir", avatarSeed: null, avatarUrl: null, isGuest: false }
  2179 |           }
  2180 |         ]
  2181 |       })
  2182 |     });
  2183 |   });
  2184 | 
  2185 |   await page.route("**/social/messages/p-2/delete", async (route) => {
  2186 |     threadHidden = true;
  2187 |     const headers = {
  2188 |       "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
  2189 |       "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  2190 |       "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  2191 |       "Access-Control-Allow-Credentials": "true",
  2192 |       "Vary": "Origin"
  2193 |     };
  2194 |     return route.fulfill({
  2195 |       status: 200,
  2196 |       contentType: "application/json",
  2197 |       headers,
  2198 |       body: JSON.stringify({ ok: true })
  2199 |     });
  2200 |   });
  2201 | 
  2202 |   await page.addInitScript(() => {
  2203 |     window.localStorage.setItem("dominoPlatformGameToken", "test-token");
  2204 |     window.localStorage.setItem("dominoPlatformProfile", JSON.stringify({
  2205 |       id: "p-1",
  2206 |       displayName: "Samir",
  2207 |       isGuest: false,
  2208 |       rating: 1234,
  2209 |       wins: 11,
  2210 |       losses: 4,
  2211 |       draws: 0,
  2212 |       matchesPlayed: 15,
  2213 |       points: 88,
  2214 |       coins: 777
  2215 |     }));
  2216 |     window.localStorage.setItem("dominoAuthProfile", JSON.stringify({
  2217 |       id: "p-1",
  2218 |       name: "Samir",
  2219 |       displayName: "Samir",
  2220 |       isGuest: false
  2221 |     }));
  2222 |   });
  2223 | 
  2224 |   await page.goto("/index.html");
  2225 |   await page.evaluate(() => document.getElementById("account-btn")?.click());
  2226 | 
  2227 |   await expect(page.locator("#account-modal")).toHaveClass(/active/);
  2228 |   await expect(page.locator("#account-profile-panel")).not.toHaveClass(/is-hidden/);
  2229 |   await expect(page.locator("#account-auth-panel")).toHaveClass(/is-hidden/);
  2230 |   await expect(page.locator("#account-points-value")).toHaveCount(0);
  2231 |   await expect(page.locator("#account-stats-grid .account-stat-card")).toHaveCount(4);
  2232 |   await expect(page.locator("#account-stats-grid")).toContainText(/Reyting|Rating|Рейтинг/);
  2233 |   await expect(page.locator("#account-stats-grid")).toContainText(/Coin|Coins|Монеты/);
  2234 |   await expect(page.locator("#account-stats-grid")).toContainText(/Oyunlar|Games|Игры/);
  2235 |   await expect(page.locator("#account-stats-grid")).toContainText(/Qələbələr|Wins|Победы/);
  2236 |   await expect(page.locator("#account-stats-grid")).not.toContainText(/Xal|Points|ELO/i);
  2237 | 
  2238 |   await page.evaluate(() => document.getElementById("account-modal-close")?.click());
  2239 | 
  2240 |   await expect(page.locator("#open-leaderboard-btn")).toHaveText(/Reytinq|Rating|Рейтинг/);
  2241 |   await page.evaluate(() => document.getElementById("open-leaderboard-btn")?.click());
  2242 |   await expect(page.locator("#leaderboard-modal")).toHaveClass(/active/);
  2243 |   await expect(page.locator("#leaderboard-list .leaderboard-card")).toHaveCount(2);
  2244 |   await expect(page.locator("#leaderboard-list")).toContainText(/Reyting|Rating|Рейтинг/);
  2245 |   await page.locator("#leaderboard-list .leaderboard-card .leaderboard-name-btn").last().click();
  2246 |   await expect(page.locator("#player-profile-modal")).toHaveClass(/active/);
  2247 |   await expect(page.locator("#player-profile-modal textarea")).toHaveCount(0);
  2248 |   await page.evaluate(() => {
  2249 |     const game = window.game;
  2250 |     if (!game) return;
  2251 |     game.currentRoomState = {
  2252 |       roomId: "room-1",
  2253 |       roomCode: "ABCD",
  2254 |       roomMode: "ffa",
  2255 |       stakeKey: "stake_50",
  2256 |       stakeAmount: 50,
  2257 |       humanSeats: 2,
  2258 |       totalPlayers: 2,
  2259 |       isTeamMode: false,
  2260 |       gameActive: false
  2261 |     };
  2262 |     game.network = { ...(game.network || {}), isHost: true };
  2263 |     game.renderPlayerProfileModal?.();
  2264 |   });
> 2265 |   await expect(page.locator("#player-profile-invite-btn")).toBeVisible();
       |                                                            ^ Error: expect(locator).toBeVisible() failed
  2266 |   await expect(page.locator("#player-profile-message-btn")).toBeVisible();
  2267 |   await page.locator("#player-profile-message-btn").click();
  2268 | 
  2269 |   // Clicking message button on player profile now opens Chat Screen directly
  2270 |   await expect(page.locator("#social-chats-panel")).not.toHaveClass(/is-hidden/);
  2271 |   await expect(page.locator("#account-messages-conversation-title")).toContainText(/Alice/);
  2272 |   await expect(page.locator("#player-profile-modal")).not.toHaveClass(/active/);
  2273 | 
  2274 | 
  2275 |   // Return to Social Hub using back button
  2276 |   await page.locator("#account-messages-back-btn").click();
  2277 |   await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  2278 |   await expect(page.locator("#social-center-modal-title")).toContainText(/Messages|Mesajlar|Сообщения/);
  2279 |   await expect(page.locator("#social-center-tabs [data-social-tab='inbox']")).toHaveClass(/is-active/);
  2280 |   await expect(page.locator("#social-center-tabs [data-social-tab='friends']")).toBeVisible();
  2281 | 
  2282 |   // In the redesigned two-tab system, Poçt list is immediately visible
  2283 |   await expect(page.locator("#social-inbox-panel")).not.toHaveClass(/is-hidden/);
  2284 |   await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(1);
  2285 |   await expect(page.locator("#social-inbox-list .inbox-card")).toContainText(/Alice|Hello from Alice/);
  2286 | 
  2287 |   // Re-open chat from the inbox list
  2288 |   await page.locator("#social-inbox-list .inbox-card .friend-card-copy").first().click();
  2289 |   await expect(page.locator("#account-messages-conversation-list")).toContainText(/Loading profile|Profil yüklənir|Загрузка профиля/);
  2290 |   await expect(page.locator("#social-chats-panel")).not.toHaveClass(/is-hidden/);
  2291 |   await expect(page.locator("#account-messages-conversation-title")).toContainText(/Alice/);
  2292 |   await expect(page.locator("#account-messages-conversation-list")).toContainText(/Hello/);
  2293 | 
  2294 |   // Return to Social Hub
  2295 |   await page.locator("#account-messages-back-btn").click();
  2296 |   await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  2297 | 
  2298 |   // Close and reopen the Social Hub to verify persistence
  2299 |   await page.evaluate(() => document.getElementById("social-center-modal-close")?.click());
  2300 |   await expect(page.locator("#social-center-modal")).not.toHaveClass(/active/);
  2301 |   await page.evaluate(() => document.getElementById("open-social-btn")?.click());
  2302 |   await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  2303 |   await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(1);
  2304 | 
  2305 |   await page.locator("#social-tab-mail-btn").click();
  2306 |   // Invites lists are integrated under Poçt tab and visible
  2307 |   await expect(page.locator("#social-invites-incoming-list .friend-card")).toHaveCount(1);
  2308 |   await expect(page.locator("#social-invites-sent-list .friend-card")).toHaveCount(1);
  2309 |   await expect(page.locator("#social-center-modal")).not.toContainText(/Expired|Declined|Cancelled|Истекло|Отклонено|Отменено/);
  2310 |   await expect(page.locator("#social-invites-sent-list")).toContainText(/Cancel|Ləğv et|Отменить/);
  2311 | 
  2312 |   // Cancel outgoing invite
  2313 |   await page.locator("#social-invites-sent-list .cancel-invite-btn").click();
  2314 |   await expect.poll(() => cancelInviteCalled).toBeTruthy();
  2315 | 
  2316 |   // Delete/claim inbox item
  2317 |   await expect(page.locator("#social-inbox-panel")).not.toHaveClass(/is-hidden/);
  2318 |   await page.locator("#social-inbox-list .inbox-card .delete-chat-action").first().click();
  2319 |   await expect(page.locator("#social-inbox-list .inbox-card")).toHaveCount(0);
  2320 | 
  2321 |   // Redesigned visual checks:
  2322 |   // 1. Verify tab buttons are visible and Dostlar tab can be clicked
  2323 |   await expect(page.locator("#social-tab-friends-btn")).toBeVisible();
  2324 |   await page.locator("#social-tab-friends-btn").click();
  2325 |   await expect(page.locator("#social-friends-panel")).toBeVisible();
  2326 | 
  2327 |   // 2. Friends list renders as premium-social-card cards
  2328 |   await expect(page.locator("#friends-list .friend-card")).toHaveCount(1);
  2329 |   await expect(page.locator("#friends-list .friend-card")).toContainText(/Alice/);
  2330 | 
  2331 |   // 3. Chat opens as a separate screen when clicking on a friend card copy
  2332 |   await page.locator("#friends-list .friend-card .friend-card-copy").first().click();
  2333 |   await expect(page.locator("#social-chats-panel")).not.toHaveClass(/is-hidden/);
  2334 | 
  2335 |   // 4. Send message input is visible and touch friendly
  2336 |   await expect(page.locator("#account-message-input")).toBeVisible();
  2337 | 
  2338 |   // 5. Ensure NO horizontal scroll overflow at mobile viewport width
  2339 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBeTruthy();
  2340 | 
  2341 |   // Return to Social Hub using back button
  2342 |   await page.locator("#account-messages-back-btn").click();
  2343 |   await expect(page.locator("#social-center-modal")).toHaveClass(/active/);
  2344 | 
  2345 | });
  2346 | 
  2347 | test("invite polling catches incoming room invitations without SSE", async ({ page }) => {
  2348 |   let inviteRequestCount = 0;
  2349 |   const headersFor = (route) => ({
  2350 |     "Access-Control-Allow-Origin": route.request().headers().origin ?? "http://127.0.0.1:4173",
  2351 |     "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  2352 |     "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  2353 |     "Access-Control-Allow-Credentials": "true",
  2354 |     "Vary": "Origin"
  2355 |   });
  2356 | 
  2357 |   await page.addInitScript(() => {
  2358 |     window.DOMINO_SERVER_URL = "http://127.0.0.1:3000";
  2359 |     window.localStorage?.setItem("dominoDebugLogs", "false");
  2360 |     window.localStorage?.setItem("dominoPlatformGameToken", "test-token");
  2361 |     window.localStorage?.setItem("dominoPlatformProfile", JSON.stringify({
  2362 |       id: "p-1",
  2363 |       displayName: "Samir",
  2364 |       isGuest: false,
  2365 |       rating: 1234,
```