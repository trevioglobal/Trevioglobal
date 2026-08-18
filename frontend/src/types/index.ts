// Travel Partner Pro — Core Types

export type Role =
  | "super_admin"
  | "agency_admin"
  | "branch_manager"
  | "employee"
  | "accountant"
  | "sales_executive"
  | "product_executive"
  | "operations"
  | "travel_agent"
  | "management";

export type Module =
  | "flights" | "hotels" | "activities" | "transfers" | "holiday" | "destinations" | "packages" | "bookings" | "crm" | "customers"
  | "trip-planner" | "travel-proposals" | "quotations" | "quote-templates" | "payments" | "wallet" | "commission" | "finance"
  | "reports" | "analytics" | "employees" | "attendance" | "leaves" | "tasks"
  | "support" | "notifications" | "marketing" | "cms" | "api-management"
  | "settings" | "audit-logs" | "agencies" | "branches" | "api-marketplace"
  | "monitoring" | "suppliers";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  avatar?: string;
  agencyId?: string;
  branchId?: string;
  designation?: string;
  permissions?: Module[] | null;
}

export interface Agency {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone: string;
  plan: "Starter" | "Growth" | "Enterprise";
  status: "Active" | "Suspended" | "Trial";
  walletBalance: number;
  commissionEarned: number;
  totalBookings: number;
  monthlyRevenue: number;
  apiAllocation: { flights: number; hotels: number };
  createdAt: string;
  branches: number;
  employees: number;
}

export interface Branch {
  id: string;
  agencyId: string;
  name: string;
  manager: string;
  city: string;
  employees: number;
  revenue: number;
}

export interface Flight {
  id: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  stops: number;
  price: number;
  currency: string;
  cabin: "Economy" | "Premium Economy" | "Business" | "First";
  seatsLeft: number;
  refundable: boolean;
  aircraft: string;
  rating: number;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  area: string;
  starRating: number;
  rating: number;
  reviews: number;
  pricePerNight: number;
  currency: string;
  originalPrice: number;
  amenities: string[];
  images: string[];
  distanceFromCenter: number;
  latitude: number;
  longitude: number;
  rooms: RoomType[];
}

export interface RoomType {
  id: string;
  name: string;
  description: string;
  price: number;
  maxGuests: number;
  beds: string;
  includesBreakfast: boolean;
  freeCancellation: boolean;
  refundable: boolean;
  roomsLeft: number;
}

export interface HolidayPackage {
  id: string;
  title: string;
  destination: string;
  country: string;
  type: "Honeymoon" | "Family" | "Group" | "Corporate" | "Educational" | "Religious" | "Adventure";
  duration: string;
  nights: number;
  days: number;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  image: string;
  highlights: string[];
  inclusions: string[];
  isInternational: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: "Individual" | "Corporate";
  totalBookings: number;
  totalSpent: number;
  loyaltyPoints: number;
  tier: "Silver" | "Gold" | "Platinum";
  passportNo?: string;
  visaStatus?: "Valid" | "Expired" | "None";
  lastBooking?: string;
  city: string;
  createdAt: string;
  avatar?: string;
}

export interface Lead {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  source: "Website" | "WhatsApp" | "Phone" | "Walk-in" | "Facebook" | "Instagram" | "Google Ads" | "Referral";
  service: "Flight" | "Hotel" | "Holiday";
  value: number;
  stage: "New" | "Qualified" | "Follow-up" | "Quotation Sent" | "Negotiation" | "Won" | "Lost";
  assignedTo: string;
  expectedClose: string;
  createdAt: string;
  notes: string;
}

export type BookingStatus =
  | "Draft"
  | "Awaiting Passenger Details"
  | "Pending Initial Payment"
  | "Partially Paid"
  | "Payment Received"
  | "In Progress"
  | "Partially Confirmed"
  | "Confirmed"
  | "Travel Documents Ready"
  | "Completed"
  | "Cancelled"
  | "Pending"
  | "Ticketed"
  | "Refunded"
  | "Failed";

