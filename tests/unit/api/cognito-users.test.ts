import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET, POST } from "@/app/api/cognito/user-pools/[poolId]/users/route";
import {
  DELETE as DELETE_USER,
  PATCH as PATCH_USER,
  POST as POST_USER_ACTION,
} from "@/app/api/cognito/user-pools/[poolId]/users/[...username]/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const callGet = (poolId: string) =>
  GET(new Request(`http://test/api/cognito/user-pools/${poolId}/users`), {
    params: Promise.resolve({ poolId }),
  });
const callPost = (poolId: string, body: Record<string, unknown>) =>
  POST(
    new Request(`http://test/api/cognito/user-pools/${poolId}/users`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ poolId }) },
  );
const userParams = (poolId: string, username: string) => ({
  params: Promise.resolve({ poolId, username: [username] }),
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

  it("returns an empty array when the response has no Users", async () => {
    cognito.on(ListUsersCommand).resolves({});
    const res = await callGet("abc");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([]);
  });
});

describe("POST /api/cognito/user-pools/[poolId]/users", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("creates a member", async () => {
    cognito.on(AdminCreateUserCommand).resolves({ User: { Username: "alice" } });

    const res = await callPost("abc", {
      username: "alice",
      email: "alice@example.test",
      temporaryPassword: "Temp123!",
      suppressInvite: true,
    });

    expect(res.status).toBe(201);
    expect(cognito.commandCalls(AdminCreateUserCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Username: "alice",
      TemporaryPassword: "Temp123!",
      UserAttributes: [{ Name: "email", Value: "alice@example.test" }],
      MessageAction: "SUPPRESS",
    });
  });

  it("requires a username", async () => {
    const res = await callPost("abc", { email: "x@y.test" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Username is required");
    expect(cognito.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
  });

  it("omits UserAttributes and MessageAction when not applicable", async () => {
    cognito.on(AdminCreateUserCommand).resolves({ User: { Username: "bob" } });

    const res = await callPost("abc", { username: "bob" });

    expect(res.status).toBe(201);
    const input = cognito.commandCalls(AdminCreateUserCommand)[0].args[0].input;
    expect(input).toEqual({
      UserPoolId: "abc",
      Username: "bob",
      TemporaryPassword: undefined,
    });
  });

  it("returns 500 when create fails", async () => {
    cognito.on(AdminCreateUserCommand).rejects(new Error("username exists"));

    const res = await callPost("abc", { username: "alice" });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("username exists");
  });
});

describe("PATCH /api/cognito/user-pools/[poolId]/users/[username]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("updates attributes, enabled state, and password", async () => {
    cognito.on(AdminUpdateUserAttributesCommand).resolves({});
    cognito.on(AdminDisableUserCommand).resolves({});
    cognito.on(AdminSetUserPasswordCommand).resolves({});
    cognito.on(AdminGetUserCommand).resolves({ Username: "alice" });

    const res = await PATCH_USER(
      new Request("http://test/api/cognito/user-pools/abc/users/alice", {
        method: "PATCH",
        body: JSON.stringify({
          email: "alice@example.test",
          enabled: false,
          password: "Newpass123!",
          permanent: false,
        }),
      }),
      userParams("abc", "alice"),
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(AdminUpdateUserAttributesCommand)[0].args[0].input.UserAttributes).toEqual([
      { Name: "email", Value: "alice@example.test" },
    ]);
    expect(cognito.commandCalls(AdminDisableUserCommand)).toHaveLength(1);
    expect(cognito.commandCalls(AdminSetUserPasswordCommand)[0].args[0].input.Permanent).toBe(false);
  });
});

describe("POST /api/cognito/user-pools/[poolId]/users/[username]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("starts the forgot-password reset flow", async () => {
    cognito.on(AdminResetUserPasswordCommand).resolves({});

    const res = await POST_USER_ACTION(
      new Request("http://test/api/cognito/user-pools/abc/users/alice", {
        method: "POST",
        body: JSON.stringify({ action: "reset-password" }),
      }),
      userParams("abc", "alice"),
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(AdminResetUserPasswordCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Username: "alice",
    });
  });
});

describe("DELETE /api/cognito/user-pools/[poolId]/users/[username]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("deletes a member", async () => {
    cognito.on(AdminDeleteUserCommand).resolves({});

    const res = await DELETE_USER(
      new Request("http://test/api/cognito/user-pools/abc/users/alice", { method: "DELETE" }),
      userParams("abc", "alice"),
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Username: "alice",
    });
  });
});
