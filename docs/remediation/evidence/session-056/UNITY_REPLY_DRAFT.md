# Draft only — not sent

Existing Unity ticket:00941925. No new ticket. The owner has not instructed sending this follow-up yet.

Hello,

Thank you. We reran Test callback for LevelPlay App Key28e969915 and it now passes: “Your callback settings are valid.”

The Network response also identified an input issue in our test setup: a64-character temporary private key returned HTTP400/internal code381, “Invalid callback.privateKey (too long)”. Retesting with a32-character random test key succeeded. The signed callback was verified and received HTTP200 with the XML acknowledgement.

We discarded the temporary configuration without saving or activating a production callback. Since the final test passes, the conditional HAR/recording is no longer needed.

Best regards
