/**
 * Sprint 19.7.5 — OAuth state encoder/decoder.
 */
import { describe, expect, it } from "vitest";
import {
  encodeOAuthState,
  decodeOAuthState,
} from "@/lib/integrations/oauth-state";

describe("encodeOAuthState + decodeOAuthState", () => {
  it("round-trips userId + subOrgId + redirectTo + agentId", () => {
    const encoded = encodeOAuthState({
      userId: "user_1",
      subOrgId: "sub_42",
      redirectTo: "/dashboard/foo",
      agentId: "agent_9",
    });
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeOAuthState(encoded);
    expect(decoded).toEqual({
      userId: "user_1",
      subOrgId: "sub_42",
      redirectTo: "/dashboard/foo",
      agentId: "agent_9",
    });
  });

  it("omits empty optional fields from the encoded payload", () => {
    const encoded = encodeOAuthState({ userId: "user_1" });
    const decoded = decodeOAuthState(encoded);
    expect(decoded).toEqual({
      userId: "user_1",
      subOrgId: undefined,
      redirectTo: undefined,
      agentId: undefined,
    });
  });

  it("returns null on missing input", () => {
    expect(decodeOAuthState(null)).toBeNull();
    expect(decodeOAuthState(undefined)).toBeNull();
    expect(decodeOAuthState("")).toBeNull();
  });

  it("returns null on non-base64 garbage", () => {
    expect(decodeOAuthState("not!valid!base64!!!")).toBeNull();
  });

  it("returns null when the payload is missing userId", () => {
    const garbage = Buffer.from(JSON.stringify({ subOrgId: "x" })).toString("base64url");
    expect(decodeOAuthState(garbage)).toBeNull();
  });

  it("drops non-string optional fields silently", () => {
    const sneaky = Buffer.from(
      JSON.stringify({ userId: "user_1", subOrgId: 42, redirectTo: ["/"] }),
    ).toString("base64url");
    const decoded = decodeOAuthState(sneaky);
    expect(decoded).toEqual({
      userId: "user_1",
      subOrgId: undefined,
      redirectTo: undefined,
      agentId: undefined,
    });
  });
});
