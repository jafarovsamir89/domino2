package az.simplesoft.dominotelefon;

import java.net.URI;

/** Pure origin policy, shared by the prompt and its asynchronous result. */
final class AudioPermissionPolicy {
    static boolean isTrusted(String origin) {
        try {
            URI uri = new URI(origin);
            String host = uri.getHost();
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getPort() == -1
                && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null
                && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                && ("localhost".equalsIgnoreCase(host) || "gamed.simplesoft.az".equalsIgnoreCase(host));
        } catch (Exception invalid) { return false; }
    }

    static boolean matchesCurrent(String origin, String currentUrl) {
        if (!isTrusted(origin)) return false;
        try {
            URI requested = new URI(origin), current = new URI(currentUrl);
            return requested.getScheme().equalsIgnoreCase(current.getScheme())
                && requested.getHost().equalsIgnoreCase(current.getHost())
                && requested.getPort() == current.getPort()
                && current.getUserInfo() == null;
        } catch (Exception invalid) { return false; }
    }
}