export interface BookingPassenger {
  id: string;
  bookingId?: string;
  roomIndex: number;
  isLead: boolean;
  title?: string | null;
  firstName: string;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  passportIssueDate?: string | null;
  passportExpiry?: string | null;
  mobile?: string | null;
  email?: string | null;
  panNumber?: string | null;
  panVerified?: boolean;
  panRegisteredName?: string | null;
  panStatus?: string;
}

export interface PaymentRequestItem {
  id: string;
  requestRef: string;
  label: string;
  amount: number;
  amountPaid: number;
  dueDate?: string | null;
  status: string;
  notes?: string | null;
}

export interface BookingServiceItem {
  id: string;
  serviceType: string;
  title: string;
  status: string;
  confirmationNo?: string | null;
  supplierName?: string | null;
  voucherUrl?: string | null;
  ticketUrl?: string | null;
  costPrice: number;
  sellingPrice: number;
  notes?: string | null;
}

export interface ChangeRequestItem {
  id: string;
  requestRef: string;
  requestType: string;
  category: string;
  status: string;
  priority: string;
  description?: string | null;
  estimatedAdditionalCost: number;
  requestedBy: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  bookingRef: string;
  customerName: string;
  service: "Flight" | "Hotel" | "Holiday";
  route: string;
  travelDate: string;
  amount: number;
  commission: number;
  status: BookingStatus;
  paymentStatus: "Paid" | "Pending" | "Partial" | "Refunded";
  paymentMethod?: string;
  agent: string;
  agency: string;
  createdAt: string;
  quotationId?: string | null;
  quoteNo?: string | null;
  destination?: string | null;
  nights?: number | null;
  totalRooms?: number | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  packageValue?: number | null;
  amountPaid?: number;
  balanceAmount?: number;
  costPrice?: number;
  grossProfit?: number;
  netProfit?: number;
  salesExecutiveName?: string | null;
  operationsExecutiveName?: string | null;
  isInternational?: boolean;
  policiesAcceptedAt?: string | null;
  termsAndConditions?: string | null;
  paymentTerms?: string | null;
  cancellationPolicy?: string | null;
  packageIncludes?: unknown;
  packageExcludes?: unknown;
  passengers?: BookingPassenger[];
  paymentRequests?: PaymentRequestItem[];
  services?: BookingServiceItem[];
  changeRequests?: ChangeRequestItem[];
  addOns?: { id: string; addOnType: string; title: string; amount: number }[];
  invoices?: { id: string; invoiceNo: string; invoiceType: string; total: number; status: string }[];
  documents?: { id: string; docType: string; fileName: string; fileUrl: string }[];
}

export interface Payment {
  id: string;
  txnId: string;
  customerName: string;
  bookingRef: string;
  amount: number;
  method: "Razorpay" | "UPI" | "Card" | "Net Banking" | "Cash" | "Bank Transfer" | "Wallet";
  status: "Success" | "Pending" | "Failed" | "Refunded";
  type: "Payment" | "Refund" | "Wallet Credit" | "Commission";
  date: string;
  gateway?: string;
}

export interface WalletTransaction {
  id: string;
  type: "Credit" | "Debit";
  source: "Commission" | "Payment" | "Refund" | "Top-up" | "Transfer" | "Booking";
  amount: number;
  balance: number;
  description: string;
  date: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: "Sales" | "Operations" | "Accounts" | "Support" | "Management";
  branch: string;
  branchId?: string | null;
  role: Role;
  status: "Active" | "On Leave" | "Inactive";
  salary: number;
  incentives: number;
  target: number;
  achieved: number;
  attendance: number;
  joinDate: string;
  avatar?: string;
  permissions?: Module[] | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedBy: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "To Do" | "In Progress" | "Review" | "Completed";
  dueDate: string;
  relatedTo?: string;
  createdAt: string;
}

export type QuotationStatus =
  | "Draft"
  | "In Progress"
  | "Pending Approval"
  | "Sent to Agent"
  | "Sent"
  | "Customer Reviewing"
  | "Revision Requested"
  | "Accepted"
  | "Rejected"
  | "Expired"
  | "Converted to Booking"
  | "Archived";

