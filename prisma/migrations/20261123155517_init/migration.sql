-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "temperament" TEXT NOT NULL,
    "base_triggers" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RelationshipState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "friendship_score" INTEGER NOT NULL DEFAULT 50,
    "tier" TEXT NOT NULL DEFAULT 'Acquaintance',
    "current_mood" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "cooldown_until" DATETIME,
    "offense_tier" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RelationshipState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RelationshipState_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DynamicBoundary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "relationshipStateId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "flag_color" TEXT NOT NULL DEFAULT 'GREEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DynamicBoundary_relationshipStateId_fkey" FOREIGN KEY ("relationshipStateId") REFERENCES "RelationshipState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "relationshipStateId" TEXT,
    "userId" TEXT,
    "personaId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sentiment_score" REAL NOT NULL DEFAULT 0.0,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_relationshipStateId_fkey" FOREIGN KEY ("relationshipStateId") REFERENCES "RelationshipState" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_name_key" ON "Persona"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipState_userId_personaId_key" ON "RelationshipState"("userId", "personaId");
