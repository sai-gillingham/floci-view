import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET, POST } from "@/app/api/cognito/user-pools/route";

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
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userPools).toHaveLength(2);
  });

  it("returns an empty array when the response has no UserPools", async () => {
    cognito.on(ListUserPoolsCommand).resolves({});
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userPools).toEqual([]);
  });

  it("returns 500 on SDK error", async () => {
    cognito.on(ListUserPoolsCommand).rejects(new Error("auth down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("auth down");
  });
});

describe("POST /api/cognito/user-pools", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("creates a user pool", async () => {
    cognito.on(CreateUserPoolCommand).resolves({
      UserPool: { Id: "p1", Name: "Pool 1" },
    });

    const res = await POST(
      new Request("http://test/api/cognito/user-pools", {
        method: "POST",
        body: JSON.stringify({ name: "Pool 1", autoVerifyEmail: true }),
      }),
    );

    expect(res.status).toBe(201);
    expect(cognito.commandCalls(CreateUserPoolCommand)[0].args[0].input).toEqual({
      PoolName: "Pool 1",
      AutoVerifiedAttributes: ["email"],
      DeletionProtection: "INACTIVE",
    });
  });

  it("requires a pool name", async () => {
    const res = await POST(
      new Request("http://test/api/cognito/user-pools", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(cognito.commandCalls(CreateUserPoolCommand)).toHaveLength(0);
  });

  it("returns 500 when create fails", async () => {
    cognito.on(CreateUserPoolCommand).rejects(new Error("limit exceeded"));

    const res = await POST(
      new Request("http://test/api/cognito/user-pools", {
        method: "POST",
        body: JSON.stringify({ name: "Pool" }),
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("limit exceeded");
  });
});
