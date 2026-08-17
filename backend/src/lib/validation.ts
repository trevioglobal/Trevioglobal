import type { Request, Response, NextFunction } from "express";
import { z, type ZodTypeAny } from "zod";

export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Validation failed", details: result.error.flatten().fieldErrors });
      return;
    }
    req.body = result.data;
    next();
  };
}

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character");

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(16),
  newPassword: passwordSchema,
});

export const bookingSchema = z.object({
  customerName: z.string().min(1),
  customerId: z.string().optional(),
  service: z.enum(["Flight", "Hotel", "Holiday"]),
  route: z.string().min(1),
  travelDate: z.string().min(1),
  amount: z.number().positive(),
  commission: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(["Pending", "Confirmed", "Ticketed", "Completed", "Cancelled", "Refunded", "Failed"]).optional(),
  paymentStatus: z.enum(["Paid", "Pending", "Partial", "Refunded"]).optional(),
  agentName: z.string().min(1),
  agencyName: z.string().min(1),
});

export const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  type: z.enum(["Individual", "Corporate"]).optional(),
  tier: z.enum(["Silver", "Gold", "Platinum"]).optional(),
  passportNo: z.string().optional(),
  visaStatus: z.string().optional(),
  city: z.string().optional(),
});

export const leadSchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  source: z.string().min(1),
  service: z.string().min(1),
  value: z.number().min(0),
  assignedTo: z.string().min(1),
  expectedClose: z.string().min(1),
  notes: z.string().optional(),
});

export const quotationSchema = z.object({
  customerName: z.string().min(1),
  service: z.string().min(1),
  items: z.number().int().min(1),
  amount: z.number().min(0),
  gst: z.number().min(0),
  total: z.number().min(0),
  validTill: z.string().min(1),
  createdBy: z.string().min(1),
  status: z.string().optional(),
  isInternational: z.boolean().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  contactPhone: z.string().optional(),
  destination: z.string().optional(),
  country: z.string().optional(),
  departureCity: z.string().optional(),
  travelDates: z.string().optional(),
  returnDate: z.string().optional(),
  nights: z.number().int().optional(),
  days: z.number().int().optional(),
  adults: z.number().int().optional(),
  children: z.number().int().optional(),
  infants: z.number().int().optional(),
  hotelStarPreference: z.string().optional(),
  roomTypePreference: z.string().optional(),
  mealPlanPreference: z.string().optional(),
  location: z.string().optional(),
  budget: z.number().optional(),
  currency: z.string().optional(),
  packageIncludes: z.array(z.string()).optional(),
  packageExcludes: z.array(z.string()).optional(),
  termsAndConditions: z.string().optional(),
  paymentTerms: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  salesExecutiveName: z.string().optional(),
  salesExecutivePhone: z.string().optional(),
  salesExecutiveEmail: z.union([z.string().email(), z.literal("")]).optional(),
  approvalStatus: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    qty: z.number().int().min(1),
    price: z.number().min(0),
    type: z.string().optional(),
    imageUrl: z.string().optional(),
    currency: z.string().optional(),
    title: z.string().optional(),
    meta: z.string().optional(),
  })).optional(),
  couponCode: z.string().max(40).optional(),
  couponDiscount: z.number().int().min(0).optional(),
});

export const couponCreateSchema = z.object({
  code: z.string().min(3).max(40),
  type: z.enum(["Flat", "Percent"]),
  value: z.number().int().positive(),
  minOrderAmount: z.number().int().min(0).optional().default(0),
  usageLimit: z.number().int().min(0).optional().default(0),
  maxDiscount: z.number().int().positive().optional().nullable(),
  validFrom: z.string().optional(),
  validTill: z.string().min(1),
  status: z.enum(["Active", "Paused", "Expired"]).optional(),
  description: z.string().max(500).optional().nullable(),
  agencyId: z.string().optional(),
});

