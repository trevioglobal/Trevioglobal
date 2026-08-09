import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_USERS } from "../src/lib/mock-data";

const prisma = new PrismaClient();

const DEFAULT_SEED_PASSWORD = "Passw0rd@123";
const SUPER_ADMIN_EMAIL = "admin@travelpartner.pro";
const SUPER_ADMIN_PASSWORD = "TravioAdmin@2024!";
/** Dedicated developer login — full platform (super_admin) access for local/console work. */
const DEV_SUPER_ADMIN_EMAIL = "dev@trevioglobal.com";
const DEV_SUPER_ADMIN_PASSWORD = "Dev@Trevio2026!";

async function main() {
  console.log("🌱 Seeding Travel Partner Pro database...");
  console.log("");

  const hashedPassword = await bcrypt.hash(DEFAULT_SEED_PASSWORD, 10);
  const superAdminHashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const devSuperAdminHashedPassword = await bcrypt.hash(DEV_SUPER_ADMIN_PASSWORD, 10);

  // Create Super Admin User (REQUIRED FOR PRODUCTION)
  console.log("📍 Creating Super Admin account...");
  try {
    const existingSuperAdmin = await prisma.user.findUnique({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    if (!existingSuperAdmin) {
      await prisma.user.create({
        data: {
          name: "Super Administrator",
          email: SUPER_ADMIN_EMAIL,
          password: superAdminHashedPassword,
          phone: "+91-9999999999",
          role: "super_admin",
          designation: "Platform Administrator",
          status: "Active",
        },
      });
      console.log(`✅ Super Admin created: ${SUPER_ADMIN_EMAIL}`);
      console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
    } else {
      console.log(`✓ Super Admin already exists: ${SUPER_ADMIN_EMAIL}`);
    }
  } catch (error) {
    console.error(`❌ Failed to create Super Admin:`, error);
  }

  console.log("📍 Creating Developer Super Admin account...");
  try {
    await prisma.user.upsert({
      where: { email: DEV_SUPER_ADMIN_EMAIL },
      update: {
        password: devSuperAdminHashedPassword,
        role: "super_admin",
        designation: "Platform Developer",
        status: "Active",
        name: "Trevio Developer",
      },
      create: {
        id: "u-dev-1",
        name: "Trevio Developer",
        email: DEV_SUPER_ADMIN_EMAIL,
        password: devSuperAdminHashedPassword,
        phone: "+91 98000 00000",
        role: "super_admin",
        designation: "Platform Developer",
        status: "Active",
      },
    });
    console.log(`✅ Developer Super Admin: ${DEV_SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${DEV_SUPER_ADMIN_PASSWORD}`);
  } catch (error) {
    console.error(`❌ Failed to create Developer Super Admin:`, error);
  }

  console.log("");

  // One agency + branch — required so the agency_admin/branch_manager/employee/accountant
  // demo accounts have somewhere to belong. Everything else (bookings, customers, etc.)
  // starts empty; create real records through the app itself.
  await prisma.agency.upsert({
    where: { id: "ag-1" },
    update: {},
    create: {
      id: "ag-1",
      name: "Wanderlust Travels",
      owner: "Priya Sharma",
      email: "admin@wanderlusttravels.in",
      phone: "+91 98200 12345",
      plan: "Enterprise",
      status: "Active",
      apiAllocation: { flights: 50000, hotels: 30000 },
    },
  });

  await prisma.branch.upsert({
    where: { id: "br-1" },
    update: {},
    create: {
      id: "br-1",
      agencyId: "ag-1",
      name: "Mumbai - Andheri",
      manager: "Arjun Nair",
      city: "Mumbai",
    },
  });

  // Users (login accounts — one per role)
  for (const [, u] of Object.entries(ROLE_USERS)) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hashedPassword },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        password: hashedPassword,
        role: u.role,
        designation: u.designation,
        agencyId: u.agencyId,
        branchId: u.branchId,
        status: "Active",
      },
    });
  }

  await prisma.supplier.upsert({
    where: { id: "sup-1" },
    update: {},
    create: {
      id: "sup-1",
      agencyId: "ag-1",
      name: "Global Stays India",
      contactPerson: "Ravi Kumar",
      email: "contracts@globalstays.in",
      phone: "+91 98765 11111",
      type: "Hotel",
      status: "Active",
    },
  });

  const destinations = [
    {
      id: "dest-mumbai",
      name: "Mumbai",
      country: "India",
      region: "Maharashtra",
      city: "Mumbai",
      slug: "mumbai",
      shortDescription: "India's financial capital with coastal views and vibrant nightlife.",
      heroImage: "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=800",
      thumbnail: "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=400",
    },
    {
      id: "dest-goa",
      name: "Goa",
      country: "India",
      region: "West India",
      city: "Goa",
      slug: "goa",
      shortDescription: "Beach paradise with Portuguese heritage and lively nightlife.",
      heroImage: "https://images.unsplash.com/photo-1512343879784-a960cd67eb2b?w=800",
      thumbnail: "https://images.unsplash.com/photo-1512343879784-a960cd67eb2b?w=400",
    },
    {
      id: "dest-dubai",
      name: "Dubai",
      country: "UAE",
      region: "Middle East",
      city: "Dubai",
      slug: "dubai",
      shortDescription: "Iconic skyline, desert adventures, and world-class shopping.",
      heroImage: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800",
      thumbnail: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400",
    },
    {
      id: "dest-bali",
      name: "Bali",
      country: "Indonesia",
      region: "Southeast Asia",
      city: "Denpasar",
      slug: "bali",
      shortDescription: "Tropical island with temples, rice terraces, and beaches.",
      heroImage: "https://images.unsplash.com/photo-1537996194471-e667a5835a1d?w=800",
      thumbnail: "https://images.unsplash.com/photo-1537996194471-e667a5835a1d?w=400",
    },
    {
      id: "dest-singapore",
      name: "Singapore",
      country: "Singapore",
      region: "Southeast Asia",
      city: "Singapore",
      slug: "singapore",
      shortDescription: "Modern city-state with gardens, cuisine, and family attractions.",
      heroImage: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800",
      thumbnail: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400",
    },
  ];

  for (const dest of destinations) {
    await prisma.destination.upsert({
      where: { id: dest.id },
      update: {
        name: dest.name,
        country: dest.country,
        region: dest.region,
        city: dest.city,
        slug: dest.slug,
        shortDescription: dest.shortDescription,
        heroImage: dest.heroImage,
        thumbnail: dest.thumbnail,
        status: "Active",
        agencyId: "ag-1",
        deletedAt: null,
      },
      create: {
        id: dest.id,
        agencyId: "ag-1",
        name: dest.name,
        country: dest.country,
        region: dest.region,
        city: dest.city,
        slug: dest.slug,
        shortDescription: dest.shortDescription,
        heroImage: dest.heroImage,
        thumbnail: dest.thumbnail,
        status: "Active",
        currency: "INR",
        createdByName: "Seed",
      },
    });
  }

  // One approved hotel + activity + transfer per demo destination (product quote builder)
  const hotelSeeds = [
    {
      id: "hp-1",
      destinationId: "dest-mumbai",
      name: "Taj Lands End",
      city: "Mumbai",
      country: "India",
      address: "Bandra West, Mumbai",
      description: "Luxury waterfront hotel in Bandra with sea views and premium dining.",
      images: [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
        "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800",
      ],
      roomCategories: [{
        name: "Deluxe Sea View",
        description: "King bed, sea view, breakfast included",
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        mealPlan: "CP",
        pricing: { single: 12000, double: 15000, extraAdult: 3000, extraChild: 1500 },
      }],
    },
    {
      id: "hp-2",
      destinationId: "dest-goa",
      name: "W Goa",
      city: "Goa",
      country: "India",
      address: "Vagator Beach, Goa",
      description: "Beachfront lifestyle hotel with pool decks and nightlife.",
      images: ["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800"],
      roomCategories: [{
        name: "Wonderful Room",
        description: "Garden view with breakfast",
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        mealPlan: "CP",
        pricing: { single: 9000, double: 11000, extraAdult: 2500, extraChild: 1200 },
      }],
    },
    {
      id: "hp-3",
      destinationId: "dest-dubai",
      name: "Atlantis The Palm",
      city: "Dubai",
      country: "UAE",
      address: "Crescent Road, The Palm, Dubai",
      description: "Iconic Palm resort with aquarium, waterpark access, and sea views.",
      images: ["https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800"],
      roomCategories: [{
        name: "Palm Room",
        description: "Sea view room with breakfast",
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        mealPlan: "BB",
        pricing: { single: 28000, double: 32000, extraAdult: 6000, extraChild: 3000 },
      }],
    },
    {
      id: "hp-4",
      destinationId: "dest-bali",
      name: "Ayana Resort Bali",
      city: "Jimbaran",
      country: "Indonesia",
      address: "Karang Mas Estate, Jimbaran",
      description: "Cliffside resort with ocean views and spa experiences.",
      images: ["https://images.unsplash.com/photo-1537996194471-e667a5835a1d?w=800"],
      roomCategories: [{
        name: "Ocean View Room",
        description: "Private balcony with breakfast",
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        mealPlan: "BB",
        pricing: { single: 18000, double: 22000, extraAdult: 4000, extraChild: 2000 },
      }],
    },
    {
      id: "hp-5",
      destinationId: "dest-singapore",
      name: "Marina Bay Sands",
      city: "Singapore",
      country: "Singapore",
      address: "10 Bayfront Avenue, Singapore",
      description: "Landmark hotel with infinity pool and city skyline views.",
      images: ["https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800"],
      roomCategories: [{
        name: "Deluxe Room",
        description: "City view with breakfast",
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        mealPlan: "BB",
        pricing: { single: 26000, double: 30000, extraAdult: 5500, extraChild: 2800 },
      }],
    },
  ];

  for (const h of hotelSeeds) {
    await prisma.hotelProduct.upsert({
      where: { id: h.id },
      update: {
        agencyId: "ag-1",
        supplierId: "sup-1",
        destinationId: h.destinationId,
        name: h.name,
        description: h.description,
        starCategory: 5,
        address: h.address,
        city: h.city,
        country: h.country,
        images: h.images,
        roomCategories: h.roomCategories,
        currency: "INR",
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
      create: {
        id: h.id,
        agencyId: "ag-1",
        supplierId: "sup-1",
        destinationId: h.destinationId,
        name: h.name,
        description: h.description,
        starCategory: 5,
        address: h.address,
        city: h.city,
        country: h.country,
        images: h.images,
        roomCategories: h.roomCategories,
        currency: "INR",
        cancellationPolicy: "Free cancellation up to 72 hours before check-in",
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
    });
  }

  const activitySeeds = [
    {
      id: "ap-1",
      destinationId: "dest-dubai",
      name: "Dubai Desert Safari",
      description: "Evening desert safari with dune bashing, BBQ dinner and cultural show.",
      duration: "6 hours",
      location: "Dubai Desert Conservation Reserve",
      adultPrice: 4500,
      childPrice: 2500,
      images: ["https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=800"],
    },
    {
      id: "ap-2",
      destinationId: "dest-mumbai",
      name: "Mumbai Heritage Walk",
      description: "Guided walking tour of Colaba, Gateway of India and local markets.",
      duration: "3 hours",
      location: "Colaba Causeway",
      adultPrice: 1800,
      childPrice: 900,
      images: ["https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=800"],
    },
    {
      id: "ap-3",
      destinationId: "dest-goa",
      name: "North Goa Beach Hopping",
      description: "Half-day beach hopping with snorkeling stop and local lunch.",
      duration: "5 hours",
      location: "Calangute / Anjuna",
      adultPrice: 2200,
      childPrice: 1100,
      images: ["https://images.unsplash.com/photo-1512343879784-a960cd67eb2b?w=800"],
    },
    {
      id: "ap-4",
      destinationId: "dest-bali",
      name: "Ubud Rice Terrace & Temple Tour",
      description: "Private day tour covering Tegallalang, Ubud Palace and Tirta Empul.",
      duration: "8 hours",
      location: "Ubud",
      adultPrice: 3500,
      childPrice: 1800,
      images: ["https://images.unsplash.com/photo-1537996194471-e667a5835a1d?w=800"],
    },
    {
      id: "ap-5",
      destinationId: "dest-singapore",
      name: "Gardens by the Bay Night Tour",
      description: "Evening visit to Supertree Grove and Cloud Forest with guide.",
      duration: "3 hours",
      location: "Gardens by the Bay",
      adultPrice: 4200,
      childPrice: 2100,
      images: ["https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800"],
    },
  ];

  for (const a of activitySeeds) {
    await prisma.activityProduct.upsert({
      where: { id: a.id },
      update: {
        agencyId: "ag-1",
        destinationId: a.destinationId,
        name: a.name,
        description: a.description,
        duration: a.duration,
        location: a.location,
        meetingPoint: "Hotel lobby pickup",
        adultPrice: a.adultPrice,
        childPrice: a.childPrice,
        currency: "INR",
        images: a.images,
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
      create: {
        id: a.id,
        agencyId: "ag-1",
        destinationId: a.destinationId,
        name: a.name,
        description: a.description,
        duration: a.duration,
        location: a.location,
        meetingPoint: "Hotel lobby pickup",
        adultPrice: a.adultPrice,
        childPrice: a.childPrice,
        currency: "INR",
        images: a.images,
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
    });
  }

  const transferSeeds = [
    {
      id: "tp-1",
      destinationId: "dest-mumbai",
      name: "Mumbai Airport Transfer",
      pickupLocation: "Chhatrapati Shivaji Maharaj International Airport",
      dropLocation: "South Mumbai Hotels",
      privatePrice: 2500,
      sharedPrice: 800,
    },
    {
      id: "tp-2",
      destinationId: "dest-dubai",
      name: "DXB Airport Private Transfer",
      pickupLocation: "Dubai International Airport",
      dropLocation: "Palm / Marina Hotels",
      privatePrice: 4500,
      sharedPrice: 1200,
    },
    {
      id: "tp-3",
      destinationId: "dest-goa",
      name: "Goa Airport Transfer",
      pickupLocation: "Goa International Airport",
      dropLocation: "North Goa Hotels",
      privatePrice: 2200,
      sharedPrice: 700,
    },
    {
      id: "tp-4",
      destinationId: "dest-bali",
      name: "DPS Airport Transfer",
      pickupLocation: "Ngurah Rai International Airport",
      dropLocation: "Jimbaran / Seminyak Hotels",
      privatePrice: 2800,
      sharedPrice: 900,
    },
    {
      id: "tp-5",
      destinationId: "dest-singapore",
      name: "Changi Airport Transfer",
      pickupLocation: "Changi Airport",
      dropLocation: "Marina Bay / Orchard Hotels",
      privatePrice: 3500,
      sharedPrice: 1000,
    },
  ];

  for (const t of transferSeeds) {
    await prisma.transferProduct.upsert({
      where: { id: t.id },
      update: {
        agencyId: "ag-1",
        destinationId: t.destinationId,
        name: t.name,
        transferType: "Private",
        vehicleType: "Sedan",
        pickupLocation: t.pickupLocation,
        dropLocation: t.dropLocation,
        pickupTime: "On arrival",
        privatePrice: t.privatePrice,
        sharedPrice: t.sharedPrice,
        currency: "INR",
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
      create: {
        id: t.id,
        agencyId: "ag-1",
        destinationId: t.destinationId,
        name: t.name,
        transferType: "Private",
        vehicleType: "Sedan",
        pickupLocation: t.pickupLocation,
        dropLocation: t.dropLocation,
        pickupTime: "On arrival",
        privatePrice: t.privatePrice,
        sharedPrice: t.sharedPrice,
        currency: "INR",
        cancellationPolicy: "Free cancellation up to 12 hours before pickup",
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: "Seed",
        approvedAt: new Date(),
      },
    });
  }

  // Sample coupons for Wanderlust (ag-1) — real DB records, usable on quotations
  const couponSeeds = [
    {
      id: "cp-fly500",
      code: "FLY500",
      type: "Flat",
      value: 500,
      minOrderAmount: 5000,
      usageLimit: 1000,
      validTill: new Date("2027-12-31"),
      description: "Flat ₹500 off flights & packages",
    },
    {
      id: "cp-summer20",
      code: "SUMMER20",
      type: "Percent",
      value: 20,
      minOrderAmount: 10000,
      usageLimit: 500,
      maxDiscount: 5000,
      validTill: new Date("2027-06-30"),
      description: "20% off summer bookings (max ₹5,000)",
    },
  ] as const;

  for (const c of couponSeeds) {
    await prisma.coupon.upsert({
      where: { agencyId_code: { agencyId: "ag-1", code: c.code } },
      update: {
        type: c.type,
        value: c.value,
        minOrderAmount: c.minOrderAmount,
        usageLimit: c.usageLimit,
        maxDiscount: "maxDiscount" in c ? c.maxDiscount : null,
        validTill: c.validTill,
        status: "Active",
        description: c.description,
      },
      create: {
        id: c.id,
        agencyId: "ag-1",
        code: c.code,
        type: c.type,
        value: c.value,
        minOrderAmount: c.minOrderAmount,
        usageLimit: c.usageLimit,
        maxDiscount: "maxDiscount" in c ? c.maxDiscount : null,
        validFrom: new Date(),
        validTill: c.validTill,
        status: "Active",
        description: c.description,
      },
    });
  }

  console.log("✅ Database seeding completed!");
  console.log("");

  const counts = {
    agencies: await prisma.agency.count(),
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    suppliers: await prisma.supplier.count(),
    hotels: await prisma.hotelProduct.count(),
    activities: await prisma.activityProduct.count(),
    transfers: await prisma.transferProduct.count(),
    coupons: await prisma.coupon.count(),
  };

  console.log("📊 Database Counts:");
  console.log(`   Agencies: ${counts.agencies}`);
  console.log(`   Branches: ${counts.branches}`);
  console.log(`   Users: ${counts.users}`);
  console.log(`   Suppliers: ${counts.suppliers}`);
  console.log(`   Hotels: ${counts.hotels}`);
  console.log(`   Activities: ${counts.activities}`);
  console.log(`   Transfers: ${counts.transfers}`);
  console.log(`   Coupons: ${counts.coupons}`);
  console.log("");

  console.log("🔐 LOGIN CREDENTIALS:");
  console.log("━".repeat(60));
  console.log("PLATFORM SUPER ADMIN (alt):");
  console.log(`  Email: ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log("");
  console.log("DEVELOPER SUPER ADMIN:");
  console.log(`  Email: ${DEV_SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${DEV_SUPER_ADMIN_PASSWORD}`);
  console.log("");
  console.log("DEMO USERS (same password for all ROLE_USERS):");
  console.log(`  Password: ${DEFAULT_SEED_PASSWORD}`);
  console.log("");
  for (const [, u] of Object.entries(ROLE_USERS)) {
    console.log(`  • ${u.email} (${u.role})`);
  }
  console.log("");
  console.log("SAMPLE COUPONS (agency ag-1): FLY500, SUMMER20");
  console.log("━".repeat(60));
  console.log("");
  console.log("⚠️  IMPORTANT: Change all passwords after first login in production!");
  console.log("⚠️  Never reuse seed passwords on a public/production database.");
  if (process.env.NODE_ENV === "production") {
    console.log("⚠️  NODE_ENV=production: seed credentials are for bootstrap only — rotate immediately.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
