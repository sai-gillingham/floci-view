import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET } from "@/app/api/cognito/user-pools/[poolId]/users/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const callGet = (poolId: string) =>
  GET(new Request(`http://test/api/cognito/user-pools/${poolId}/users`), {
    params: Promise.resolve({ poolId }),
  });

describe("GET /api/cognito/user-pools/[poolId]/users", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns the user list", async () => {
    cognito.on(ListUsersCommand, { UserPoolId: "abc" }).resolves({
      Users: [{ Username: "alice" }, { Username: "bob" }],
    });
    const res = await callGet("abc");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(2);
  });

  it("returns 500 on SDK error", async () => {
    cognito.on(ListUsersCommand).rejects(new Error("forbidden"));
    const res = await callGet("abc");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });
});
