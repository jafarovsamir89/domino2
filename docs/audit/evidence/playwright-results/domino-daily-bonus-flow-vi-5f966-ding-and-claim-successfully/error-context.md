# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> daily bonus flow: visible only when authed, handles status loading and claim successfully
- Location: e2e/domino.spec.mjs:2892:1

# Error details

```
Error: expect(locator).not.toHaveClass(expected) failed

Locator: locator('#daily-bonus-card')
Expected pattern: not /is-hidden/
Received string: "daily-bonus-card is-hidden"
Timeout: 5000ms

Call log:
  - Expect "not toHaveClass" with timeout 5000ms
  - waiting for locator('#daily-bonus-card')
    14 × locator resolved to <section id="daily-bonus-card" class="daily-bonus-card is-hidden">…</section>
       - unexpected value "daily-bonus-card is-hidden"

```

```yaml
- combobox "Language":
  - option "AZ"
  - option "RU"
  - option "EN" [selected]
- text: ▾
- paragraph: Access
- heading "Sign in to your account" [level=2]
- paragraph: Use your account to keep rating, match history, and Google login in one place.
- button "Continue with Google"
- button "Continue with Apple"
- text: Sign in to continue
- paragraph:
  - text: By continuing, you agree to the
  - link "Terms of Service":
    - /url: terms.html
  - text: and
  - link "Privacy Policy":
    - /url: privacy.html
  - text: and
  - link "Rules of Conduct":
    - /url: terms.html#conduct
  - text: .
- text: Все права защищены © SimpleSoft - Domino ver 1.33
- status
```

# Test source