export const couponUpdateSchema = z.object({
  code: z.string().min(3).max(40).optional(),
  type: z.enum(["Flat", "Percent"]).optional(),
  value: z.number().int().positive().optional(),
  minOrderAmount: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().positive().optional().nullable(),
  validFrom: z.string().optional(),
  validTill: z.string().optional(),
  status: z.enum(["Active", "Paused", "Expired"]).optional(),
  description: z.string().max(500).optional().nullable(),
});

export const couponValidateSchema = z.object({
  code: z.string().min(1).max(40),
  orderAmount: z.number().positive(),
  agencyId: z.string().optional(),
});

export const internationalQuotationSchema = z.object({
  customerName: z.string().min(1),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  destination: z.string().min(1),
  travelDates: z.string().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),
  hotelStarPreference: z.string().optional(),
  location: z.string().optional(),
  budget: z.number().min(0).optional(),
  currency: z.string().optional(),
  packageIncludes: z.array(z.string()).optional(),
  packageExcludes: z.array(z.string()).optional(),
  paymentTerms: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    qty: z.number().int().min(1),
    price: z.number().min(0),
  })).optional(),
  validTill: z.string().min(1),
  createdBy: z.string().min(1),
});

export const paymentSchema = z.object({
  customerName: z.string().min(1),
  bookingRef: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
  type: z.string().optional(),
  gateway: z.string().optional(),
  status: z.enum(["Success", "Pending", "Failed", "Refunded"]).optional(),
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  signature: z.string().optional(),
});

export const employeeSchema = z.object({
  agencyId: z.string().optional(),
  branchId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  designation: z.string().min(1),
  department: z.string().optional(),
  branch: z.string().optional(),
  role: z.enum(["employee", "branch_manager", "accountant"]).optional(),
  salary: z.number().min(0).optional(),
  target: z.number().min(0).optional(),
  joinDate: z.string().optional(),
  permissions: z.array(z.string()).optional().nullable(),
});

export const employeeUpdateSchema = employeeSchema.partial().extend({
  status: z.string().optional(),
});

export const employeeCreateWithPasswordSchema = employeeSchema.extend({
  password: passwordSchema,
});

export const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedTo: z.string().min(1),
  assignedToId: z.string().optional(),
  assignedBy: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  dueDate: z.string().min(1),
  relatedTo: z.string().optional(),
});

export const agencySchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  plan: z.string().optional(),
  status: z.string().optional(),
  walletBalance: z.number().min(0).optional(),
  apiAllocation: z.record(z.string(), z.number()).optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  address: z.string().optional(),
});

export const agencyUpdateSchema = agencySchema.partial();

export const agentRegistrationSchema = z
  .object({
    fullName: z.string().min(2, "Full name is required"),
    companyName: z.string().min(2, "Company name is required"),
    address: z.string().min(5, "Business address is required"),
    email: z.string().email(),
    countryCode: z.string().min(2).default("+91"),
    phone: z.string().min(8, "Valid mobile number is required"),
    country: z.string().min(1, "Country is required"),
    state: z.string().min(1, "State/Province is required"),
    city: z.string().min(1, "City is required"),
    panNumber: z.string().optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
    gstNumber: z.string().optional(),
    gstProofUrl: z.string().optional(),
    termsAccepted: z.literal(true, { message: "You must accept the terms and conditions" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const branchSchema = z.object({
  agencyId: z.string().optional(),
  name: z.string().min(1),
  manager: z.string().min(1),
  city: z.string().min(1),
  revenue: z.number().min(0).optional(),
});

export const branchUpdateSchema = branchSchema.partial();

export const walletSchema = z.object({
  agencyId: z.string().optional(),
  type: z.enum(["Credit", "Debit"]),
  amount: z.number().positive(),
  source: z.string().optional(),
  description: z.string().optional(),
  /** Required for Credit top-ups when Razorpay is configured */
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  signature: z.string().optional(),
  /** Only accepted when server allowDemoPayments() is true */
  demo: z.boolean().optional(),
});

export const attendanceCheckSchema = z.object({});

export const leaveSchema = z.object({
  type: z.enum(["Casual", "Sick", "Earned", "Unpaid"]),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  reason: z.string().min(1),
});

export const leaveStatusSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
});

const destinationStatusEnum = z.enum(["Draft", "Active", "Inactive", "Archived"]);

export const destinationSchema = z.object({
  name: z.string().min(1, "Destination name is required"),
  country: z.string().min(1, "Country is required"),
  region: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  longDescription: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  language: z.string().optional().nullable(),
  timeZone: z.string().optional().nullable(),
  visaRequired: z.boolean().optional().default(false),
  visaDetails: z.string().optional().nullable(),
  passportValidity: z.string().optional().nullable(),
  bestTimeToVisit: z.string().optional().nullable(),
  climate: z.string().optional().nullable(),
  averageBudget: z.string().optional().nullable(),
  popularAttractions: z.array(z.string()).optional().default([]),
  localTransport: z.string().optional().nullable(),
  foodSpecialities: z.array(z.string()).optional().default([]),
  shopping: z.string().optional().nullable(),
  nightlife: z.string().optional().nullable(),
  adventureActivities: z.array(z.string()).optional().default([]),
  familyFriendly: z.boolean().optional().default(true),
  coupleFriendly: z.boolean().optional().default(true),
  seniorFriendly: z.boolean().optional().default(false),
  heroImage: z.string().optional().nullable(),
  galleryImages: z.array(z.string()).optional().default([]),
  bannerImage: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  imageAltText: z.string().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional().default([]),
  status: destinationStatusEnum.optional().default("Draft"),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  branchId: z.string().optional().nullable(),
});

export const destinationUpdateSchema = destinationSchema.partial();

export const destinationBulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const destinationBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: destinationStatusEnum,
});

