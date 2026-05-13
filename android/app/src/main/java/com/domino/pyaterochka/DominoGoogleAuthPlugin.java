package com.domino.pyaterochka;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

@CapacitorPlugin(name = "DominoGoogleAuth")
public class DominoGoogleAuthPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.trim().isEmpty()) {
            call.reject("serverClientId is required");
            return;
        }

        GoogleSignInOptions options = new GoogleSignInOptions
            .Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(serverClientId.trim())
            .build();
        GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), options);
        Intent intent = client.getSignInIntent();
        startActivityForResult(call, intent, "handleSignInResult");
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Google sign-in canceled");
            return;
        }

        try {
            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                .getResult(ApiException.class);

            JSObject payload = new JSObject();
            payload.put("idToken", account != null ? account.getIdToken() : null);
            payload.put("email", account != null ? account.getEmail() : null);
            payload.put("name", account != null ? account.getDisplayName() : null);
            payload.put("photoUrl", account != null && account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
            call.resolve(payload);
        } catch (ApiException ex) {
            call.reject("Google sign-in failed: " + ex.getStatusCode());
        } catch (Exception ex) {
            call.reject(ex.getLocalizedMessage());
        }
    }
}
