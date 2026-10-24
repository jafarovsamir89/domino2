# Draft — NOT SENT

Destination: [Unity Grow / LevelPlay support — Contact Us](https://support-ads.unity.com/s/ContactUs), linked from the official LevelPlay Android troubleshooting documentation.

Subject: LevelPlay dashboard S2S callback test rejects HTTP200 with valid EVENT_ID:OK acknowledgement

Hello Unity LevelPlay support,

I am integrating rewarded server-to-server callbacks for Domino Club Online, Android package `az.simplesoft.dominotelefon`, LevelPlay App Key `28e969915`.

In Apps → Set S2S callback → Test callback, the dashboard reports:

“Your callback configuration is not valid, make sure all parameters are set correctly.”

However, our isolated receiver receives the dashboard test GET request, verifies the documented MD5 signature using the same separate test private key, persists a test receipt, and returns HTTP200. The URL template includes USER_ID, REWARDS and EVENT_ID. Test User ID is a 64-character hexadecimal synthetic identifier; reward amount is 1.

Observed additional query parameters are publisherSubId and country. We accept these as unsigned metadata without using them for identity or reward decisions. Timestamp format is YYYYMMDDHHMM and observed test timestamps align with UTC.

On 2026-10-24, repeated tests returned origin HTTP200 in approximately6–10ms. These origin timings exclude network latency and your validator's processing time. The requests have no Origin header and a non-browser user-agent. No relevant CORS/browser-console errors were observed.

We tested both documented acknowledgements:

```
EVENT_ID:OK
<status>EVENT_ID:OK</status>
```

Each response contains the exact received event ID. We also verified the response through the public HTTPS endpoint, with correct byte Content-Length, no compression or chunked transfer, and Cache-Control:no-store,no-transform. The dashboard still rejected both forms. The endpoint was a temporary Cloudflare Quick Tunnel used only for this isolated test, and is now closed. No callback configuration was saved or activated, and no actual user wallet was modified.

Could you clarify:

1. The exact response body/headers and complete timeout policy expected by the dashboard Test callback validator.
2. Whether this validator accepts temporary trycloudflare.com HTTPS endpoints, or requires a stable endpoint or additional allowlisting/account approval.
3. How to obtain the validator's actual downstream response/error details when the receiver records HTTP200 but the dashboard returns this generic error.

We can reproduce against a coordinated test endpoint if needed. We will not include private keys, signatures, auth tokens, synthetic user nonces or production user data in a support ticket.

Thank you.

---

Перед отправкой: подтвердить адресата, текст и возможные требования формы. Этот файл — только готовый черновик; разрешения на отправку сообщения в поддержку пока нет. Ключи/подписи/nonce и полные журналы не прикладывать. Возможное вложение — только `console-error-after-framing.png`, кадр без секретных полей.
