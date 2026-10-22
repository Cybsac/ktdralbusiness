-- CreateEnum
CREATE TYPE "AppAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "AppAccessControl" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'default',
    "status" "AppAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "publicTitle" TEXT NOT NULL DEFAULT 'Servicio temporalmente suspendido',
    "publicMessage" TEXT NOT NULL DEFAULT 'El servicio no está disponible temporalmente. Estamos trabajando para restablecerlo.',
    "supportContact" TEXT,
    "resumeAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAccessControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppAccessControl_scopeKey_key" ON "AppAccessControl"("scopeKey");

-- CreateIndex
CREATE INDEX "AppAccessControl_status_idx" ON "AppAccessControl"("status");

-- Seed the global installation scope. This is intentionally public-safe data;
-- the middleware reads only the access status and customer-facing copy.
INSERT INTO "AppAccessControl" ("id", "scopeKey", "status", "publicTitle", "publicMessage", "createdAt", "updatedAt")
VALUES ('app-access-global', 'default', 'ACTIVE', 'Servicio temporalmente suspendido', 'El servicio no está disponible temporalmente. Estamos trabajando para restablecerlo.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("scopeKey") DO NOTHING;

-- Supabase installations may expose the public state through RLS roles. The
-- main deployment currently uses Railway PostgreSQL, where those roles do not
-- exist; the application endpoint is the portable control-plane read path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER TABLE "AppAccessControl" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "app_access_public_read" ON "AppAccessControl" FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;
