# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> expired seat reservation reconnect falls back to snapshot restore without retry spam
- Location: e2e/domino.spec.mjs:2735:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

Expected: ArrayContaining ["clear-token", "clear-state", "restore-empty"]
Received: ["restore-token"]
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
  2691 |     window.setInterval = (fn, delay) => {
  2692 |       const handle = { fn, delay };
  2693 |       timers.push(handle);
  2694 |       return handle;
  2695 |     };
  2696 |     window.clearInterval = () => {};
  2697 | 
  2698 |     try {
  2699 |       game.serverTimeOffsetMs = 5000;
  2700 |       game.lastServerTimeSyncAt = Date.now();
  2701 |       game.turnTimeoutMs = 30000;
  2702 |       game.activeTurnDeadlineAt = 0;
  2703 |       game.activeTurnVersionForTimer = 0;
  2704 |       game.activeTurnPlayerIndexForTimer = -1;
  2705 | 
  2706 |       game.startTurnTimer(1035000, 2, 1);
  2707 |       const initialRemaining = game.turnDeadlineAt - game.getSyncedNow();
  2708 |       const firstHandle = game._turnTimeoutId;
  2709 | 
  2710 |       game.startTurnTimer(1035000, 2, 1);
  2711 |       const sameHandle = firstHandle === game._turnTimeoutId;
  2712 | 
  2713 |       game.startTurnTimer(1040000, 3, 1);
  2714 |       const restarted = firstHandle !== game._turnTimeoutId;
  2715 | 
  2716 |       return {
  2717 |         initialRemaining,
  2718 |         sameHandle,
  2719 |         restarted
  2720 |       };
  2721 |     } finally {
  2722 |       Date.now = originalNow;
  2723 |       window.setTimeout = originalSetTimeout;
  2724 |       window.clearTimeout = originalClearTimeout;
  2725 |       window.setInterval = originalSetInterval;
  2726 |       window.clearInterval = originalClearInterval;
  2727 |     }
  2728 |   });
  2729 | 
  2730 |   expect(Math.abs(result.initialRemaining - 30000)).toBeLessThanOrEqual(250);
  2731 |   expect(result.sameHandle).toBe(true);
  2732 |   expect(result.restarted).toBe(true);
  2733 | });
  2734 | 
  2735 | test("expired seat reservation reconnect falls back to snapshot restore without retry spam", async ({ page }) => {
  2736 |   await page.goto("/index.html");
  2737 |   const result = await page.evaluate(async () => {
  2738 |     const NetworkManagerCtor = window.NetworkManager;
  2739 |     if (!NetworkManagerCtor) throw new Error("missing_network_manager");
  2740 | 
  2741 |     const calls = [];
  2742 |     const network = new NetworkManagerCtor({
  2743 |       account: window.game?.account || null,
  2744 |       onNetworkReconnectFailed: () => calls.push("failed"),
  2745 |       voice: {},
  2746 |       playerName: "Alice",
  2747 |       isTeamMode: false,
  2748 |       onlinePlayerCount: 2,
  2749 |       onlineAiCount: 0
  2750 |     });
  2751 | 
  2752 |     network.initClient = async () => true;
  2753 |     network.client = {
  2754 |       reconnect: async () => {
  2755 |         const error = new Error("524 seat reservation expired");
  2756 |         error.code = 524;
  2757 |         throw error;
  2758 |       }
  2759 |     };
  2760 |     network.clearReconnectTimer = () => {};
  2761 |     network.clearReconnectState = () => {
  2762 |       calls.push("clear-state");
  2763 |       network.reconnectAttempt = 0;
  2764 |       network.reconnectInProgress = false;
  2765 |     };
  2766 |     network.setStoredReconnectionToken = (token) => {
  2767 |       calls.push(token ? "store" : "clear-token");
  2768 |     };
  2769 |     network.restoreRoomFromSnapshot = async (_snapshot, reconnectionToken) => {
  2770 |       calls.push(reconnectionToken === "" ? "restore-empty" : "restore-token");
  2771 |       return { roomId: "restored-room" };
  2772 |     };
  2773 |     network.activateRoom = (room) => room;
  2774 | 
  2775 |     const room = await network.resumeRoom("expired-token", {
  2776 |       roomCode: "ABCD",
  2777 |       roomId: "room-1",
  2778 |       sessionId: "session-1",
  2779 |       playerName: "Alice"
  2780 |     });
  2781 | 
  2782 |     return {
  2783 |       calls,
  2784 |       roomId: room?.roomId || "",
  2785 |       reconnectAttempt: network.reconnectAttempt,
  2786 |       storedToken: network.getStoredReconnectionToken?.() || ""
  2787 |     };
  2788 |   });
  2789 | 
  2790 |   expect(result.roomId).toBe("restored-room");
> 2791 |   expect(result.calls).toEqual(expect.arrayContaining(["clear-token", "clear-state", "restore-empty"]));
       |                        ^ Error: expect(received).toEqual(expected) // deep equality
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
  2888 |   expect(payload).toBeTruthy();
  2889 |   expect(payload.roomCode).toBe("ABCD");
  2890 | });
  2891 | 
```