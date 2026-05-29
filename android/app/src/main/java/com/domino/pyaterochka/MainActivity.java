package com.domino.pyaterochka;

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

    @Override
    protected void load() {
        super.load();
        registerPlugin(DominoGoogleAuthPlugin.class);
        registerPlugin(DominoBrowserPlugin.class);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
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

                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                            }
                        });
                        return;
                    }

                    pendingAudioPermissionRequest = request;
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
        pendingAudioPermissionRequest = null;
        if (request == null) {
            return;
        }

        MainActivity.this.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                } else {
                    request.deny();
                }
            }
        });
    }
}
