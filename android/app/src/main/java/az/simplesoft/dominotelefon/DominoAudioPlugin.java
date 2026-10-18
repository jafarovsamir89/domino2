package az.simplesoft.dominotelefon;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Activity lifecycle for Web Audio/HTMLAudio, including WebViews that stay visible in background.
 * System media focus remains owned by Chromium; a second AudioManager request would compete with it.
 */
@CapacitorPlugin(name = "DominoAudio")
public class DominoAudioPlugin extends Plugin {
    private boolean foreground = true;
    private boolean enabled;

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("active", foreground && enabled);
        result.put("foreground", foreground);
        return result;
    }
    private void publish() { notifyListeners("stateChange", state(), true); }

    @PluginMethod public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            publish();
            call.resolve(state());
        });
    }
    @Override protected void handleOnPause() { foreground = false; publish(); }
    @Override protected void handleOnResume() { foreground = true; publish(); }
}
