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
});
