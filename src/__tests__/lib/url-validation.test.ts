import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolve4 = vi.hoisted(() => vi.fn());
const mockResolve6 = vi.hoisted(() => vi.fn());

vi.mock("dns/promises", () => ({
  default: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
}));

import { validateUrl } from "@/lib/url-validation";

describe("validateUrl", () => {
  beforeEach(() => {
    mockResolve4.mockReset();
    mockResolve6.mockReset();
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockResolvedValue([]);
  });

  it("allows https://example.com", async () => {
    await expect(validateUrl("https://example.com")).resolves.toEqual({
      safe: true,
    });
  });

  it("blocks localhost and metadata-style private addresses", async () => {
    await expect(validateUrl("http://127.0.0.1")).resolves.toMatchObject({ safe: false });
    await expect(validateUrl("http://169.254.169.254")).resolves.toMatchObject({ safe: false });
    await expect(validateUrl("http://localhost")).resolves.toMatchObject({ safe: false });
  });

  it("blocks file:// and ftp:// protocols", async () => {
    await expect(validateUrl("file:///etc/passwd")).resolves.toMatchObject({ safe: false });
    await expect(validateUrl("ftp://example.com/file.txt")).resolves.toMatchObject({ safe: false });
  });
});
