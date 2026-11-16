import "dotenv/config";
import bcrypt from "bcryptjs";
import { app, PORT } from "./app.js";
import { db } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { startQuotationExpiryScheduler } from "./lib/quotation-expiry-scheduler.js";

const ADMIN_EMAIL = "naveen@trevioglobal.com";

async function ensureAdminAccount() {
  const password = process.env.ADMIN_DEFAULT_PASSWORD;
  if (!password || password.length < 12) {
    logger.warn("ADMIN_DEFAULT_PASSWORD must be configured with at least 12 characters; admin bootstrap skipped");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    await db.user.create({
      data: {
        name: "Naveen",
        email: ADMIN_EMAIL,
        password: passwordHash,
        role: "super_admin",
        designation: "Platform Administrator",
        status: "Active",
      },
    });
    logger.info({ email: ADMIN_EMAIL }, "Platform administrator account created");
    return;
  }

  await db.user.update({
    where: { id: existing.id },
    data: { password: passwordHash, role: "super_admin", status: "Active" },
  });
  logger.info({ email: ADMIN_EMAIL }, "Platform administrator access synchronized");
}

app.listen(PORT, () => {
  logger.info(`Trevio API running on http://localhost:${PORT}`);
  void ensureAdminAccount().catch((error) => {
    logger.error({ error }, "Unable to initialize the platform administrator account");
  });
  startQuotationExpiryScheduler();
});
