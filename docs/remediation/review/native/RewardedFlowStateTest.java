package az.simplesoft.dominotelefon;

import org.junit.Test;
import static org.junit.Assert.*;

public class RewardedFlowStateTest {
    private static final String ID = "a".repeat(64), OTHER = "b".repeat(64);
    private static final long NOW = 1800000000000L;
    private interface Action { void run(); }
    private static void fails(String code, Action action) {
        try { action.run(); fail("Expected " + code); }
        catch (IllegalStateException expected) { assertEquals(code, expected.getMessage()); }
    }
    @Test public void onlyExactAuditDebugPageIsAllowed() {
        String url = "https://localhost/review/rewarded-flow.html";
        assertTrue(RewardedFlowState.trusted("az.simplesoft.dominotelefon.audit", true, url));
        assertFalse(RewardedFlowState.trusted("az.simplesoft.dominotelefon", true, url));
        assertFalse(RewardedFlowState.trusted("az.simplesoft.dominotelefon.audit", false, url));
        for (String bad : new String[] {null, "https://localhost/index.html", "http://localhost/review/rewarded-flow.html", url + "?x=1", url + "#x", "https://localhost:443/review/rewarded-flow.html", "https://user@localhost/review/rewarded-flow.html", "https://localhost.evil.invalid/review/rewarded-flow.html", "https://localhost/review/%72ewarded-flow.html"}) assertFalse(String.valueOf(bad), RewardedFlowState.trusted("az.simplesoft.dominotelefon.audit", true, bad));
    }
    @Test public void malformedExpiredOrOverlongAttemptNeverBinds() {
        RewardedFlowState state = new RewardedFlowState();
        for (String bad : new String[] {null, "", "fake", ID + "x"}) fails("invalid_attempt", () -> state.bind(bad, NOW + 60000, NOW));
        fails("invalid_attempt", () -> state.bind(ID, NOW, NOW));
        fails("invalid_attempt", () -> state.bind(ID, NOW + 660001, NOW));
        assertEquals("idle", state.phase());
        assertEquals(1800000000000L, RewardedFlowState.parseExpiry("2027-01-15T08:00:00.000Z"));
        for (String bad : new String[] {null, "2026-02-31T01:00:00.000Z", "2026-10-24T01:00:00.000Ztail", "not a date"}) fails("invalid_attempt", () -> RewardedFlowState.parseExpiry(bad));
    }
    @Test public void oneInitBindingIsReusedButCanNeverChangeIdentityOrExtendItsExpiry() {
        RewardedFlowState state = new RewardedFlowState(); long ticket = state.bind(ID, NOW + 60000, NOW);
        fails("native_binding_conflict", () -> state.bind(OTHER, NOW + 60000, NOW));
        fails("native_not_ready", () -> state.bind(ID, NOW + 60000, NOW));
        assertTrue(state.initialized(ticket)); assertEquals(0, state.bind(ID, NOW + 60000, NOW));
        fails("native_binding_conflict", () -> state.bind(ID, NOW + 60001, NOW));
    }
    @Test public void sharedRuntimeRetainsBindingAcrossNewAccessors() {
        RewardedFlowState first = RewardedFlowState.shared(), second = RewardedFlowState.shared();
        assertSame(first, second); first.bind(ID, NOW + 60000, NOW);
        fails("native_binding_conflict", () -> second.bind(OTHER, NOW + 60000, NOW));
        first.abandon(); fails("native_binding_conflict", () -> second.bind(OTHER, NOW + 60000, NOW));
    }
    @Test public void showRequiresReadyMatchingUnexpiredAttemptAndCannotRepeat() {
        RewardedFlowState state = new RewardedFlowState(); long init = state.bind(ID, NOW + 60000, NOW);
        fails("native_not_ready", () -> state.beginShow(ID, NOW)); assertTrue(state.initialized(init));
        fails("native_binding_conflict", () -> state.beginShow(OTHER, NOW));
        fails("attempt_expired", () -> state.beginShow(ID, NOW + 60000));
        long load = state.beginShow(ID, NOW); fails("native_not_ready", () -> state.beginShow(ID, NOW));
        long show = state.loaded(load, NOW); assertTrue(show > load); assertTrue(state.closed(show));
        fails("native_not_ready", () -> state.beginShow(ID, NOW));
    }
    @Test public void rewardCanArriveBeforeOrAfterCloseButNeitherIsAWalletGrant() {
        for (boolean before : new boolean[] {true, false}) {
            RewardedFlowState state = new RewardedFlowState(); long init = state.bind(ID, NOW + 60000, NOW); state.initialized(init);
            long show = state.loaded(state.beginShow(ID, NOW), NOW);
            if (before) assertTrue(state.rewarded(show));
            assertTrue(state.closed(show)); assertFalse(state.closed(show));
            if (!before) assertTrue(state.rewarded(show));
            assertFalse(state.rewarded(show)); assertEquals("closed", state.phase()); assertTrue(state.playbackRewarded());
        }
    }
    @Test public void staleWatchdogsDoNotFailAChangedStageAndTimeoutNeverReleasesBinding() {
        RewardedFlowState state = new RewardedFlowState(); long init = state.bind(ID, NOW + 60000, NOW); state.initialized(init);
        long load = state.beginShow(ID, NOW); assertFalse(state.fail(init));
        long show = state.loaded(load, NOW); assertFalse(state.fail(load)); assertTrue(state.fail(show));
        assertFalse(state.closed(show)); assertFalse(state.rewarded(show));
        fails("native_binding_conflict", () -> state.bind(OTHER, NOW + 60000, NOW));
    }
    @Test public void destroyingOwnerRejectsLateCallbacksAndKeepsTheNativeIdentityPinned() {
        RewardedFlowState state = new RewardedFlowState(); long init = state.bind(ID, NOW + 60000, NOW); state.abandon();
        assertFalse(state.initialized(init)); assertEquals("failed", state.phase());
        fails("native_binding_conflict", () -> state.bind(OTHER, NOW + 60000, NOW));
        fails("native_not_ready", () -> state.bind(ID, NOW + 60000, NOW));
    }
    @Test public void expiryDuringLoadingCannotBecomeAShow() {
        RewardedFlowState state = new RewardedFlowState(); long init = state.bind(ID, NOW + 60000, NOW); state.initialized(init);
        long load = state.beginShow(ID, NOW); assertEquals(-1, state.loaded(load, NOW + 60000)); assertEquals("failed", state.phase());
    }
}