export const destinationImportSchema = z.object({
  rows: z.array(destinationSchema).min(1),
});

const packageItemSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
});

const packageStatusEnum = z.enum(["Draft", "Published", "Archived"]);

export const packageTimelineItemSchema = z.object({
  itemType: z.enum(["HOTEL", "ACTIVITY", "TRANSFER", "TEXT"]),
  referenceId: z.string().optional().nullable(),
  optionGroup: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).optional().default(0),
  icon: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const packageDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  mealPlan: z.object({
    breakfast: z.boolean().optional(),
    lunch: z.boolean().optional(),
    dinner: z.boolean().optional(),
    snacks: z.boolean().optional(),
  }).optional().default({}),
  coverImage: z.string().optional().nullable(),
  gallery: z.array(z.string()).optional().default([]),
  sortOrder: z.number().int().min(0).optional(),
  items: z.array(packageTimelineItemSchema).optional().default([]),
});

export const packageItinerarySchema = z.object({
  days: z.array(packageDaySchema).min(1),
});

export const packageDayReorderSchema = z.object({
  dayNumbers: z.array(z.number().int().min(1)).min(1),
});

export const packageTimelineReorderSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});

export const packageProductTypeEnum = z.enum(["HOTEL", "ACTIVITY", "TRANSFER"]);

export const packageProductOptionSchema = z.object({
  productType: packageProductTypeEnum,
  productId: z.string().min(1),
  optionGroup: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
  priceAdjustment: z.number().int().optional().default(0),
  status: z.enum(["Active", "Inactive"]).optional().default("Active"),
  notes: z.string().optional().nullable(),
});

export const packageProductOptionsSchema = z.object({
  options: z.array(packageProductOptionSchema),
});

export const packageOptionReorderSchema = z.object({
  optionIds: z.array(z.string().min(1)).min(1),
});

