package az.simplesoft.dominotelefon;

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
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "DominoGoogleAuth")
public class DominoGoogleAuthPlugin extends Plugin {
    private static final String DEBUG_SHA1 = "90:CC:AA:61:F3:79:F9:3E:0A:E0:9E:8F:C1:91:10:53:85:CF:AB:B6";

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

        try {
            GoogleSignInAccount account = null;
            if (result.getData() != null) {
                Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
                account = task.getResult(ApiException.class);
            }

            if (account == null) {
                account = GoogleSignIn.getLastSignedInAccount(getContext());
            }

            if (account == null || account.getIdToken() == null) {
                if (result.getResultCode() != Activity.RESULT_OK) {
                    call.reject("Google sign-in failed with result code " + result.getResultCode());
                } else {
                    call.reject(buildConfigErrorMessage());
                }
                return;
            }

            JSObject payload = new JSObject();
            payload.put("idToken", account != null ? account.getIdToken() : null);
            payload.put("email", account != null ? account.getEmail() : null);
            payload.put("name", account != null ? account.getDisplayName() : null);
            payload.put("photoUrl", account != null && account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
            call.resolve(payload);
        } catch (ApiException ex) {
            if (ex.getStatusCode() == 10) {
                call.reject(buildConfigErrorMessage());
                return;
            }
            call.reject("Google sign-in failed: " + ex.getStatusCode());
        } catch (Exception ex) {
            call.reject(ex.getLocalizedMessage());
        }
    }

    private String buildConfigErrorMessage() {
        return "Google Sign-In is not configured for this Android build. " +
            "Create an Android OAuth client in Google Cloud for package az.simplesoft.dominotelefon " +
            "and SHA-1 " + DEBUG_SHA1 + ", then keep your web client ID for requestIdToken().";
    }
}
