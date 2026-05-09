import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET } from "@/app/api/cognito/user-pools/[poolId]/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const callGet = (poolId: string) =>
  GET(new Request(`http://test/api/cognito/user-pools/${poolId}`), {
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
