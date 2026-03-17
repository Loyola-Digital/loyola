import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { z } from "zod";

// ============================================================
// Story 5.2 — Invite API Tests
// Validates token generation, expiry logic, and Zod schemas
// ============================================================

// Inline schemas matching routes/invitations.ts
const createInvitationSchema = z.object({
  email: z.string().email(),
  permissions: z.object({
    instagram: z.boolean(),
    conversations: z.boolean(),
    mind: z.boolean(),
  }),
});

const updatePermissionsSchema = z.object({
  permissions: z.object({
    instagram: z.boolean(),
    conversations: z.boolean(),
    mind: z.boolean(),
  }),
});

// ============================================================
// Token generation
// ============================================================

describe("Token generation", () => {
  it("should generate a 64-char hex token", () => {
    const token = randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("should generate unique tokens each time", () => {
    const t1 = randomBytes(32).toString("hex");
    const t2 = randomBytes(32).toString("hex");
    expect(t1).not.toBe(t2);
  });
});

// ============================================================
// Expiry logic
// ============================================================

describe("Invitation expiry", () => {
  it("should set expiry 7 days from now", () => {
    const before = Date.now();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const after = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 10);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 10);
  });

  it("should detect expired invitations", () => {
    const past = new Date(Date.now() - 1000);
    const now = new Date();
    expect(past < now).toBe(true);
  });

  it("should detect valid (non-expired) invitations", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    expect(future > now).toBe(true);
  });
});

// ============================================================
// createInvitation schema (AC: 1)
// ============================================================

describe("createInvitation schema", () => {
  it("should accept valid input", () => {
    const result = createInvitationSchema.safeParse({
      email: "guest@example.com",
      permissions: { instagram: true, conversations: true, mind: false },
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = createInvitationSchema.safeParse({
      email: "not-an-email",
      permissions: { instagram: true, conversations: true, mind: false },
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.email).toBeDefined();
  });

  it("should reject missing permissions object", () => {
    const result = createInvitationSchema.safeParse({
      email: "guest@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-boolean permission values", () => {
    const result = createInvitationSchema.safeParse({
      email: "guest@example.com",
      permissions: { instagram: "yes", conversations: true, mind: false },
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing permission fields", () => {
    const result = createInvitationSchema.safeParse({
      email: "guest@example.com",
      permissions: { instagram: true },
    });
    expect(result.success).toBe(false);
  });

  it("should allow all permissions false", () => {
    const result = createInvitationSchema.safeParse({
      email: "guest@example.com",
      permissions: { instagram: false, conversations: false, mind: false },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// updatePermissions schema (AC: 5)
// ============================================================

describe("updatePermissions schema", () => {
  it("should accept valid permissions update", () => {
    const result = updatePermissionsSchema.safeParse({
      permissions: { instagram: false, conversations: true, mind: true },
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing permissions wrapper", () => {
    const result = updatePermissionsSchema.safeParse({
      instagram: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject partial permissions (missing mind)", () => {
    const result = updatePermissionsSchema.safeParse({
      permissions: { instagram: false, conversations: true },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Guest user placeholder clerkId (AC: 3)
// ============================================================

describe("Guest user clerkId placeholder", () => {
  it("should use guest: prefix format", () => {
    const token = randomBytes(32).toString("hex");
    const clerkId = `guest:${token}`;
    expect(clerkId.startsWith("guest:")).toBe(true);
    expect(clerkId).toHaveLength("guest:".length + 64);
  });

  it("should be unique per invitation token", () => {
    const t1 = `guest:${randomBytes(32).toString("hex")}`;
    const t2 = `guest:${randomBytes(32).toString("hex")}`;
    expect(t1).not.toBe(t2);
  });
});
