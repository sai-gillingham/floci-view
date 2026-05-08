import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET } from "@/app/api/cognito/user-pools/route";

const cognito = mockClient(CognitoIdentityProviderClient);

describe("GET /api/cognito/user-pools", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns the user-pool list", async () => {
    cognito.on(ListUserPoolsCommand).resolves({
      UserPools: [{ Id: "p1", Name: "Pool 1" }, { Id: "p2", Name: "Pool 2" }],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.userPools).toHaveLength(2);
  });

  it("returns 500 on SDK error", async () => {
    cognito.on(ListUserPoolsCommand).rejects(new Error("auth down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("auth down");
  });
});