export interface QuotationPackage {
  id?: string;
  name: string;
  sortOrder?: number;
  isSelected?: boolean;
  description?: string;
  hotels?: Array<Record<string, unknown>>;
  flights?: Array<Record<string, unknown>>;
  transfers?: Array<Record<string, unknown>>;
  activities?: Array<Record<string, unknown>>;
  meals?: Array<Record<string, unknown>>;
  itinerary?: Array<Record<string, unknown>>;
  visa?: Record<string, unknown> | null;
  insurance?: Record<string, unknown> | null;
  addOns?: Array<Record<string, unknown>>;
  inclusions?: string[];
  exclusions?: string[];
  totalNetCost?: number;
  totalSelling?: number;
  grossProfit?: number;
  gst?: number;
  total?: number;
  perPersonCost?: number;
}

export interface Quotation {
  id: string;
  quoteNo: string;
  customerName: string;
  service: "Flight" | "Hotel" | "Holiday" | "International" | "Activity" | "Transfer";
  items: number;
  amount: number;
  gst: number;
  total: number;
  status: QuotationStatus;
  validTill: string;
  createdBy: string;
  createdAt: string;
  isInternational?: boolean;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  destination?: string;
  country?: string;
  coverImage?: string;
  departureCity?: string;
  travelDates?: string;
  returnDate?: string;
  nights?: number;
  days?: number;
  adults?: number;
  children?: number;
  infants?: number;
  hotelStarPreference?: string;
  roomTypePreference?: string;
  mealPlanPreference?: string;
  location?: string;
  budget?: number;
  currency?: string;
  packageIncludes?: string[];
  packageExcludes?: string[];
  termsAndConditions?: string;
  paymentTerms?: string;
  cancellationPolicy?: string;
  refundPolicy?: string;
  salesExecutiveName?: string;
  salesExecutivePhone?: string;
  salesExecutiveEmail?: string;
  approvalStatus?: "Draft" | "Pending" | "Approved" | "Rejected";
  couponCode?: string;
  couponDiscount?: number;
  lineItems?: Array<{
    description: string;
    qty: number;
    price: number;
    type?: string;
    imageUrl?: string;
    currency?: string;
  }>;
  quoteDate?: string;
  travelStartDate?: string;
  travelEndDate?: string;
  agentName?: string;
  specialRequests?: string;
  internalNotes?: string;
  totalNetCost?: number;
  totalSelling?: number;
  grossProfit?: number;
  profitMargin?: number;
  discountType?: string | null;
  discountValue?: number;
  discountAmount?: number;
  taxRate?: number;
  perPersonCost?: number;
  currentVersion?: number;
  wizardStep?: number;
  enquiryRef?: string;
  selectedPackageId?: string | null;
  convertedBookingId?: string | null;
  packages?: QuotationPackage[];
  versions?: Array<{
    id: string;
    versionNumber: number;
    changeSummary?: string | null;
    createdAt: string;
    createdByName?: string | null;
  }>;
  approvals?: Array<{ stage: string; status: string; comments?: string | null; decidedAt?: string | null }>;
}

export type NewQuotationInput = {
  customerName: string;
  service: string;
  items: number;
  amount: number;
  gst: number;
  total: number;
  validTill: string;
  createdBy: string;
  status?: string;
  approvalStatus?: string;
  isInternational?: boolean;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  destination?: string;
  country?: string;
  departureCity?: string;
  travelDates?: string;
  returnDate?: string;
  nights?: number;
  days?: number;
  adults?: number;
  children?: number;
  infants?: number;
  hotelStarPreference?: string;
  roomTypePreference?: string;
  mealPlanPreference?: string;
  location?: string;
  budget?: number;
  currency?: string;
  packageIncludes?: string[];
  packageExcludes?: string[];
  termsAndConditions?: string;
  paymentTerms?: string;
  cancellationPolicy?: string;
  salesExecutiveName?: string;
  salesExecutivePhone?: string;
  salesExecutiveEmail?: string;
  couponCode?: string;
  couponDiscount?: number;
  lineItems?: Quotation["lineItems"];
};

