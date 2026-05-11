import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  CreateResourceServerCommand,
  DeleteResourceServerCommand,
  DescribeResourceServerCommand,
  ListResourceServersCommand,
  UpdateResourceServerCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET, POST } from "@/app/api/cognito/user-pools/[poolId]/resource-servers/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/cognito/user-pools/[poolId]/resource-servers/[...identifier]/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const params = { params: Promise.resolve({ poolId: "abc" }) };
const resourceParams = { params: Promise.resolve({ poolId: "abc", identifier: ["api"] }) };

describe("GET /api/cognito/user-pools/[poolId]/resource-servers", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns resource servers", async () => {
    cognito.on(ListResourceServersCommand).resolves({
      ResourceServers: [{ Identifier: "api", Name: "API" }],
    });

    const res = await GET(new Request("http://test/api/cognito/user-pools/abc/resource-servers"), params);
    const body = await res.json();

    expect(body.resourceServers).toHaveLength(1);
  });
});

describe("POST /api/cognito/user-pools/[poolId]/resource-servers", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("creates a resource server", async () => {
    cognito.on(CreateResourceServerCommand).resolves({
      ResourceServer: { Identifier: "api", Name: "API" },
    });

    const res = await POST(
      new Request("http://test/api/cognito/user-pools/abc/resource-servers", {
        method: "POST",
        body: JSON.stringify({
          identifier: "api",
          name: "API",
          scopes: [{ ScopeName: "read", ScopeDescription: "Read access" }],
        }),
      }),
      params,
    );

    expect(res.status).toBe(201);
    expect(cognito.commandCalls(CreateResourceServerCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Identifier: "api",
      Name: "API",
      Scopes: [{ ScopeName: "read", ScopeDescription: "Read access" }],
    });
  });
});

describe("PATCH /api/cognito/user-pools/[poolId]/resource-servers/[identifier]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("updates a resource server", async () => {
    cognito.on(UpdateResourceServerCommand).resolves({
      ResourceServer: { Identifier: "api", Name: "API v2" },
    });

    const res = await PATCH(
      new Request("http://test/api/cognito/user-pools/abc/resource-servers/api", {
        method: "PATCH",
        body: JSON.stringify({
          name: "API v2",
          scopes: [{ ScopeName: "write", ScopeDescription: "Write access" }],
        }),
      }),
      resourceParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(UpdateResourceServerCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Identifier: "api",
      Name: "API v2",
      Scopes: [{ ScopeName: "write", ScopeDescription: "Write access" }],
    });
  });

  it("keeps the existing display name when name is omitted (scopes-only update)", async () => {
    cognito.on(DescribeResourceServerCommand).resolves({
      ResourceServer: { Identifier: "api", Name: "My API" },
    });
    cognito.on(UpdateResourceServerCommand).resolves({
      ResourceServer: { Identifier: "api", Name: "My API" },
    });

    const res = await PATCH(
      new Request("http://test/api/cognito/user-pools/abc/resource-servers/api", {
        method: "PATCH",
        body: JSON.stringify({
          scopes: [{ ScopeName: "read", ScopeDescription: "Read access" }],
        }),
      }),
      resourceParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(DescribeResourceServerCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Identifier: "api",
    });
    expect(cognito.commandCalls(UpdateResourceServerCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Identifier: "api",
      Name: "My API",
      Scopes: [{ ScopeName: "read", ScopeDescription: "Read access" }],
    });
  });
});

describe("DELETE /api/cognito/user-pools/[poolId]/resource-servers/[identifier]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("deletes a resource server", async () => {
    cognito.on(DeleteResourceServerCommand).resolves({});

    const res = await DELETE(
      new Request("http://test/api/cognito/user-pools/abc/resource-servers/api", { method: "DELETE" }),
      resourceParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(DeleteResourceServerCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      Identifier: "api",
    });
  });
});
