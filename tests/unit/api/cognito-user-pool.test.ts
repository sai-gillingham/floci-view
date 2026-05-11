import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DELETE, GET, PATCH } from "@/app/api/cognito/user-pools/[poolId]/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const callGet = (poolId: string) =>
  GET(new Request(`http://test/api/cognito/user-pools/${poolId}`), {
    params: Promise.resolve({ poolId }),
  });
const callPatch = (poolId: string, body: Record<string, unknown>) =>
  PATCH(
    new Request(`http://test/api/cognito/user-pools/${poolId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ poolId }) },
  );
const callDelete = (poolId: string) =>
  DELETE(new Request(`http://test/api/cognito/user-pools/${poolId}`, { method: "DELETE" }), {
    params: Promise.resolve({ poolId }),
  });

describe("GET /api/cognito/user-pools/[poolId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns the described user pool", async () => {
    cognito.on(DescribeUserPoolCommand, { UserPoolId: "abc" }).resolves({
      UserPool: { Id: "abc", Name: "My Pool" },
    });
    const res = await callGet("abc");
    const body = await res.json();
    expect(body.userPool.Id).toBe("abc");
  });

  it("returns null userPool when the response has none", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({});
    const res = await callGet("abc");
    const body = await res.json();
    expect(body.userPool).toBeNull();
  });

  it("returns 500 on SDK error", async () => {
    cognito.on(DescribeUserPoolCommand).rejects(new Error("not found"));
    const res = await callGet("abc");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });
});

describe("PATCH /api/cognito/user-pools/[poolId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("preserves existing settings when updating editable fields", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({
      UserPool: {
        Id: "abc",
        Name: "Old Pool",
        LambdaConfig: { PreSignUp: "arn:aws:lambda:test" },
        AutoVerifiedAttributes: ["email"],
        DeletionProtection: "ACTIVE",
        MfaConfiguration: "OFF",
      },
    });
    cognito.on(UpdateUserPoolCommand).resolves({});

    const res = await callPatch("abc", {
      name: "New Pool",
      deletionProtection: false,
      mfaConfiguration: "OPTIONAL",
      autoVerifyEmail: true,
      autoVerifyPhone: true,
    });

    expect(res.status).toBe(200);
    const input = cognito.commandCalls(UpdateUserPoolCommand)[0].args[0].input;
    expect(input.UserPoolId).toBe("abc");
    expect(input.PoolName).toBe("New Pool");
    expect(input.LambdaConfig).toEqual({ PreSignUp: "arn:aws:lambda:test" });
    expect(input.AutoVerifiedAttributes).toEqual(["email", "phone_number"]);
    expect(input.DeletionProtection).toBe("INACTIVE");
    expect(input.MfaConfiguration).toBe("OPTIONAL");
  });

  it("ignores invalid mfaConfiguration and keeps the pool value", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({
      UserPool: {
        Id: "abc",
        Name: "Pool",
        DeletionProtection: "INACTIVE",
        MfaConfiguration: "OFF",
      },
    });
    cognito.on(UpdateUserPoolCommand).resolves({});

    const res = await callPatch("abc", { name: "Pool", mfaConfiguration: "garbage" });

    expect(res.status).toBe(200);
    const input = cognito.commandCalls(UpdateUserPoolCommand)[0].args[0].input;
    expect(input.MfaConfiguration).toBe("OFF");
  });

  it("keeps existing auto-verified attributes when only one flag is sent", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({
      UserPool: {
        Id: "abc",
        Name: "Pool",
        AutoVerifiedAttributes: ["email", "phone_number"],
        DeletionProtection: "INACTIVE",
        MfaConfiguration: "OFF",
      },
    });
    cognito.on(UpdateUserPoolCommand).resolves({});

    const res = await callPatch("abc", { autoVerifyPhone: true });

    expect(res.status).toBe(200);
    const input = cognito.commandCalls(UpdateUserPoolCommand)[0].args[0].input;
    expect(input.AutoVerifiedAttributes).toEqual(["email", "phone_number"]);
  });

  it("returns 404 when the pool does not exist", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({});

    const res = await callPatch("abc", { name: "Nope" });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User pool not found");
    expect(cognito.commandCalls(UpdateUserPoolCommand)).toHaveLength(0);
  });

  it("returns 500 when update fails", async () => {
    cognito.on(DescribeUserPoolCommand).resolves({
      UserPool: { Id: "abc", Name: "P", DeletionProtection: "INACTIVE", MfaConfiguration: "OFF" },
    });
    cognito.on(UpdateUserPoolCommand).rejects(new Error("throttled"));

    const res = await callPatch("abc", { name: "X" });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("throttled");
  });

  it("returns the refreshed pool after update", async () => {
    cognito
      .on(DescribeUserPoolCommand)
      .resolvesOnce({
        UserPool: { Id: "abc", Name: "Old", DeletionProtection: "INACTIVE", MfaConfiguration: "OFF" },
      })
      .resolves({
        UserPool: { Id: "abc", Name: "New", DeletionProtection: "INACTIVE", MfaConfiguration: "OFF" },
      });
    cognito.on(UpdateUserPoolCommand).resolves({});

    const res = await callPatch("abc", { name: "New" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userPool?.Name).toBe("New");
    expect(cognito.commandCalls(DescribeUserPoolCommand)).toHaveLength(2);
  });
});

describe("DELETE /api/cognito/user-pools/[poolId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("deletes the user pool", async () => {
    cognito.on(DeleteUserPoolCommand).resolves({});

    const res = await callDelete("abc");

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(DeleteUserPoolCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
    });
  });

  it("returns 500 on SDK error", async () => {
    cognito.on(DeleteUserPoolCommand).rejects(new Error("access denied"));

    const res = await callDelete("abc");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("access denied");
  });
});
