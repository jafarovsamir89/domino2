package az.simplesoft.dominotelefon;

import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.mediation.LevelPlay;
import com.unity3d.mediation.LevelPlayAdError;
import com.unity3d.mediation.LevelPlayAdInfo;
import com.unity3d.mediation.LevelPlayConfiguration;
import com.unity3d.mediation.LevelPlayInitError;
import com.unity3d.mediation.LevelPlayInitListener;
import com.unity3d.mediation.LevelPlayInitRequest;
import com.unity3d.mediation.LevelPlayPrivacySettings;
import com.unity3d.mediation.rewarded.LevelPlayReward;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAd;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAdListener;

/** Audit-only bridge, copied only with --rewarded-flow. No wallet or S2S secret.
 * LOAD/SHOW is compile-time disabled until real-network test mode is verified.
 */
@CapacitorPlugin(name = "DominoRewardedFlow")
public final class DominoRewardedFlowPlugin extends Plugin {
    private static final RewardedFlowState STATE = RewardedFlowState.shared();
    private static final LevelPlayRewardedAdListener NOOP = new LevelPlayRewardedAdListener() {
        @Override public void onAdLoaded(LevelPlayAdInfo info) {}
        @Override public void onAdLoadFailed(LevelPlayAdError error) {}
        @Override public void onAdDisplayed(LevelPlayAdInfo info) {}
        @Override public void onAdRewarded(LevelPlayReward reward, LevelPlayAdInfo info) {}
    };
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PluginCall pendingBind, pendingShow;
    private LevelPlayRewardedAd ad;
    private long initTicket, loadTicket, showTicket;
    private Runnable watchdog;
    private boolean destroyed;

