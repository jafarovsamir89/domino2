package az.simplesoft.dominotelefon;

import org.junit.Test;
import static org.junit.Assert.*;

public class AudioPermissionPolicyTest {
    @Test public void trustsOnlyExactHttpsAppOrigins() {
        assertTrue(AudioPermissionPolicy.isTrusted("https://localhost"));
        assertTrue(AudioPermissionPolicy.isTrusted("https://gamed.simplesoft.az/"));
        for (String origin : new String[] {null, "", "http://localhost", "https://localhost:444", "https://localhost.evil.invalid", "https://user@localhost", "https://gamed.simplesoft.az/path", "https://localhost#fragment", "https://localhost?query", "not a URL"}) {
            assertFalse(String.valueOf(origin), AudioPermissionPolicy.isTrusted(origin));
        }
    }
    @Test public void resultMustStillBelongToTheSamePageOrigin() {
        assertTrue(AudioPermissionPolicy.matchesCurrent("https://localhost", "https://localhost/index.html?local=1"));
        assertFalse(AudioPermissionPolicy.matchesCurrent("https://localhost", "https://localhost:444/index.html"));
        assertFalse(AudioPermissionPolicy.matchesCurrent("https://localhost", "https://gamed.simplesoft.az/index.html"));
        assertFalse(AudioPermissionPolicy.matchesCurrent("https://localhost", "http://localhost/index.html"));
    }
}