export interface ProductRecord {
  id: string;
  name: string;
  status: "Active" | "Archived" | "Draft" | "Inactive";
  destinationId?: string | null;
  destination?: { id: string; name: string; country?: string; region?: string | null; thumbnail?: string | null; heroImage?: string | null } | null;
  supplier?: { id: string; name: string } | null;
  supplierId?: string | null;
  city?: string;
  location?: string;
  country?: string;
  region?: string;
  currency?: string;
  language?: string;
  bestTimeToVisit?: string;
  thumbnail?: string;
  heroImage?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string;
  updatedByName?: string;
  approvalStatus?: string;
  pendingRateChanges?: Record<string, unknown> | null;
  transferOptions?: Array<{ transferProductId: string; label: string }>;
  [key: string]: unknown;
}

export interface DestinationRecord extends ProductRecord {
  slug: string;
  shortDescription?: string;
  longDescription?: string;
  timeZone?: string;
  visaRequired?: boolean;
  visaDetails?: string;
  passportValidity?: string;
  climate?: string;
  averageBudget?: string;
  popularAttractions?: string[];
  localTransport?: string;
  foodSpecialities?: string[];
  shopping?: string;
  nightlife?: string;
  adventureActivities?: string[];
  familyFriendly?: boolean;
  coupleFriendly?: boolean;
  seniorFriendly?: boolean;
  galleryImages?: string[];
  bannerImage?: string;
  videoUrl?: string;
  imageAltText?: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

export interface TravelPackageRecord {
  id: string;
  packageCode: string;
  packageName: string;
  destinationId: string;
  destination?: { id: string; name: string; country?: string; thumbnail?: string | null; heroImage?: string | null };
  durationDays: number;
  durationNights: number;
  packageType: string;
  description?: string | null;
  highlights?: string[];
  status: "Draft" | "Published" | "Archived";
  startingPrice: number;
  currency: string;
  heroImage?: string | null;
  bannerImage?: string | null;
  isFeatured: boolean;
  hotelCost: number;
  activityCost: number;
  transferCost: number;
  markup: number;
  tax: number;
  discount: number;
  finalPrice: number;
  currentVersion: number;
  metadata?: Record<string, unknown>;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { hotels: number; activities: number; transfers: number };
  hotels?: PackageLinkedItem[];
  activities?: PackageLinkedItem[];
  transfers?: PackageLinkedItem[];
  days?: PackageDayRecord[];
  productOptions?: PackageProductOptionRecord[];
}

export type PackageProductType = "HOTEL" | "ACTIVITY" | "TRANSFER";

export interface PackageProductOptionRecord {
  id: string;
  packageId?: string;
  productType: PackageProductType;
  productId: string;
  optionGroup: string;
  isDefault: boolean;
  sortOrder: number;
  priceAdjustment: number;
  status: "Active" | "Inactive";
  notes?: string | null;
  product?: ProductRecord & { basePrice?: number };
  createdAt?: string;
  updatedAt?: string;
}

export type TimelineItemType = "HOTEL" | "ACTIVITY" | "TRANSFER" | "TEXT";

export interface MealPlan {
  breakfast?: boolean;
  lunch?: boolean;
  dinner?: boolean;
  snacks?: boolean;
}

export interface PackageTimelineItemRecord {
  id: string;
  packageDayId?: string;
  itemType: TimelineItemType;
  referenceId?: string | null;
  optionGroup?: string | null;
  title: string;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder: number;
  icon?: string | null;
  notes?: string | null;
}

export interface PackageDayRecord {
  id: string;
  packageId?: string;
  dayNumber: number;
  title: string;
  description?: string | null;
  mealPlan?: MealPlan;
  coverImage?: string | null;
  gallery?: string[];
  sortOrder?: number;
  items: PackageTimelineItemRecord[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ItineraryProductRef {
  id: string;
  name: string;
  description?: string;
  image?: string;
  duration?: string;
  subtitle?: string;
}

export interface PackageLinkedItem {
  id: string;
  sortOrder: number;
  hotelProduct?: ProductRecord;
  activityProduct?: ProductRecord;
  transferProduct?: ProductRecord;
}

export interface PackageVersionRecord {
  id: string;
  packageId: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  changeSummary?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export type TravelRequirementStatus = "Draft" | "Qualified" | "Quoted" | "Booked" | "Cancelled";

export interface TravelRequirementRecord {
  id: string;
  requirementCode: string;
  customerId?: string | null;
  leadId?: string | null;
  destinationId: string;
  destination?: { id: string; name: string; country?: string; thumbnail?: string | null };
  customer?: { id: string; name: string; email?: string; phone?: string } | null;
  lead?: { id: string; customerName: string; email?: string; phone?: string; stage?: string } | null;
  travelStartDate: string;
  travelEndDate: string;
  days: number;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  budgetMin: number;
  budgetMax: number;
  hotelCategory?: string | null;
  packageType?: string | null;
  preferredMealPlan?: Record<string, boolean>;
  preferredTransfer?: string | null;
  flightRequired: boolean;
  visaRequired: boolean;
  insuranceRequired: boolean;
  specialRequests?: string | null;
  status: TravelRequirementStatus;
  selectedPackageId?: string | null;
  markup: number;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  selections?: TravelRequirementSelectionRecord[];
  history?: TravelRequirementHistoryRecord[];
}

export interface TravelRequirementSelectionRecord {
  id: string;
  requirementId: string;
  packageId: string;
  hotelOptionGroup?: string | null;
  activityOptionGroup?: string | null;
  transferOptionGroup?: string | null;
  markup: number;
  hotelCost: number;
  activityCost: number;
  transferCost: number;
  sellingPrice: number;
  matchScore?: number | null;
  matchReasons?: string[];
  isSelected: boolean;
}

export interface TravelRequirementHistoryRecord {
  id: string;
  requirementId: string;
  action: string;
  summary?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface PackageMatchRecord {
  packageId: string;
  score: number;
  reasons: string[];
  package: {
    id: string;
    packageCode: string;
    packageName: string;
    destination?: { id: string; name: string; country?: string; thumbnail?: string | null };
    durationDays: number;
    durationNights: number;
    packageType: string;
    startingPrice: number;
    finalPrice: number;
    currency: string;
    heroImage?: string | null;
    hotelOptionGroups?: string[];
    activityOptionGroups?: string[];
    transferOptionGroups?: string[];
  };
}

export interface Notification {
  id: string;
  type: "booking" | "payment" | "api" | "customer" | "internal" | "task";
  title: string;
  message: string;
  time: string;
  read: boolean;
  priority: "low" | "medium" | "high";
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: "Present" | "Absent" | "Half Day" | "On Leave";
}

export interface Leave {
  id: string;
  userId: string;
  userName: string;
  type: "Casual" | "Sick" | "Earned" | "Unpaid";
  fromDate: string;
  toDate: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  approvedByName?: string;
  createdAt: string;
}

export type QuoteSectionType =
  | "COVER" | "OVERVIEW" | "DESTINATION_HIGHLIGHTS" | "ITINERARY" | "HOTELS" | "ACTIVITIES" | "FLIGHTS" | "TRANSFERS"
  | "PRICING" | "INCLUSIONS" | "EXCLUSIONS" | "VISA" | "TERMS" | "CANCELLATION" | "NOTES" | "CONTACT" | "CUSTOM_HTML";

export type QuoteTemplateStatus = "Draft" | "Active" | "Archived";

export interface QuoteTemplateSectionRecord {
  id: string;
  templateId?: string;
  sectionType: QuoteSectionType;
  sortOrder: number;
  isVisible: boolean;
  customTitle?: string | null;
  settings?: Record<string, unknown>;
}

export interface QuoteTemplateHistoryRecord {
  id: string;
  templateId: string;
  action: string;
  summary?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface QuoteTemplateRecord {
  id: string;
  agencyId?: string | null;
  templateName: string;
  description?: string | null;
  theme: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  logo?: string | null;
  watermark?: string | null;
  headerStyle?: Record<string, unknown>;
  footerStyle?: Record<string, unknown>;
  pageSize: string;
  orientation: string;
  backgroundImage?: string | null;
  showPageNumbers: boolean;
  isDefault: boolean;
  status: QuoteTemplateStatus;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  sections?: QuoteTemplateSectionRecord[];
  history?: QuoteTemplateHistoryRecord[];
  _count?: { sections: number };
}

export interface AgencyBrandingRecord {
  id: string;
  agencyId: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  logo?: string | null;
  watermark?: string | null;
  footerText?: string | null;
  backgroundImage?: string | null;
  headerHtml?: string | null;
  showPageNumbers: boolean;
  updatedAt: string;
}

export interface QuotePreviewMockData {
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  agency: { name: string; tagline: string; phone: string; email: string; website: string };
  customer: { name: string; email: string; phone: string; pax: string };
  package: { name: string; destination: string; duration: string; travelDates: string; heroImage: string };
  highlights: string[];
  days: { dayNumber: number; title: string; items: { time: string; title: string; description: string }[] }[];
  hotels: { name: string; category: string; nights: number; room: string; mealPlan: string }[];
  activities: { name: string; duration: string; description: string; location?: string }[];
  flights: { route: string; airline: string; flightNo: string; date: string; class: string }[];
  transfers: { name: string; type: string; notes: string }[];
  pricing: {
    hotelCost: number; activityCost: number; transferCost: number; flightCost: number;
    markup: number; discount: number; tax: number; total: number; currency: string;
  };
  inclusions: string[];
  exclusions: string[];
  visa: { required: boolean; details: string };
  terms: string;
  cancellation: string;
  notes: string;
  contact: { executive: string; designation: string; phone: string; email: string };
  customHtml: string;
}

export type ProposalStatus =
  | "Draft" | "Internal Review" | "Approved" | "Sent" | "Viewed"
  | "Accepted" | "Booked" | "Rejected" | "Expired" | "Cancelled";

export interface ProposalSnapshotRecord {
  id: string;
  proposalId: string;
  versionNumber: number;
  snapshot: ProposalSnapshotData;
  changeSummary?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface ProposalHistoryRecord {
  id: string;
  proposalId: string;
  action: string;
  summary?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  versionNumber?: number | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface ProposalSnapshotData {
  capturedAt: string;
  requirement?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  lead?: Record<string, unknown> | null;
  destination?: Record<string, unknown> | null;
  package: Record<string, unknown>;
  productOptions: Record<string, unknown>[];
  productPrices: Record<string, number>;
  productSelections: {
    hotelOptionGroup: string | null;
    activityOptionGroup: string | null;
    transferOptionGroup: string | null;
  };
  pricing: {
    hotelCost: number;
    activityCost: number;
    transferCost: number;
    packageBase: number;
    markup: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
  };
  template?: Record<string, unknown> | null;
  branding?: Record<string, unknown> | null;
  terms: {
    inclusions: string[];
    exclusions: string[];
    termsText: string;
    cancellationText: string;
    visaRequired: boolean;
    visaDetails: string;
  };
}

export interface TravelProposalRecord {
  id: string;
  agencyId?: string | null;
  proposalNumber: string;
  travelRequirementId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  selectedPackageId?: string | null;
  selectedTemplateId?: string | null;
  proposalStatus: ProposalStatus;
  currency: string;
  validUntil?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  currentVersion: number;
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
  pdfVersion?: number | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; email?: string; phone?: string } | null;
  lead?: { id: string; customerName: string; email?: string; phone?: string } | null;
  travelRequirement?: { id: string; requirementCode: string } | null;
  history?: ProposalHistoryRecord[];
}

export interface ProposalPdfRecord {
  id: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  generatedAt: string;
  generatedByName?: string | null;
}

export type ViewKey =
  | "dashboard"
  | "flights"
  | "hotels"
  | "hotel-products"
  | "destinations"
  | "activity-packages"
  | "packages"
  | "product-approvals"
  | "holiday"
  | "attendance"
  | "customers"
  | "crm"
  | "trip-planner"
  | "travel-proposals"
  | "quote-templates"
  | "branding"
  | "quotations"
  | "bookings"
  | "payments"
  | "wallet"
  | "commission"
  | "reports"
  | "employees"
  | "tasks"
  | "support"
  | "notifications"
  | "marketing"
  | "cms"
  | "finance"
  | "api-management"
  | "settings"
  | "audit-logs"
  | "agencies"
  | "branches"
  | "api-marketplace"
  | "monitoring"
  | "analytics";
