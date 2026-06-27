# OAuth setup for `az.simplesoft.dominotelefon`

Use this checklist before release signing and Play Console upload:

1. In Google Cloud Console, create an Android OAuth client for `az.simplesoft.dominotelefon`.
2. Register SHA-1 fingerprints for the debug key, upload key, and Play App Signing key.
3. Verify the web OAuth client allows `https://localhost` for Capacitor on Android.
4. Keep the redirect flow compatible with `domino://auth-complete`.
5. Confirm the backend `apid` origin allowlist includes `https://localhost` for Capacitor-origin requests.

Release signing is configured through `keystore.properties` in the `android/` root.
Copy `keystore.properties.example` to `keystore.properties` locally and fill in the real values.
