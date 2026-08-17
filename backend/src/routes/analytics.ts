import express, { Request, Response } from "express";
import { db as prisma } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analyticsRouter = express.Router();

analyticsRouter.use(requireAuth, requireRole("super_admin"));

// Get API metrics with filters
analyticsRouter.get("/api-metrics", async (req: Request, res: Response) => {
  try {
    const { endpoint, method, hours = 24, limit = 100 } = req.query;

    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const metrics = await prisma.apiMetric.findMany({
      where: {
        createdAt: { gte: since },
        endpoint: endpoint ? { contains: String(endpoint) } : undefined,
        method: method ? String(method) : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
    });

    res.json({ metrics, count: metrics.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// Get performance summary (last 24 hours)
analyticsRouter.get("/summary", async (req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const metrics = await prisma.apiMetric.findMany({
      where: { createdAt: { gte: since } },
    });

    if (metrics.length === 0) {
      return res.json({
        totalRequests: 0,
        errorCount: 0,
        avgResponseTime: 0,
        uptime: 100,
        statusCodeDistribution: {},
      });
    }

    const totalRequests = metrics.length;
    const errorCount = metrics.filter((m) => m.statusCode >= 400).length;
    const avgResponseTime = Math.round(
      metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
    );

    // Group by status code
    const statusCodeDistribution: Record<number, number> = {};
    metrics.forEach((m) => {
      statusCodeDistribution[m.statusCode] =
        (statusCodeDistribution[m.statusCode] || 0) + 1;
    });

    const uptime =
      ((totalRequests - errorCount) / totalRequests) * 100 || 0;

    res.json({
      totalRequests,
      errorCount,
      errorRate: Math.round((errorCount / totalRequests) * 100),
      avgResponseTime,
      uptime: Math.round(uptime),
      statusCodeDistribution,
      timeRange: "24 hours",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// Get endpoint statistics
analyticsRouter.get("/endpoints", async (req: Request, res: Response) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const metrics = await prisma.apiMetric.findMany({
      where: { createdAt: { gte: since } },
    });

    const endpointStats: Record<
      string,
      {
        endpoint: string;
        method: string;
        count: number;
        avgResponseTime: number;
        errorCount: number;
        errorRate: number;
      }
    > = {};

    metrics.forEach((m) => {
      const key = `${m.method} ${m.endpoint}`;
      if (!endpointStats[key]) {
        endpointStats[key] = {
          endpoint: m.endpoint,
          method: m.method,
          count: 0,
          avgResponseTime: 0,
          errorCount: 0,
          errorRate: 0,
        };
      }
      endpointStats[key].count++;
      endpointStats[key].avgResponseTime += m.responseTime;
      if (m.statusCode >= 400) {
        endpointStats[key].errorCount++;
      }
    });

    // Calculate averages and error rates
    const stats = Object.values(endpointStats).map((s) => ({
      ...s,
      avgResponseTime: Math.round(s.avgResponseTime / s.count),
      errorRate: Math.round((s.errorCount / s.count) * 100),
    }));

    res.json({ stats, count: stats.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch endpoint stats" });
  }
});

// Get error logs
analyticsRouter.get("/errors", async (req: Request, res: Response) => {
  try {
    const { hours = 24, limit = 50 } = req.query;
    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const errors = await prisma.apiMetric.findMany({
      where: {
        createdAt: { gte: since },
        statusCode: { gte: 400 },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
    });

    res.json({ errors, count: errors.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch errors" });
  }
});

// Get user activity metrics
analyticsRouter.get("/user-activity", async (req: Request, res: Response) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const metrics = await prisma.apiMetric.findMany({
      where: {
        createdAt: { gte: since },
        userId: { not: null },
      },
    });

    const userActivity: Record<
      string,
      { userId: string; requestCount: number; avgResponseTime: number; errorCount: number }
    > = {};

    metrics.forEach((m) => {
      if (!m.userId) return;
      if (!userActivity[m.userId]) {
        userActivity[m.userId] = {
          userId: m.userId,
          requestCount: 0,
          avgResponseTime: 0,
          errorCount: 0,
        };
      }
      userActivity[m.userId].requestCount++;
      userActivity[m.userId].avgResponseTime += m.responseTime;
      if (m.statusCode >= 400) {
        userActivity[m.userId].errorCount++;
      }
    });

    const activity = Object.values(userActivity)
      .map((a) => ({
        ...a,
        avgResponseTime: Math.round(a.avgResponseTime / a.requestCount),
      }))
      .sort((a, b) => b.requestCount - a.requestCount);

    res.json({ activity, count: activity.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

// Health check
analyticsRouter.get("/health-check", async (req: Request, res: Response) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: String(error),
    });
  }
});

// Clear old metrics (older than 30 days)
analyticsRouter.post("/cleanup", async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.apiMetric.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    res.json({
      message: `Deleted ${result.count} old metrics`,
      before: thirtyDaysAgo.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to cleanup metrics" });
  }
});
