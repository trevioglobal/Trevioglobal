import "dotenv/config";
import { app, PORT } from "./app.js";
import { logger } from "./lib/logger.js";
import { startQuotationExpiryScheduler } from "./lib/quotation-expiry-scheduler.js";

app.listen(PORT, () => {
  logger.info(`Trevio API running on http://localhost:${PORT}`);
  startQuotationExpiryScheduler();
});