export const travelPackageSchema = z.object({
  packageName: z.string().min(1, "Package name is required"),
  destinationId: z.string().min(1, "Destination is required"),
  packageType: z.string().default("Standard"),
  durationDays: z.number().int().min(1).default(1),
  durationNights: z.number().int().min(0).default(0),
  description: z.string().optional().nullable(),
  highlights: z.array(z.string()).optional().default([]),
  status: packageStatusEnum.optional().default("Draft"),
  startingPrice: z.number().int().min(0).optional().default(0),
  currency: z.string().default("INR"),
  heroImage: z.string().optional().nullable(),
  bannerImage: z.string().optional().nullable(),
  isFeatured: z.boolean().optional().default(false),
  hotelCost: z.number().int().min(0).optional().default(0),
  activityCost: z.number().int().min(0).optional().default(0),
  transferCost: z.number().int().min(0).optional().default(0),
  markup: z.number().int().min(0).optional().default(0),
  tax: z.number().int().min(0).optional().default(0),
  discount: z.number().int().min(0).optional().default(0),
  finalPrice: z.number().int().min(0).optional().default(0),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  hotels: z.array(packageItemSchema).optional().default([]),
  activities: z.array(packageItemSchema).optional().default([]),
  transfers: z.array(packageItemSchema).optional().default([]),
  productOptions: z.array(packageProductOptionSchema).optional().default([]),
  days: z.array(packageDaySchema).optional().default([]),
});

export const travelPackageUpdateSchema = travelPackageSchema.partial();

export const packageBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: packageStatusEnum,
});

export const travelRequirementStatusEnum = z.enum(["Draft", "Qualified", "Quoted", "Booked", "Cancelled"]);

export const travelRequirementSchema = z.object({
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  destinationId: z.string().min(1, "Destination is required"),
  travelStartDate: z.string().min(1, "Start date is required"),
  travelEndDate: z.string().min(1, "End date is required"),
  days: z.number().int().min(1).default(1),
  nights: z.number().int().min(0).default(0),
  adults: z.number().int().min(1, "At least 1 adult required").default(1),
  children: z.number().int().min(0).default(0),
  infants: z.number().int().min(0).default(0),
  budgetMin: z.number().int().min(0).optional().default(0),
  budgetMax: z.number().int().min(0).optional().default(0),
  hotelCategory: z.string().optional().nullable(),
  packageType: z.string().optional().nullable(),
  preferredMealPlan: z.object({
    breakfast: z.boolean().optional(),
    lunch: z.boolean().optional(),
    dinner: z.boolean().optional(),
    snacks: z.boolean().optional(),
  }).optional().default({}),
  preferredTransfer: z.string().optional().nullable(),
  flightRequired: z.boolean().optional().default(false),
  visaRequired: z.boolean().optional().default(false),
  insuranceRequired: z.boolean().optional().default(false),
  specialRequests: z.string().optional().nullable(),
  status: travelRequirementStatusEnum.optional().default("Draft"),
  markup: z.number().int().min(0).optional().default(0),
});

export const travelRequirementUpdateSchema = travelRequirementSchema.partial();

export const travelRequirementMatchSchema = z.object({
  destinationId: z.string().min(1),
  days: z.number().int().min(1),
  nights: z.number().int().min(0).optional().default(0),
  budgetMin: z.number().int().min(0).optional().default(0),
  budgetMax: z.number().int().min(0).optional().default(0),
  hotelCategory: z.string().optional().nullable(),
  packageType: z.string().optional().nullable(),
  adults: z.number().int().min(1).optional().default(1),
});

export const travelRequirementPriceSchema = z.object({
  packageId: z.string().min(1),
  hotelOptionGroup: z.string().optional().nullable(),
  activityOptionGroup: z.string().optional().nullable(),
  transferOptionGroup: z.string().optional().nullable(),
  markup: z.number().int().min(0).optional().default(0),
});

export const travelRequirementSelectionSchema = z.object({
  packageId: z.string().min(1),
  hotelOptionGroup: z.string().optional().nullable(),
  activityOptionGroup: z.string().optional().nullable(),
  transferOptionGroup: z.string().optional().nullable(),
  markup: z.number().int().min(0).optional().default(0),
  matchScore: z.number().optional().nullable(),
  matchReasons: z.array(z.string()).optional().default([]),
});

export const quoteSectionTypeEnum = z.enum([
  "COVER", "OVERVIEW", "DESTINATION_HIGHLIGHTS", "ITINERARY", "HOTELS", "ACTIVITIES", "FLIGHTS", "TRANSFERS",
  "PRICING", "INCLUSIONS", "EXCLUSIONS", "VISA", "TERMS", "CANCELLATION", "NOTES", "CONTACT", "CUSTOM_HTML",
]);

