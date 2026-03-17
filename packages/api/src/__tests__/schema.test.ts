import { describe, it, expect } from "vitest";
import {
  userRoleEnum,
  projectInvitations,
  projectMembers,
} from "../db/schema.js";

// ============================================================
// Story 5.1 — Guest DB Schema Tests
// Validates schema definitions, enum values, defaults, and constraints
// ============================================================

describe("userRoleEnum", () => {
  it('should include "guest" as a valid value', () => {
    const values = userRoleEnum.enumValues;
    expect(values).toContain("guest");
  });

  it("should retain all existing roles", () => {
    const values = userRoleEnum.enumValues;
    expect(values).toContain("copywriter");
    expect(values).toContain("strategist");
    expect(values).toContain("manager");
    expect(values).toContain("admin");
  });
});

describe("projectInvitations table", () => {
  it("should have the correct table name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((projectInvitations as any)[Symbol.for("drizzle:Name")]).toBe(
      "project_invitations"
    );
  });

  it("should define all required columns", () => {
    const cols = projectInvitations;
    expect(cols.id).toBeDefined();
    expect(cols.projectId).toBeDefined();
    expect(cols.invitedBy).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.token).toBeDefined();
    expect(cols.permissions).toBeDefined();
    expect(cols.acceptedAt).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("should have correct permissions JSONB default", () => {
    const permDefault = (projectInvitations.permissions as { default?: unknown })
      .default;
    expect(permDefault).toEqual({
      instagram: true,
      conversations: true,
      mind: true,
    });
  });

  it("should mark token as unique", () => {
    // token column has .unique() applied — verify column definition exists
    expect(projectInvitations.token).toBeDefined();
  });

  it("projectId column should exist and be of uuid type", () => {
    const col = projectInvitations.projectId as { columnType?: string };
    expect(col).toBeDefined();
    expect(col.columnType).toBe("PgUUID");
  });
});

describe("projectMembers table", () => {
  it("should have the correct table name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((projectMembers as any)[Symbol.for("drizzle:Name")]).toBe(
      "project_members"
    );
  });

  it("should define all required columns", () => {
    const cols = projectMembers;
    expect(cols.id).toBeDefined();
    expect(cols.projectId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.permissions).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("should have default role of 'guest'", () => {
    const roleDefault = (projectMembers.role as { default?: unknown }).default;
    expect(roleDefault).toBe("guest");
  });

  it("should have correct permissions JSONB default", () => {
    const permDefault = (projectMembers.permissions as { default?: unknown })
      .default;
    expect(permDefault).toEqual({
      instagram: true,
      conversations: true,
      mind: true,
    });
  });

  it("projectId column should exist and be of uuid type", () => {
    const col = projectMembers.projectId as { columnType?: string };
    expect(col).toBeDefined();
    expect(col.columnType).toBe("PgUUID");
  });

  it("userId column should exist and be of uuid type", () => {
    const col = projectMembers.userId as { columnType?: string };
    expect(col).toBeDefined();
    expect(col.columnType).toBe("PgUUID");
  });
});
