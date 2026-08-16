-- DropIndex
DROP INDEX IF EXISTS "ContentPage_slug_key";

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "previousValue" JSONB,
ADD COLUMN     "updatedValue" JSONB,
ADD COLUMN     "userRole" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "amountPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "balanceAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "children" INTEGER,
ADD COLUMN     "costPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "grossProfit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "infants" INTEGER,
ADD COLUMN     "isInternational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "netProfit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nights" INTEGER,
ADD COLUMN     "operationsExecutiveId" TEXT,
ADD COLUMN     "operationsExecutiveName" TEXT,
ADD COLUMN     "packageExcludes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "packageIncludes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "packageValue" INTEGER,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "policiesAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "pricingLocked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "quotationId" TEXT,
ADD COLUMN     "quoteNo" TEXT,
ADD COLUMN     "salesExecutiveId" TEXT,
ADD COLUMN     "salesExecutiveName" TEXT,
ADD COLUMN     "termsAndConditions" TEXT,
ADD COLUMN     "totalRooms" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'Draft';

-- AlterTable
ALTER TABLE "ContentPage" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "MarketingCampaign" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedByEmail" TEXT,
ADD COLUMN     "acceptedByName" TEXT,
ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "agentName" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedBookingId" TEXT,
ADD COLUMN     "convertedBy" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "enquiryRef" TEXT,
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "flightTerms" TEXT,
ADD COLUMN     "forceMajeure" TEXT,
ADD COLUMN     "grossProfit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hotelTerms" TEXT,
ADD COLUMN     "insuranceTerms" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "perPersonCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profitMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "quoteDate" TEXT,
ADD COLUMN     "refundPolicy" TEXT,
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "selectedPackageId" TEXT,
ADD COLUMN     "specialRequests" TEXT,
ADD COLUMN     "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
ADD COLUMN     "taxableAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "termsSnapshot" JSONB,
ADD COLUMN     "totalNetCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSelling" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "travelDisclaimer" TEXT,
ADD COLUMN     "travelEndDate" TEXT,
ADD COLUMN     "travelProposalId" TEXT,
ADD COLUMN     "travelStartDate" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visaTerms" TEXT,
ADD COLUMN     "wizardStep" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "apiKeys" JSONB;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpires" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "paymentRef" TEXT;

-- CreateTable
CREATE TABLE "QuotationPackage" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "hotels" JSONB NOT NULL DEFAULT '[]',
    "flights" JSONB NOT NULL DEFAULT '[]',
    "transfers" JSONB NOT NULL DEFAULT '[]',
    "activities" JSONB NOT NULL DEFAULT '[]',
    "meals" JSONB NOT NULL DEFAULT '[]',
    "itinerary" JSONB NOT NULL DEFAULT '[]',
    "visa" JSONB,
    "insurance" JSONB,
    "addOns" JSONB NOT NULL DEFAULT '[]',
    "inclusions" JSONB NOT NULL DEFAULT '[]',
    "exclusions" JSONB NOT NULL DEFAULT '[]',
    "totalNetCost" INTEGER NOT NULL DEFAULT 0,
    "totalSelling" INTEGER NOT NULL DEFAULT 0,
    "grossProfit" INTEGER NOT NULL DEFAULT 0,
    "gst" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "perPersonCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationVersion" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "reason" TEXT,
    "createdByName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationApproval" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approverName" TEXT,
    "approverRole" TEXT,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationRevision" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByRole" TEXT,
    "comments" TEXT,
    "requestedChanges" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationShare" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "senderName" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Attempted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationDocument" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'Internal',
    "relatedEntity" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxDiscount" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTill" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT,
    "quotationId" TEXT,
    "orderAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPassenger" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomIndex" INTEGER NOT NULL DEFAULT 0,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportIssueDate" TEXT,
    "passportExpiry" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "panNumber" TEXT,
    "panVerified" BOOLEAN NOT NULL DEFAULT false,
    "panRegisteredName" TEXT,
    "panStatus" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agencyId" TEXT,
    "requestRef" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingService" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "confirmationNo" TEXT,
    "supplierName" TEXT,
    "supplierRef" TEXT,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "voucherUrl" TEXT,
    "ticketUrl" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSupplierLine" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agencyId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "supplierRef" TEXT,
    "confirmationNo" TEXT,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "voucherUrl" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSupplierLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDocument" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "passengerId" TEXT,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingInvoice" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agencyId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "gst" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Issued',
    "notes" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayout" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "agencyId" TEXT,
    "supplierName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMode" TEXT,
    "utr" TEXT,
    "paymentDate" TEXT,
    "paymentTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAddOn" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "addOnType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingModification" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "modType" TEXT NOT NULL,
    "description" TEXT,
    "previousValue" JSONB,
    "updatedValue" JSONB,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingModification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "requestRef" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agencyId" TEXT,
    "requestType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByRole" TEXT,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "estimatedAdditionalCost" INTEGER NOT NULL DEFAULT 0,
    "cancellationCharges" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "resolutionNotes" TEXT,
    "supportingDocs" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationPackage_quotationId_idx" ON "QuotationPackage"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationVersion_quotationId_idx" ON "QuotationVersion"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationVersion_quotationId_versionNumber_key" ON "QuotationVersion"("quotationId", "versionNumber");