export const quoteTemplateSectionSchema = z.object({
  sectionType: quoteSectionTypeEnum,
  sortOrder: z.number().int().min(0).optional().default(0),
  isVisible: z.boolean().optional().default(true),
  customTitle: z.string().optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

export const quoteTemplateSchema = z.object({
  templateName: z.string().min(1, "Template name is required"),
  description: z.string().optional().nullable(),
  theme: z.string().optional().default("Classic"),
  primaryColor: z.string().optional().default("#2A7BBD"),
  secondaryColor: z.string().optional().default("#00A79D"),
  fontFamily: z.string().optional().default("Inter"),
  logo: z.string().optional().nullable(),
  watermark: z.string().optional().nullable(),
  headerStyle: z.record(z.string(), z.unknown()).optional().default({}),
  footerStyle: z.record(z.string(), z.unknown()).optional().default({}),
  pageSize: z.enum(["A4", "Letter"]).optional().default("A4"),
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait"),
  backgroundImage: z.string().optional().nullable(),
  showPageNumbers: z.boolean().optional().default(true),
  status: z.enum(["Draft", "Active", "Archived"]).optional().default("Draft"),
  sections: z.array(quoteTemplateSectionSchema).optional().default([]),
});

export const quoteTemplateUpdateSchema = quoteTemplateSchema.partial();

export const agencyBrandingSchema = z.object({
  primaryColor: z.string().optional().default("#2A7BBD"),
  secondaryColor: z.string().optional().default("#00A79D"),
  fontFamily: z.string().optional().default("Inter"),
  logo: z.string().optional().nullable(),
  watermark: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
  backgroundImage: z.string().optional().nullable(),
  headerHtml: z.string().optional().nullable(),
  showPageNumbers: z.boolean().optional().default(true),
});

export const proposalStatusEnum = z.enum([
  "Draft", "Internal Review", "Approved", "Sent", "Viewed", "Accepted", "Booked", "Rejected", "Expired", "Cancelled",
]);

export const proposalSnapshotEditsSchema = z.object({
  productSelections: z.object({
    hotelOptionGroup: z.string().optional().nullable(),
    activityOptionGroup: z.string().optional().nullable(),
    transferOptionGroup: z.string().optional().nullable(),
  }).optional(),
  markup: z.number().int().min(0).optional(),
  discount: z.number().int().min(0).optional(),
  tax: z.number().int().min(0).optional(),
  terms: z.object({
    inclusions: z.array(z.string()).optional(),
    exclusions: z.array(z.string()).optional(),
    termsText: z.string().optional(),
    cancellationText: z.string().optional(),
    visaRequired: z.boolean().optional(),
    visaDetails: z.string().optional(),
  }).optional(),
}).optional();

export const travelProposalSchema = z.object({
  travelRequirementId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  selectedPackageId: z.string().min(1),
  selectedTemplateId: z.string().optional().nullable(),
  currency: z.string().optional().default("INR"),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  markup: z.number().int().min(0).optional().default(0),
  discount: z.number().int().min(0).optional().default(0),
  tax: z.number().int().min(0).optional().default(0),
  hotelOptionGroup: z.string().optional().nullable(),
  activityOptionGroup: z.string().optional().nullable(),
  transferOptionGroup: z.string().optional().nullable(),
});

export const travelProposalUpdateSchema = z.object({
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  selectedTemplateId: z.string().optional().nullable(),
  currency: z.string().optional(),
  changeSummary: z.string().optional(),
  snapshotEdits: proposalSnapshotEditsSchema,
}).partial();

export const travelProposalStatusSchema = z.object({
  status: proposalStatusEnum,
});

export const travelProposalFromRequirementSchema = z.object({
  selectedPackageId: z.string().optional(),
  selectedTemplateId: z.string().optional().nullable(),
  validDays: z.number().int().min(1).max(90).optional().default(7),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  discount: z.number().int().min(0).optional().default(0),
  tax: z.number().int().min(0).optional().default(0),
  currency: z.string().optional().default("INR"),
});
