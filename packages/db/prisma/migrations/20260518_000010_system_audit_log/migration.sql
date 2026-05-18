-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorUserId" TEXT,
    "actorPlayerId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemAuditLog_action_createdAt_idx" ON "SystemAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SystemAuditLog_entityType_entityId_idx" ON "SystemAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_actorUserId_createdAt_idx" ON "SystemAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemAuditLog_actorPlayerId_createdAt_idx" ON "SystemAuditLog"("actorPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_actorPlayerId_fkey" FOREIGN KEY ("actorPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