```ts
  2912 |           claimDate: "2026-06-04",
  2913 |           streakDay: 3,
  2914 |           todayAmount: 350,
  2915 |           tomorrowAmount: 400,
  2916 |           maxStreak: 7,
  2917 |           nextClaimAt: null,
  2918 |           lastClaimAt: "2026-06-03T10:00:00.000Z"
  2919 |         }
  2920 |       })
  2921 |     });
  2922 |   });
  2923 | 
  2924 |   await page.route("**/economy/daily-bonus/claim", async (route) => {
  2925 |     claimCalled = true;
  2926 |     dailyBonusClaimedToday = true;
  2927 |     mockBalance = 1127;
  2928 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  2929 |     const headers = {
  2930 |       "Access-Control-Allow-Origin": origin,
  2931 |       "Access-Control-Allow-Credentials": "true"
  2932 |     };
  2933 |     return route.fulfill({
  2934 |       status: 200,
  2935 |       contentType: "application/json",
  2936 |       headers,
  2937 |       body: JSON.stringify({
  2938 |         ok: true,
  2939 |         claimed: true,
  2940 |         claim: { id: "claim-1", claimDate: "2026-06-04", streakDay: 3, amount: 350 },
  2941 |         wallet: { balance: 1127, availableBalance: 1127, reservedBalance: 0 },
  2942 |         dailyBonus: {
  2943 |           claimable: false,
  2944 |           claimedToday: true,
  2945 |           streakDay: 3,
  2946 |           todayAmount: 350,
  2947 |           tomorrowAmount: 400,
  2948 |           maxStreak: 7,
  2949 |           nextClaimAt: "2026-06-07T10:00:00.000Z",
  2950 |           lastClaimAt: "2026-06-04T10:00:00.000Z"
  2951 |         }
  2952 |       })
  2953 |     });
  2954 |   });
  2955 | 
  2956 |   let isAuthedMock = false;
  2957 |   await page.route("**/platform/game-token", async (route) => {
  2958 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  2959 |     const headers = {
  2960 |       "Access-Control-Allow-Origin": origin,
  2961 |       "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  2962 |       "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  2963 |       "Access-Control-Allow-Credentials": "true",
  2964 |       "Vary": "Origin"
  2965 |     };
  2966 |     if (!isAuthedMock) {
  2967 |       return route.fulfill({
  2968 |         status: 401,
  2969 |         contentType: "application/json",
  2970 |         headers,
  2971 |         body: JSON.stringify({ message: "Unauthorized" })
  2972 |       });
  2973 |     }
  2974 |     return route.fulfill({
  2975 |       status: 200,
  2976 |       contentType: "application/json",
  2977 |       headers,
  2978 |       body: JSON.stringify({
  2979 |         token: "test-token",
  2980 |         user: { id: "u-1", name: "Samir", email: "samir@example.com", role: "player" },
  2981 |         player: { id: "p-1", displayName: "Samir", avatarUrl: "", isGuest: false },
  2982 |         stats: { rating: 1234, points: 88, wins: 11, losses: 4, draws: 0, matchesPlayed: 15, currentStreak: 2, bestStreak: 5, titleCode: "rookie" },
  2983 |         wallet: { balance: mockBalance, availableBalance: mockBalance, spendableBalance: mockBalance, reservedBalance: 0 },
  2984 |         recentMatches: []
  2985 |       })
  2986 |     });
  2987 |   });
  2988 | 
  2989 |   await page.addInitScript(() => {
  2990 |     window.localStorage.removeItem("dominoPlatformGameToken");
  2991 |     window.localStorage.removeItem("dominoPlatformProfile");
  2992 |     window.localStorage.removeItem("dominoAuthProfile");
  2993 |   });
  2994 |   
  2995 |   await page.goto("/index.html");
  2996 |   const unauthedCard = page.locator("#daily-bonus-card");
  2997 |   await expect(unauthedCard).toHaveClass(/is-hidden/);
  2998 | 
  2999 |   isAuthedMock = true;
  3000 |   await page.evaluate(() => {
  3001 |     window.localStorage.setItem("dominoPlatformGameToken", "test-token");
  3002 |     window.localStorage.setItem("dominoPlatformProfile", JSON.stringify({
  3003 |       id: "p-1", displayName: "Samir", isGuest: false, coins: 777
  3004 |     }));
  3005 |     window.localStorage.setItem("dominoAuthProfile", JSON.stringify({
  3006 |       id: "p-1", name: "Samir", displayName: "Samir", isGuest: false
  3007 |     }));
  3008 |   });
  3009 | 
  3010 |   await page.goto("/index.html");
  3011 |   const card = page.locator("#daily-bonus-card");
> 3012 |   await expect(card).not.toHaveClass(/is-hidden/);
       |                          ^ Error: expect(locator).not.toHaveClass(expected) failed
  3013 |   await expect(page.locator("#daily-bonus-amount")).toContainText("+350");
  3014 | 
  3015 |   const claimBtn = page.locator("#daily-bonus-claim-btn");
  3016 |   await expect(claimBtn).toBeVisible();
  3017 |   await expect(claimBtn).toBeEnabled();
  3018 | 
  3019 |   await claimBtn.click();
  3020 |   await expect.poll(() => claimCalled).toBeTruthy();
  3021 |   await expect(claimBtn).toBeDisabled();
  3022 |   
  3023 |   await page.locator("#account-btn").click();
  3024 |   await expect(page.locator("#account-stats-grid")).toContainText(/1127/);
  3025 |   await page.locator("#account-modal-close").click();
  3026 | 
  3027 |   await expect(page.locator("#open-solo-modal-btn")).toBeEnabled();
  3028 |   await expect(page.locator("#open-online-modal-btn")).toBeEnabled();
  3029 |   await expect(page.locator("#open-rooms-btn")).toBeEnabled();
  3030 |   await expect(page.locator("#open-leaderboard-btn")).toBeEnabled();
  3031 | });
  3032 | 
  3033 | test("capture screenshots for review", async ({ page }) => {
  3034 |   await page.route("**/platform/game-token", async (route) => {
  3035 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  3036 |     const headers = {
  3037 |       "Access-Control-Allow-Origin": origin,
  3038 |       "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  3039 |       "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  3040 |       "Access-Control-Allow-Credentials": "true"
  3041 |     };
  3042 |     return route.fulfill({
  3043 |       status: 200,
  3044 |       contentType: "application/json",
  3045 |       headers,
  3046 |       body: JSON.stringify({
  3047 |         token: "test-token",
  3048 |         user: { id: "u-1", name: "Samir", email: "samir@example.com", role: "player" },
  3049 |         player: { id: "p-1", displayName: "Samir", avatarUrl: "", isGuest: false },
  3050 |         stats: { rating: 1234, points: 88, wins: 11, losses: 4, draws: 0, matchesPlayed: 15, currentStreak: 2, bestStreak: 5, titleCode: "rookie" },
  3051 |         wallet: { balance: 777, availableBalance: 777, spendableBalance: 777, reservedBalance: 0 },
  3052 |         recentMatches: []
  3053 |       })
  3054 |     });
  3055 |   });
  3056 | 
  3057 |   await page.route("**/social/friends", async (route) => {
  3058 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  3059 |     const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  3060 |     return route.fulfill({
  3061 |       status: 200,
  3062 |       contentType: "application/json",
  3063 |       headers,
  3064 |       body: JSON.stringify({
  3065 |         accepted: [
  3066 |           { id: "f-1", status: "accepted", friend: { id: "p-2", displayName: "Aleksey", avatarUrl: null, isGuest: false } },
  3067 |           { id: "f-2", status: "accepted", friend: { id: "p-3", displayName: "Katerina", avatarUrl: null, isGuest: false } }
  3068 |         ],
  3069 |         incoming: [
  3070 |           { id: "f-3", status: "pending", friend: { id: "p-4", displayName: "Dmitriy", avatarUrl: null, isGuest: false } }
  3071 |         ],
  3072 |         outgoing: []
  3073 |       })
  3074 |     });
  3075 |   });
  3076 | 
  3077 |   await page.route("**/social/messages", async (route) => {
  3078 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  3079 |     const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  3080 |     return route.fulfill({
  3081 |       status: 200,
  3082 |       contentType: "application/json",
  3083 |       headers,
  3084 |       body: JSON.stringify({
  3085 |         items: [
  3086 |           {
  3087 |             player: { id: "p-2", displayName: "Aleksey", avatarUrl: null, isGuest: false },
  3088 |             lastMessage: { id: "m-1", senderPlayerId: "p-2", receiverPlayerId: "p-1", text: "Привет! Отличная победа! 🏆", createdAt: "2026-06-04T10:20:00.000Z" },
  3089 |             unreadCount: 2
  3090 |           }
  3091 |         ]
  3092 |       })
  3093 |     });
  3094 |   });
  3095 | 
  3096 |   await page.route("**/social/messages/p-2", async (route) => {
  3097 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  3098 |     const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  3099 |     return route.fulfill({
  3100 |       status: 200,
  3101 |       contentType: "application/json",
  3102 |       headers,
  3103 |       body: JSON.stringify({
  3104 |         items: [
  3105 |           { id: "m-1", senderPlayerId: "p-2", receiverPlayerId: "p-1", text: "Привет! 👋 Как прошёл турнир?", createdAt: "2026-06-04T10:20:00.000Z" },
  3106 |           { id: "m-2", senderPlayerId: "p-1", receiverPlayerId: "p-2", text: "Привет! Отлично! 💪 Удалось занять 3 место!", createdAt: "2026-06-04T10:21:00.000Z" },
  3107 |           { id: "m-3", senderPlayerId: "p-2", receiverPlayerId: "p-1", text: "Вау, поздравляю! 🏆 Это было непросто!", createdAt: "2026-06-04T10:22:00.000Z" }
  3108 |         ]
  3109 |       })
  3110 |     });
  3111 |   });
  3112 | 
```