    private boolean trustedNow() {
        try {
            return !destroyed && RewardedFlowState.trusted(getContext().getPackageName(),
                (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0,
                getBridge().getWebView().getUrl());
        } catch (RuntimeException unavailable) { return false; }
    }
    private boolean allowed(PluginCall call) {
        if (trustedNow()) return true;
        call.reject("audit_page_required"); return false;
    }
    private JSObject state() {
        JSObject result = new JSObject();
        result.put("phase", STATE.phase()); result.put("playbackRewarded", STATE.playbackRewarded());
        result.put("loadShowEnabled", BuildConfig.DOMINO_REWARDED_FLOW_SHOW);
        result.put("walletEnabled", false); return result;
    }
    private void publish() { if (trustedNow()) notifyListeners("playbackState", state()); }
    private void retain(PluginCall call) { call.setKeepAlive(true); getBridge().saveCall(call); }
    private void finishBind(String error, String id) {
        PluginCall call = pendingBind; pendingBind = null;
        if (call == null) return;
        call.setKeepAlive(false);
        if (error != null || !trustedNow()) call.reject(error != null ? error : "audit_page_changed");
        else { JSObject value = new JSObject(); value.put("bound", true); value.put("attemptId", id); call.resolve(value); }
        call.release(getBridge());
    }
    private void finishShow(String error) {
        PluginCall call = pendingShow; pendingShow = null;
        if (call == null) return;
        call.setKeepAlive(false);
        if (error != null || !trustedNow()) call.reject(error != null ? error : "audit_page_changed");
        else { JSObject value = new JSObject(); value.put("closed", true); value.put("playbackRewarded", STATE.playbackRewarded()); call.resolve(value); }
        call.release(getBridge());
    }
    private void disarm() { if (watchdog != null) handler.removeCallbacks(watchdog); watchdog = null; }
    private void arm(long ticket, long delay) {
        disarm(); watchdog = () -> {
            if (!STATE.fail(ticket)) return;
            finishBind("native_timeout", null); finishShow("native_timeout"); publish();
        };
        handler.postDelayed(watchdog, Math.max(1, delay));
    }
    @PluginMethod public void status(PluginCall call) {
        handler.post(() -> { if (allowed(call)) call.resolve(state()); });
    }
    @PluginMethod public void bindAttempt(PluginCall call) {
        handler.post(() -> {
            if (!allowed(call)) return;
            if (!Boolean.TRUE.equals(call.getBoolean("adultOwner")) || !Boolean.TRUE.equals(call.getBoolean("testAccepted"))) {
                call.reject("adult_test_confirmation_required"); return;
            }
            final String id = call.getString("attemptId");
            try {
                initTicket = STATE.bind(id, RewardedFlowState.parseExpiry(call.getString("expiresAt")), System.currentTimeMillis());
                if (initTicket == 0) { JSObject value = new JSObject(); value.put("bound", true); value.put("attemptId", id); call.resolve(value); return; }
            } catch (IllegalStateException denied) { call.reject(denied.getMessage()); return; }
            final long operation = initTicket;
            pendingBind = call; retain(call); arm(operation, 30000); publish();
            try {
                // Same restrictive adult diagnostic signals as S041, not a release consent solution.
                LevelPlayPrivacySettings.setGDPRConsent(false); LevelPlayPrivacySettings.setCCPA(true); LevelPlayPrivacySettings.setCOPPA(false);
                LevelPlay.setMetaData("is_test_suite", "enable"); // Enables diagnostics; NOT proof that normal auction ads are Test.
                LevelPlay.init(getContext().getApplicationContext(), new LevelPlayInitRequest.Builder("28e969915").withUserId(id).build(), new LevelPlayInitListener() {
                    @Override public void onInitFailed(LevelPlayInitError error) { handler.post(() -> { if (STATE.fail(operation)) { disarm(); finishBind("native_init_failed", null); publish(); } }); }
                    @Override public void onInitSuccess(LevelPlayConfiguration configuration) { handler.post(() -> {
                        if (!trustedNow()) { STATE.abandon(); disarm(); finishBind("audit_page_changed", null); return; }
                        if (!STATE.initialized(operation)) return;
                        disarm();
                        try { ad = new LevelPlayRewardedAd("ssq6gr0sac12hwf1"); ad.setListener(listener); finishBind(null, id); publish(); }
                        catch (RuntimeException failed) { STATE.abandon(); finishBind("native_init_failed", null); publish(); }
                    }); }
                });
            } catch (RuntimeException failed) { STATE.fail(operation); disarm(); finishBind("native_init_failed", null); publish(); }
        });
    }
    @PluginMethod public void show(PluginCall call) {
        handler.post(() -> {
            if (!allowed(call)) return;
            // Metadata is_test_suite enables a tool, not normal-ad test mode. Fail closed.
            if (!BuildConfig.DOMINO_REWARDED_FLOW_SHOW) { call.reject("review_show_disabled"); return; }
            try {
                if (ad == null) throw new IllegalStateException("native_not_ready");
                loadTicket = STATE.beginShow(call.getString("attemptId"), System.currentTimeMillis());
            } catch (IllegalStateException denied) { call.reject(denied.getMessage()); return; }
            pendingShow = call; retain(call); arm(loadTicket, Math.min(30000, STATE.remaining(System.currentTimeMillis()))); publish();
            try { ad.loadAd(); } catch (RuntimeException failed) { STATE.fail(loadTicket); disarm(); finishShow("native_load_failed"); publish(); }
        });
    }
    private final LevelPlayRewardedAdListener listener = new LevelPlayRewardedAdListener() {
        @Override public void onAdLoaded(LevelPlayAdInfo info) { handler.post(() -> {
            if (!trustedNow()) { STATE.abandon(); disarm(); finishShow("audit_page_changed"); return; }
            if (!ad.isAdReady()) { if (STATE.fail(loadTicket)) { disarm(); finishShow("native_load_failed"); publish(); } return; }
            long operation = STATE.loaded(loadTicket, System.currentTimeMillis());
            if (operation < 0) { if ("failed".equals(STATE.phase())) { disarm(); finishShow("attempt_expired"); } return; }
            showTicket = operation; arm(operation, Math.min(180000, STATE.remaining(System.currentTimeMillis()))); publish();
            try { ad.showAd(getActivity()); } catch (RuntimeException failed) { STATE.fail(operation); disarm(); finishShow("native_show_failed"); publish(); }
        }); }
        @Override public void onAdLoadFailed(LevelPlayAdError error) { handler.post(() -> { if (STATE.fail(loadTicket)) { disarm(); finishShow("native_load_failed"); publish(); } }); }
        @Override public void onAdDisplayed(LevelPlayAdInfo info) { handler.post(() -> publish()); }
        @Override public void onAdDisplayFailed(LevelPlayAdError error, LevelPlayAdInfo info) { handler.post(() -> { if (STATE.fail(showTicket)) { disarm(); finishShow("native_show_failed"); publish(); } }); }
        @Override public void onAdClosed(LevelPlayAdInfo info) { handler.post(() -> { if (STATE.closed(showTicket)) { disarm(); finishShow(null); publish(); } }); }
        @Override public void onAdRewarded(LevelPlayReward reward, LevelPlayAdInfo info) { handler.post(() -> {
            // Informational playback only, including reward-after-close. No amount/coins/grant.
            if (STATE.rewarded(showTicket)) publish();
        }); }
    };
    @Override protected void handleOnDestroy() {
        destroyed = true; STATE.abandon(); disarm();
        finishBind("native_owner_destroyed", null); finishShow("native_owner_destroyed");
        if (ad != null) ad.setListener(NOOP);
        super.handleOnDestroy();
    }
}
