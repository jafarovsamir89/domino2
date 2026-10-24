package az.simplesoft.dominotelefon;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/** Process-lifetime binding and callback ordering; never a wallet/reward authority. */
final class RewardedFlowState {
    private static final RewardedFlowState SHARED = new RewardedFlowState();
    enum Phase { IDLE, INITIALIZING, READY, LOADING, SHOWING, CLOSED, FAILED }
    private String attemptId;
    private long expiresAt, ticket;
    private Phase phase = Phase.IDLE;
    private boolean playbackRewarded;

    static RewardedFlowState shared() { return SHARED; }
    static boolean trusted(String packageName, boolean debug, String url) {
        return debug && "az.simplesoft.dominotelefon.audit".equals(packageName)
            && "https://localhost/review/rewarded-flow.html".equals(url);
    }
    static long parseExpiry(String value) {
        try {
            if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z")) throw new Exception();
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
            format.setTimeZone(TimeZone.getTimeZone("UTC")); format.setLenient(false);
            return format.parse(value).getTime();
        } catch (Exception invalid) { throw new IllegalStateException("invalid_attempt"); }
    }
    synchronized long bind(String id, long expiry, long now) {
        if (id == null || !id.matches("[a-f0-9]{64}") || expiry <= now || expiry - now > 660000) throw new IllegalStateException("invalid_attempt");
        if (attemptId != null) {
            if (!attemptId.equals(id) || expiresAt != expiry) throw new IllegalStateException("native_binding_conflict");
            if (phase == Phase.READY) return 0; // Reuse the existing initialization, not a second init.
            throw new IllegalStateException("native_not_ready");
        }
        attemptId = id; expiresAt = expiry; phase = Phase.INITIALIZING;
        return ++ticket;
    }
    synchronized boolean initialized(long expected) {
        if (ticket != expected || phase != Phase.INITIALIZING) return false;
        phase = Phase.READY; return true;
    }
    synchronized long beginShow(String id, long now) {
        if (attemptId == null || !attemptId.equals(id)) throw new IllegalStateException("native_binding_conflict");
        if (expiresAt <= now) throw new IllegalStateException("attempt_expired");
        if (phase != Phase.READY) throw new IllegalStateException("native_not_ready");
        phase = Phase.LOADING; return ++ticket;
    }
    synchronized long loaded(long expected, long now) {
        if (ticket != expected || phase != Phase.LOADING) return -1;
        if (expiresAt <= now) { phase = Phase.FAILED; return -1; }
        phase = Phase.SHOWING; return ++ticket;
    }
    synchronized boolean closed(long expected) {
        if (ticket != expected || phase != Phase.SHOWING) return false;
        phase = Phase.CLOSED; return true;
    }
    synchronized boolean rewarded(long expected) {
        if (ticket != expected || (phase != Phase.SHOWING && phase != Phase.CLOSED) || playbackRewarded) return false;
        playbackRewarded = true; return true;
    }
    synchronized boolean fail(long expected) {
        if (ticket != expected || (phase != Phase.INITIALIZING && phase != Phase.LOADING && phase != Phase.SHOWING)) return false;
        phase = Phase.FAILED; return true;
    }
    synchronized void abandon() {
        if (attemptId != null) { phase = Phase.FAILED; ++ticket; }
    }
    synchronized String phase() { return phase.name().toLowerCase(Locale.ROOT); }
    synchronized long remaining(long now) { return Math.max(0, expiresAt - now); }
    synchronized boolean playbackRewarded() { return playbackRewarded; }
}
