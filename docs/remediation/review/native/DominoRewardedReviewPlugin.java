package az.simplesoft.dominotelefon;

import android.content.pm.ApplicationInfo;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.mediation.LevelPlay;
import com.unity3d.mediation.LevelPlayConfiguration;
import com.unity3d.mediation.LevelPlayInitError;
import com.unity3d.mediation.LevelPlayInitListener;
import com.unity3d.mediation.LevelPlayInitRequest;
import com.unity3d.mediation.LevelPlayPrivacySettings;
import java.util.UUID;

/** Copied into the isolated .audit build only. No client reward or wallet API. */
@CapacitorPlugin(name = "DominoRewardedReview")
public final class DominoRewardedReviewPlugin extends Plugin {
    private String phase = "idle";
    private int errorCode;
    private final String syntheticUser = "review" + UUID.randomUUID().toString().replace("-", "");

    private boolean allowed(PluginCall call) {
        Uri url = Uri.parse(getBridge().getWebView().getUrl());
        boolean valid = "az.simplesoft.dominotelefon.audit".equals(getContext().getPackageName())
            && (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
            && "https".equals(url.getScheme()) && "localhost".equals(url.getHost())
            && url.getPort() == -1 && "/review/rewarded.html".equals(url.getPath());
        if (!valid) call.reject("Only the local audit diagnostic page may use this plugin");
        return valid;
    }
    private JSObject state() {
        JSObject value = new JSObject();
        value.put("phase", phase);
        value.put("sdk", "9.5.0");
        value.put("errorCode", errorCode);
        value.put("walletEnabled", false);
        return value;
    }
    private void publish() { notifyListeners("stateChange", state()); }

    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> { if (allowed(call)) call.resolve(state()); });
    }
    @PluginMethod public void initializeTestSuite(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!allowed(call)) return;
            if (!Boolean.TRUE.equals(call.getBoolean("adultOwner"))
                || !Boolean.TRUE.equals(call.getBoolean("testAccepted"))) {
                call.reject("Adult owner confirmation and test acceptance required");
                return;
            }
            if (!"idle".equals(phase)) { call.resolve(state()); return; }
            // Restrictive privacy signals precede initialization. No age inference for real players.
            LevelPlayPrivacySettings.setGDPRConsent(false);
            LevelPlayPrivacySettings.setCCPA(true);
            LevelPlayPrivacySettings.setCOPPA(false); // This diagnostic is adult-owner only.
            LevelPlay.setMetaData("is_test_suite", "enable");
            phase = "initializing";
            call.resolve(state());
            LevelPlay.init(getContext().getApplicationContext(),
                new LevelPlayInitRequest.Builder("28e969915").withUserId(syntheticUser).build(),
                new LevelPlayInitListener() {
                    @Override public void onInitFailed(LevelPlayInitError error) {
                        getActivity().runOnUiThread(() -> {
                            errorCode = error.getErrorCode(); phase = "failed"; publish();
                        });
                    }
                    @Override public void onInitSuccess(LevelPlayConfiguration configuration) {
                        getActivity().runOnUiThread(() -> { phase = "ready"; publish(); });
                    }
                });
        });
    }
    @PluginMethod public void openTestSuite(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!allowed(call)) return;
            if (!"ready".equals(phase)) { call.reject("Initialization has not succeeded"); return; }
            // No normal load/show API is called: only the provider's diagnostic UI.
            LevelPlay.launchTestSuite(getContext().getApplicationContext());
            call.resolve(state());
        });
    }
}