-- CreateIndex
CREATE INDEX "QuotationApproval_quotationId_idx" ON "QuotationApproval"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationRevision_quotationId_idx" ON "QuotationRevision"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationShare_quotationId_idx" ON "QuotationShare"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationDocument_quotationId_idx" ON "QuotationDocument"("quotationId");

-- CreateIndex
CREATE INDEX "Coupon_agencyId_idx" ON "Coupon"("agencyId");

-- CreateIndex
CREATE INDEX "Coupon_status_idx" ON "Coupon"("status");

-- CreateIndex
CREATE INDEX "Coupon_validTill_idx" ON "Coupon"("validTill");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_agencyId_code_key" ON "Coupon"("agencyId", "code");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "CouponRedemption_agencyId_idx" ON "CouponRedemption"("agencyId");

-- CreateIndex
CREATE INDEX "CouponRedemption_quotationId_idx" ON "CouponRedemption"("quotationId");

-- CreateIndex
CREATE INDEX "CouponRedemption_code_idx" ON "CouponRedemption"("code");

-- CreateIndex
CREATE INDEX "BookingPassenger_bookingId_idx" ON "BookingPassenger"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_requestRef_key" ON "PaymentRequest"("requestRef");

-- CreateIndex
CREATE INDEX "PaymentRequest_bookingId_idx" ON "PaymentRequest"("bookingId");

-- CreateIndex
CREATE INDEX "PaymentRequest_agencyId_idx" ON "PaymentRequest"("agencyId");

-- CreateIndex
CREATE INDEX "BookingService_bookingId_idx" ON "BookingService"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSupplierLine_bookingId_idx" ON "BookingSupplierLine"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSupplierLine_agencyId_idx" ON "BookingSupplierLine"("agencyId");

-- CreateIndex
CREATE INDEX "BookingDocument_bookingId_idx" ON "BookingDocument"("bookingId");

-- CreateIndex
CREATE INDEX "BookingDocument_passengerId_idx" ON "BookingDocument"("passengerId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingInvoice_invoiceNo_key" ON "BookingInvoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "BookingInvoice_bookingId_idx" ON "BookingInvoice"("bookingId");

-- CreateIndex
CREATE INDEX "BookingInvoice_agencyId_idx" ON "BookingInvoice"("agencyId");

-- CreateIndex
CREATE INDEX "SupplierPayout_bookingId_idx" ON "SupplierPayout"("bookingId");

-- CreateIndex
CREATE INDEX "SupplierPayout_agencyId_idx" ON "SupplierPayout"("agencyId");

-- CreateIndex
CREATE INDEX "BookingAddOn_bookingId_idx" ON "BookingAddOn"("bookingId");

-- CreateIndex
CREATE INDEX "BookingModification_bookingId_idx" ON "BookingModification"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_requestRef_key" ON "ChangeRequest"("requestRef");

-- CreateIndex
CREATE INDEX "ChangeRequest_bookingId_idx" ON "ChangeRequest"("bookingId");

-- CreateIndex
CREATE INDEX "ChangeRequest_agencyId_idx" ON "ChangeRequest"("agencyId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ApiKey_agencyId_idx" ON "ApiKey"("agencyId");

-- CreateIndex
CREATE INDEX "AuditLog_bookingId_idx" ON "AuditLog"("bookingId");

-- CreateIndex
CREATE INDEX "Booking_quotationId_idx" ON "Booking"("quotationId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "ContentPage_agencyId_idx" ON "ContentPage"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_agencyId_slug_key" ON "ContentPage"("agencyId", "slug");

-- CreateIndex
CREATE INDEX "MarketingCampaign_agencyId_idx" ON "MarketingCampaign"("agencyId");

-- CreateIndex
CREATE INDEX "Quotation_couponCode_idx" ON "Quotation"("couponCode");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE INDEX "Quotation_deletedAt_idx" ON "Quotation"("deletedAt");

-- CreateIndex
CREATE INDEX "Quotation_destination_idx" ON "Quotation"("destination");

-- CreateIndex
CREATE INDEX "SupportTicket_agencyId_idx" ON "SupportTicket"("agencyId");

-- CreateIndex
CREATE INDEX "Task_bookingId_idx" ON "Task"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_paymentRef_key" ON "WalletTransaction"("paymentRef");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salesExecutiveId_fkey" FOREIGN KEY ("salesExecutiveId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operationsExecutiveId_fkey" FOREIGN KEY ("operationsExecutiveId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationPackage" ADD CONSTRAINT "QuotationPackage_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationApproval" ADD CONSTRAINT "QuotationApproval_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRevision" ADD CONSTRAINT "QuotationRevision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationShare" ADD CONSTRAINT "QuotationShare_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationDocument" ADD CONSTRAINT "QuotationDocument_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPassenger" ADD CONSTRAINT "BookingPassenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingService" ADD CONSTRAINT "BookingService_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSupplierLine" ADD CONSTRAINT "BookingSupplierLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "BookingPassenger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingInvoice" ADD CONSTRAINT "BookingInvoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayout" ADD CONSTRAINT "SupplierPayout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddOn" ADD CONSTRAINT "BookingAddOn_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingModification" ADD CONSTRAINT "BookingModification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
