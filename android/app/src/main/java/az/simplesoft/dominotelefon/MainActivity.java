package az.simplesoft.dominotelefon;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int REQ_RECORD_AUDIO = 9401;
    private PermissionRequest pendingAudioPermissionRequest;
    private String pendingAudioPermissionOrigin;

    private boolean isTrustedAudioOrigin(String origin) {
        return AudioPermissionPolicy.isTrusted(origin);
    }

    private String currentWebOrigin() {
        if (getBridge() == null || getBridge().getWebView() == null) return "";
        return String.valueOf(getBridge().getWebView().getUrl());
    }

    private boolean matchesAudioPage(String origin) {
        return AudioPermissionPolicy.matchesCurrent(origin, currentWebOrigin());
    }

    private void cancelPendingAudioPermission() {
        PermissionRequest request = pendingAudioPermissionRequest;
        pendingAudioPermissionRequest = null;
        pendingAudioPermissionOrigin = null;
        if (request != null) request.deny();
    }

    @Override
    protected void load() {
        registerPlugin(DominoGoogleAuthPlugin.class);
        registerPlugin(DominoBrowserPlugin.class);
        registerPlugin(DominoAudioPlugin.class);
        registerPlugin(DominoDeviceRegionPlugin.class);
        super.load();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    if (request == null) {
                        return;
                    }

                    boolean wantsAudio = false;
                    String[] resources = request.getResources();
                    if (resources == null || resources.length == 0) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                request.deny();
                            }
                        });
                        return;
                    }
                    for (String resource : resources) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            wantsAudio = true;
                            break;
                        }
                    }

                    if (!wantsAudio) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                request.deny();
                            }
                        });
                        return;
                    }

                    final String requestOrigin = request.getOrigin() == null ? "" : request.getOrigin().toString();
                    if (!isTrustedAudioOrigin(requestOrigin) || !matchesAudioPage(requestOrigin)) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                request.deny();
                            }
                        });
                        return;
                    }

                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (matchesAudioPage(requestOrigin)) {
                                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                                } else {
                                    request.deny();
                                }
                            }
                        });
                        return;
                    }

                    // Keep the request associated with the visible Android dialog.
                    if (pendingAudioPermissionRequest != null) {
                        request.deny();
                        return;
                    }
                    pendingAudioPermissionRequest = request;
                    pendingAudioPermissionOrigin = requestOrigin;
                    ActivityCompat.requestPermissions(MainActivity.this, new String[] { Manifest.permission.RECORD_AUDIO }, REQ_RECORD_AUDIO);
                }

                @Override
                public void onPermissionRequestCanceled(PermissionRequest request) {
                    if (request == pendingAudioPermissionRequest) {
                        pendingAudioPermissionRequest = null;
                        pendingAudioPermissionOrigin = null;
                    }
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, final int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_RECORD_AUDIO) {
            return;
        }

        final PermissionRequest request = pendingAudioPermissionRequest;
        final String requestOrigin = pendingAudioPermissionOrigin;
        pendingAudioPermissionRequest = null;
        pendingAudioPermissionOrigin = null;
        if (request == null || !matchesAudioPage(requestOrigin)) {
            if (request != null) request.deny();
            return;
        }

        MainActivity.this.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED
                    && matchesAudioPage(requestOrigin)) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                } else {
                    request.deny();
                }
            }
        });
    }

    @Override
    public void onStop() {
        cancelPendingAudioPermission();
        super.onStop();
    }

    @Override
    public void onDestroy() {
        cancelPendingAudioPermission();
        super.onDestroy();
    }
}
