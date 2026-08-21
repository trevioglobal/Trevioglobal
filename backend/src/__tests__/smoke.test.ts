import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { db } from "../lib/db.js";

const SEEDED_EMAIL = "superadmin@travelpartner.pro";
const SEEDED_PASSWORD = "Passw0rd@123";
const EMPLOYEE_EMAIL = "sneha@wanderlusttravels.in";
const BRANCH_MANAGER_EMAIL = "manager.mumbai@wanderlusttravels.in";
const AGENCY_ADMIN_EMAIL = "admin@wanderlusttravels.in";
const ACCOUNTANT_EMAIL = "accounts@wanderlusttravels.in";

describe("smoke", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("GET /api/health returns 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects login with a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: SEEDED_EMAIL, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in with the seeded demo password and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: SEEDED_EMAIL, password: SEEDED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.password).toBeUndefined();
  });

  it("blocks an employee-role token from creating an agency (RBAC regression guard)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: EMPLOYEE_EMAIL, password: SEEDED_PASSWORD });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post("/api/agencies")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ name: "Test Agency", owner: "X", email: "x@x.com", phone: "1234567890" });
    expect(res.status).toBe(403);
  });

  it("no longer accepts Bus/Train/Visa/Insurance as a booking service", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: EMPLOYEE_EMAIL, password: SEEDED_PASSWORD });

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ customerName: "Test", service: "Bus", route: "A-B", travelDate: "2026-01-01", amount: 100, agentName: "Test", agencyName: "Test" });
    expect(res.status).toBe(400);
  });

  it("an employee can check in, request leave, and their branch manager can approve it", async () => {
    const employeeLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMPLOYEE_EMAIL, password: SEEDED_PASSWORD });
    const employeeToken = employeeLogin.body.token;

    const checkIn = await request(app)
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({});
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.attendance.checkIn).toBeTruthy();

    const leave = await request(app)
      .post("/api/leaves")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "Casual", fromDate: "2026-02-01", toDate: "2026-02-02", reason: "Personal" });
    expect(leave.status).toBe(201);
    expect(leave.body.leave.status).toBe("Pending");

    const managerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: BRANCH_MANAGER_EMAIL, password: SEEDED_PASSWORD });

    const approve = await request(app)
      .patch(`/api/leaves/${leave.body.leave.id}`)
      .set("Authorization", `Bearer ${managerLogin.body.token}`)
      .send({ status: "Approved" });
    expect(approve.status).toBe(200);
    expect(approve.body.leave.status).toBe("Approved");
  });

  it("scopes bookings to an employee's own records, not the whole agency", async () => {
    const employeeLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMPLOYEE_EMAIL, password: SEEDED_PASSWORD });

    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${employeeLogin.body.token}`);
    expect(res.status).toBe(200);
    for (const booking of res.body.bookings) {
      expect(booking.agentId).toBe(employeeLogin.body.user.id);
    }
  });

  it("enforces a restricted employee's per-module permissions on the API itself, and picks up admin changes without a re-login", async () => {
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: AGENCY_ADMIN_EMAIL, password: SEEDED_PASSWORD });
    const adminToken = adminLogin.body.token;

    const restrictedEmail = `flights-only-${Date.now()}@wanderlusttravels.in`;
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Flights Only",
        email: restrictedEmail,
        phone: "+91 90000 00001",
        designation: "Flight Consultant",
        permissions: ["flights", "bookings"],
      });
    expect(create.status).toBe(201);

    const restrictedLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: restrictedEmail, password: create.body.tempPassword });
    expect(restrictedLogin.status).toBe(200);
    const restrictedToken = restrictedLogin.body.token;

    const deniedBookings = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${restrictedToken}`);
    expect(deniedBookings.status).toBe(200); // "bookings" is in their permission list

    const deniedPayments = await request(app)
      .get("/api/payments")
      .set("Authorization", `Bearer ${restrictedToken}`);
    expect(deniedPayments.status).toBe(403); // "payments" is not

    // Admin widens their access — same (already-issued) token should pick this up immediately.
    const employeeRecord = await db.user.findUnique({ where: { email: restrictedEmail } });
    const employeeRow = await db.employee.findUnique({ where: { email: restrictedEmail } });
    expect(employeeRecord).toBeTruthy();
    expect(employeeRow).toBeTruthy();

    const widen = await request(app)
      .patch(`/api/employees/${employeeRow!.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permissions: ["flights", "bookings", "payments"] });
    expect(widen.status).toBe(200);

    const allowedPayments = await request(app)
      .get("/api/payments")
      .set("Authorization", `Bearer ${restrictedToken}`); // same old token, no re-login
    expect(allowedPayments.status).toBe(200);
  });

  it("forgot-password issues a reset token and reset-password updates login", async () => {
    const reset = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: ACCOUNTANT_EMAIL });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
    // Dev/test returns resetToken so automation can complete the flow without SMTP.
    expect(reset.body.resetToken).toBeTruthy();

    const newPassword = "ResetPassw0rd@123";
    const confirm = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: ACCOUNTANT_EMAIL,
        token: reset.body.resetToken,
        newPassword,
      });
    expect(confirm.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: ACCOUNTANT_EMAIL, password: SEEDED_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: ACCOUNTANT_EMAIL, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  it("forgot-password doesn't reveal whether an email exists", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody-at-all@wanderlusttravels.in" });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
  });

  it("paginates /api/bookings and reports a real total count", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEEDED_EMAIL, password: SEEDED_PASSWORD });

    const pageOne = await request(app)
      .get("/api/bookings?page=1&pageSize=1")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(pageOne.status).toBe(200);
    expect(pageOne.body.bookings.length).toBeLessThanOrEqual(1);
    expect(pageOne.body.page).toBe(1);
    expect(pageOne.body.pageSize).toBe(1);
    expect(typeof pageOne.body.total).toBe("number");
  });
});
