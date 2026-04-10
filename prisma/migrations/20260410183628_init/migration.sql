-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadQuality" AS ENUM ('COLD', 'WARM', 'HOT');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GOOGLE_MAPS', 'DIRECTORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'SUCCESS', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "keyword" TEXT,
    "metaDescription" TEXT,
    "techStack" TEXT[],
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "leadQuality" "LeadQuality" NOT NULL DEFAULT 'COLD',
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "hasWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "hasEmail" BOOLEAN NOT NULL DEFAULT false,
    "hasPhone" BOOLEAN NOT NULL DEFAULT false,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "SourceType" NOT NULL DEFAULT 'GOOGLE_MAPS',
    "sourceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scrapeJobId" TEXT,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "maxResults" INTEGER NOT NULL DEFAULT 50,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "githubRunId" TEXT,
    "githubRunUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "userId" TEXT,

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_detections" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tech_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isValid" BOOLEAN,
    "status" TEXT,
    "provider" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_leadId_key" ON "email_verifications"("leadId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_scrapeJobId_fkey" FOREIGN KEY ("scrapeJobId") REFERENCES "scrape_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "scrape_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_logs" ADD CONSTRAINT "enrichment_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_detections" ADD CONSTRAINT "tech_detections_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
