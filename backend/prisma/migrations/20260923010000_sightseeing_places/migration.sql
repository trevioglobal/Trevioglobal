-- Sightseeing / itinerary places linked to Destinations
CREATE TABLE IF NOT EXISTS "SightseeingPlace" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT,
  "destinationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "bestTimeToVisit" TEXT,
  "famousFor" TEXT,
  "suggestedDuration" TEXT,
  "sellingPrice" INTEGER,
  "costPrice" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'Active',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SightseeingPlace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SightseeingPlace_destinationId_idx" ON "SightseeingPlace"("destinationId");
CREATE INDEX IF NOT EXISTS "SightseeingPlace_agencyId_idx" ON "SightseeingPlace"("agencyId");
CREATE INDEX IF NOT EXISTS "SightseeingPlace_status_idx" ON "SightseeingPlace"("status");
CREATE INDEX IF NOT EXISTS "SightseeingPlace_name_idx" ON "SightseeingPlace"("name");

DO $$ BEGIN
  ALTER TABLE "SightseeingPlace"
    ADD CONSTRAINT "SightseeingPlace_destinationId_fkey"
    FOREIGN KEY ("destinationId") REFERENCES "Destination"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
