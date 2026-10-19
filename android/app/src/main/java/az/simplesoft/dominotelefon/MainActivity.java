package az.simplesoft.dominotelefon;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
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
        if (origin == null) return false;
        Uri uri = Uri.parse(origin);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        return "https".equalsIgnoreCase(scheme)
            && uri.getPort() == -1
            && ("localhost".equalsIgnoreCase(host) || "gamed.simplesoft.az".equalsIgnoreCase(host));
    }

    private String currentWebOrigin() {
        if (getBridge() == null || getBridge().getWebView() == null) return "";
        Uri uri = Uri.parse(String.valueOf(getBridge().getWebView().getUrl()));
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) return "";
        return scheme.toLowerCase() + "://" + host.toLowerCase();
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
                    if (!isTrustedAudioOrigin(requestOrigin)) {
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
                                if (isTrustedAudioOrigin(requestOrigin) && requestOrigin.equals(currentWebOrigin())) {
                                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                                } else {
                                    request.deny();
                                }
                            }
                        });
                        return;
                    }

                    pendingAudioPermissionRequest = request;
                    pendingAudioPermissionOrigin = requestOrigin;
                    ActivityCompat.requestPermissions(MainActivity.this, new String[] { Manifest.permission.RECORD_AUDIO }, REQ_RECORD_AUDIO);
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
        if (request == null || !isTrustedAudioOrigin(requestOrigin) || !requestOrigin.equals(currentWebOrigin())) {
            if (request != null) request.deny();
            return;
        }

        MainActivity.this.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED
                    && isTrustedAudioOrigin(requestOrigin) && requestOrigin.equals(currentWebOrigin())) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                } else {
                    request.deny();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        PermissionRequest request = pendingAudioPermissionRequest;
        pendingAudioPermissionRequest = null;
        pendingAudioPermissionOrigin = null;
        if (request != null) request.deny();
        super.onDestroy();
    }
}
