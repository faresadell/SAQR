CREATE TABLE "NotificationMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationMute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationMute_userId_type_key" ON "NotificationMute"("userId", "type");
