/**
 * Sprint 19.7.4 — /api/sub-orgs/[id]/api-keys CRUD.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockEncrypt = vi.hoisted(() => vi.fn());
const mockMembership = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  subOrgApiKey: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/encryption", () => ({ encrypt: mockEncrypt }));
vi.mock("@/lib/permissions/sub-org-permissions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserSubOrgMembership: mockMembership,
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { GET as listGET, POST as listPOST } from "@/app/api/sub-orgs/[id]/api-keys/route";
import { DELETE as keyDELETE } from "@/app/api/sub-orgs/[id]/api-keys/[keyId]/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockEncrypt.mockReset();
  mockMembership.mockReset();
  mockPrisma.subOrgApiKey.findMany.mockReset();
  mockPrisma.subOrgApiKey.create.mockReset();
  mockPrisma.subOrgApiKey.deleteMany.mockReset();
});

function postReq(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/sub-orgs/[id]/api-keys", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await listGET(new Request("http://localhost/x"), { params: { id: "sub_1" } });
    expect(res.status).toBe(401);
  });

  it("404 when caller has no membership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce(null);
    const res = await listGET(new Request("http://localhost/x"), { params: { id: "sub_1" } });
    expect(res.status).toBe(404);
  });

  it("returns a redacted preview, never the encryptedKey", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "READ_ONLY" });
    mockPrisma.subOrgApiKey.findMany.mockResolvedValueOnce([
      {
        id: "k1",
        provider: "ANTHROPIC",
        label: "prod",
        encryptedKey: "0102:abcd:abcdef1234567890",
        createdBy: "user_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await listGET(new Request("http://localhost/x"), { params: { id: "sub_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys[0].preview.startsWith("••••")).toBe(true);
    expect("encryptedKey" in body.keys[0]).toBe(false);
  });
});

describe("POST /api/sub-orgs/[id]/api-keys", () => {
  it("403 when caller lacks integrations.manage", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "USE_AGENTS" });
    const res = await listPOST(postReq({ provider: "ANTHROPIC", label: "prod", key: "sk-x" }), {
      params: { id: "sub_1" },
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.subOrgApiKey.create).not.toHaveBeenCalled();
  });

  it("400 on invalid provider", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    const res = await listPOST(postReq({ provider: "NOT_A_PROVIDER", label: "prod", key: "sk-x" }), {
      params: { id: "sub_1" },
    });
    expect(res.status).toBe(400);
  });

  it("400 when label or key is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    const res = await listPOST(postReq({ provider: "ANTHROPIC", label: "  ", key: "sk-x" }), {
      params: { id: "sub_1" },
    });
    expect(res.status).toBe(400);
  });

  it("encrypts the key and persists with createdBy = caller", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_42" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockEncrypt.mockReturnValueOnce("iv:tag:ciphertext_xxxx");
    mockPrisma.subOrgApiKey.create.mockResolvedValueOnce({
      id: "k_new",
      provider: "ANTHROPIC",
      label: "prod",
      encryptedKey: "iv:tag:ciphertext_xxxx",
      createdAt: new Date(),
    });
    const res = await listPOST(postReq({ provider: "ANTHROPIC", label: "prod", key: "sk-secret" }), {
      params: { id: "sub_1" },
    });
    expect(res.status).toBe(201);
    expect(mockEncrypt).toHaveBeenCalledWith("sk-secret");
    expect(mockPrisma.subOrgApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subOrgId: "sub_1",
          provider: "ANTHROPIC",
          label: "prod",
          encryptedKey: "iv:tag:ciphertext_xxxx",
          createdBy: "user_42",
        }),
      }),
    );
    const body = await res.json();
    expect(body.preview.startsWith("••••")).toBe(true);
  });

  it("returns 409 on unique-constraint violation", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockEncrypt.mockReturnValueOnce("iv:tag:ct");
    mockPrisma.subOrgApiKey.create.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`subOrgId`, `provider`, `label`)"),
    );
    const res = await listPOST(postReq({ provider: "ANTHROPIC", label: "prod", key: "sk-x" }), {
      params: { id: "sub_1" },
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/sub-orgs/[id]/api-keys/[keyId]", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await keyDELETE(new Request("http://localhost/x"), {
      params: { id: "sub_1", keyId: "k_x" },
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller lacks integrations.manage", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "READ_ONLY" });
    const res = await keyDELETE(new Request("http://localhost/x"), {
      params: { id: "sub_1", keyId: "k_x" },
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.subOrgApiKey.deleteMany).not.toHaveBeenCalled();
  });

  it("404 when the key does not exist for this sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockPrisma.subOrgApiKey.deleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await keyDELETE(new Request("http://localhost/x"), {
      params: { id: "sub_1", keyId: "k_missing" },
    });
    expect(res.status).toBe(404);
  });

  it("deletes successfully when allowed", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockPrisma.subOrgApiKey.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await keyDELETE(new Request("http://localhost/x"), {
      params: { id: "sub_1", keyId: "k_present" },
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgApiKey.deleteMany).toHaveBeenCalledWith({
      where: { id: "k_present", subOrgId: "sub_1" },
    });
  });
});
