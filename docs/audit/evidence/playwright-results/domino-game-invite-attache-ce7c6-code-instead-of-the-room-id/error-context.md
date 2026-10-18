# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> game invite attaches the resolved room code instead of the room id
- Location: e2e/domino.spec.mjs:2855:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: null
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e70]: "+15"
    - generic [ref=e72]: DOMINO
    - generic [ref=e74]: © Domino Telefon Simplesoft 2026
  - generic [ref=e75]:
    - generic [ref=e77]:
      - combobox "Language" [ref=e78] [cursor=pointer]:
        - option "AZ"
        - option "RU"
        - option "EN" [selected]
      - text: ▾
    - generic [ref=e80]:
      - generic [ref=e81]:
        - paragraph [ref=e82]: Access
        - heading "Sign in to your account" [level=2] [ref=e83]
        - paragraph [ref=e84]: Use your account to keep rating, match history, and Google login in one place.
      - generic [ref=e85]:
        - button "Continue with Google" [ref=e86] [cursor=pointer]:
          - img [ref=e88]
          - generic [ref=e93]: Continue with Google
        - button "Continue with Apple" [ref=e94] [cursor=pointer]:
          - img [ref=e96]
          - generic [ref=e98]: Continue with Apple
      - generic [ref=e99]: Sign in to continue
      - paragraph [ref=e100]:
        - text: By continuing, you agree to the
        - link "Terms of Service" [ref=e101] [cursor=pointer]:
          - /url: terms.html
        - text: and
        - link "Privacy Policy" [ref=e102] [cursor=pointer]:
          - /url: privacy.html
        - text: and
        - link "Rules of Conduct" [ref=e103] [cursor=pointer]:
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
  2788 |   });
  2789 | 
  2790 |   expect(result.roomId).toBe("restored-room");
  2791 |   expect(result.calls).toEqual(expect.arrayContaining(["clear-token", "clear-state", "restore-empty"]));
  2792 |   expect(result.calls).not.toContain("failed");
  2793 |   expect(result.reconnectAttempt).toBe(0);
  2794 |   expect(result.storedToken).toBe("");
  2795 | });
  2796 | 
  2797 | test("resume banner renders stored session state", async ({ page }) => {
  2798 |   await page.goto("/index.html");
  2799 |   await page.evaluate(() => {
  2800 |     const banner = document.getElementById("resume-session-banner") ?? document.createElement("section");
  2801 |     banner.id = "resume-session-banner";
  2802 |     banner.className = "resume-session-banner";
  2803 |     banner.innerHTML = `
  2804 |       <div class="resume-session-copy">
  2805 |         <div id="resume-session-title" class="resume-session-title">Unfinished online session</div>
  2806 |         <div id="resume-session-details" class="resume-session-details">Room room-1</div>
  2807 |       </div>
  2808 |       <button id="resume-session-btn" class="btn btn-primary">Resume</button>
  2809 |     `;
  2810 |     banner.classList.remove("is-hidden");
  2811 |     document.body.appendChild(banner);
  2812 |   });
  2813 | 
  2814 |   const banner = page.locator("#resume-session-banner");
  2815 |   await expect(banner).not.toHaveClass(/is-hidden/);
  2816 |   await expect(page.locator("#resume-session-title")).toContainText(/unfinished|sessiya/i);
  2817 | });
  2818 | test("team score names open the player profile modal above the table", async ({ page }) => {
  2819 |   await page.goto("/index.html");
  2820 |   const result = await page.evaluate(() => {
  2821 |     const dominoGame = typeof game !== "undefined" ? game : window.game;
  2822 |     if (!dominoGame) return null;
  2823 |     dominoGame.roomPlayerRefs = [
  2824 |       { playerId: "p-1", displayName: "Samir", isBot: false },
  2825 |       { playerId: "bot-1", displayName: "AI", isBot: true },
  2826 |       { playerId: "p-2", displayName: "Alice", isBot: false },
  2827 |       { playerId: "bot-2", displayName: "AI 2", isBot: true }
  2828 |     ];
  2829 |     dominoGame.playerNames = ["Samir", "AI", "Alice", "AI 2"];
  2830 |     dominoGame.teamScores = [12, 8];
  2831 |     dominoGame.teamRoundWins = [1, 0];
  2832 |     dominoGame.isTeamMode = true;
  2833 |     dominoGame.currentPlayer = 0;
  2834 |     dominoGame.playerCount = 4;
  2835 |     dominoGame.renderer.renderScores([
  2836 |       { name: dominoGame.getTeamDisplayName(0), score: 12, roundWins: 1, index: 0, playerId: "p-1", isBot: false },
  2837 |       { name: dominoGame.getTeamDisplayName(1), score: 8, roundWins: 0, index: 1, playerId: "p-2", isBot: false }
  2838 |     ], 0);
  2839 |     const buttons = Array.from(document.querySelectorAll("#scores-bar .score-name-button"));
  2840 |     buttons[0]?.click();
  2841 |     const modal = document.getElementById("player-profile-modal");
  2842 |     return {
  2843 |       buttonCount: buttons.length,
  2844 |       modalActive: Boolean(modal?.classList.contains("active")),
  2845 |       modalZ: window.getComputedStyle(modal || document.body).zIndex
  2846 |     };
  2847 |   });
  2848 | 
  2849 |   expect(result).toBeTruthy();
  2850 |   expect(result.buttonCount).toBe(2);
  2851 |   expect(result.modalActive).toBe(true);
  2852 |   expect(result.modalZ).toBe("32000");
  2853 | });
  2854 | 
  2855 | test("game invite attaches the resolved room code instead of the room id", async ({ page }) => {
  2856 |   await page.goto("/index.html");
  2857 |   const payload = await page.evaluate(async () => {
  2858 |     const dominoGame = typeof game !== "undefined" ? game : window.game;
  2859 |     if (!dominoGame) return null;
  2860 |     dominoGame.gameInviteState = {
  2861 |       inviteId: "invite-1",
  2862 |       inviteePlayerId: "player-2",
  2863 |       inviteeDisplayName: "Alice",
  2864 |       sessionId: "session-1",
  2865 |       role: "inviter",
  2866 |       roomLinked: false,
  2867 |       createPromptShown: false,
  2868 |       waitingPromptShown: false
  2869 |     };
  2870 |     dominoGame.getCurrentRoomSnapshot = () => ({
  2871 |       roomMode: "ffa",
  2872 |       stakeKey: "stake_200",
  2873 |       stakeAmount: 200,
  2874 |       humanSeats: 2,
  2875 |       totalPlayers: 2,
  2876 |       isTeamMode: false
  2877 |     });
  2878 |     dominoGame.network.resolveRoomCode = async (roomId) => (String(roomId || "") === "room-123" ? "ABCD" : null);
  2879 |     let captured = null;
  2880 |     dominoGame.account.inviteFriendToRoom = async (_sessionId, nextPayload) => {
  2881 |       captured = nextPayload;
  2882 |       return { item: { id: "invite-2", roomCode: nextPayload.roomCode } };
  2883 |     };
  2884 |     await dominoGame.attachGameInviteRoom("room-123");
  2885 |     return captured;
  2886 |   });
  2887 | 
> 2888 |   expect(payload).toBeTruthy();
       |                   ^ Error: expect(received).toBeTruthy()
  2889 |   expect(payload.roomCode).toBe("ABCD");
  2890 | });
  2891 | 
  2892 | test("daily bonus flow: visible only when authed, handles status loading and claim successfully", async ({ page }) => {
  2893 |   let claimCalled = false;
  2894 |   let mockBalance = 777;
  2895 |   let dailyBonusClaimedToday = false;
  2896 |   
  2897 |   await page.route("**/economy/daily-bonus/status", async (route) => {
  2898 |     const origin = route.request().headers().origin ?? "http://127.0.0.1:4173";
  2899 |     const headers = {
  2900 |       "Access-Control-Allow-Origin": origin,
  2901 |       "Access-Control-Allow-Credentials": "true"
  2902 |     };
  2903 |     return route.fulfill({
  2904 |       status: 200,
  2905 |       contentType: "application/json",
  2906 |       headers,
  2907 |       body: JSON.stringify({
  2908 |         wallet: { balance: mockBalance, availableBalance: mockBalance, reservedBalance: 0 },
  2909 |         dailyBonus: {
  2910 |           claimable: !dailyBonusClaimedToday,
  2911 |           claimedToday: dailyBonusClaimedToday,
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
```