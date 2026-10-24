-- Local integration candidate only. NOT part of production migrations.
-- No deployment until retention, provider callback/key refresh, auth and release review.
CREATE TABLE "RewardReviewAttempt" (
 "id" text PRIMARY KEY,
 "playerId" text NOT NULL REFERENCES "Player"("id") ON DELETE CASCADE,
 "provider" text NOT NULL CHECK ("provider" IN ('admob','levelplay')),
 "providerScope" text NOT NULL,
 "adUnit" text NOT NULL,
 "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
 "sessionId" text REFERENCES "session"("id") ON DELETE SET NULL,
 "claimDate" text NOT NULL,
 "baseReward" integer NOT NULL CHECK ("baseReward" BETWEEN 1 AND 10000),
 "expiresAt" timestamptz NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "consumedAt" timestamptz,
 "cancelled" boolean NOT NULL DEFAULT false
);
CREATE INDEX ON "RewardReviewAttempt" ("playerId","claimDate");
CREATE TABLE "RewardReviewReceipt" (
 "provider" text NOT NULL CHECK ("provider" IN ('admob','levelplay')),
 "providerScope" text NOT NULL,
 "transactionId" text NOT NULL,
 "attemptId" text NOT NULL UNIQUE REFERENCES "RewardReviewAttempt"("id") ON DELETE CASCADE,
 "eventTimestamp" bigint NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("provider","providerScope","transactionId")
);
