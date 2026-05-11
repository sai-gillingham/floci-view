import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  ListUserPoolClientsCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET, POST } from "@/app/api/cognito/user-pools/[poolId]/clients/route";
import {
  DELETE,
  GET as GET_CLIENT,
  PATCH,
} from "@/app/api/cognito/user-pools/[poolId]/clients/[clientId]/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const params = { params: Promise.resolve({ poolId: "abc" }) };
const clientParams = { params: Promise.resolve({ poolId: "abc", clientId: "cid" }) };

describe("GET /api/cognito/user-pools/[poolId]/clients", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns clients", async () => {
    cognito.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [{ ClientId: "cid", ClientName: "web" }],
    });

    const res = await GET(new Request("http://test/api/cognito/user-pools/abc/clients"), params);
    const body = await res.json();

    expect(body.clients).toHaveLength(1);
  });
});

describe("POST /api/cognito/user-pools/[poolId]/clients", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("creates a client", async () => {
    cognito.on(CreateUserPoolClientCommand).resolves({
      UserPoolClient: { ClientId: "cid", ClientName: "web" },
    });

    const res = await POST(
      new Request("http://test/api/cognito/user-pools/abc/clients", {
        method: "POST",
        body: JSON.stringify({
          clientName: "web",
          allowedOAuthFlows: ["code"],
          allowedOAuthScopes: "openid,email",
        }),
      }),
      params,
    );

    expect(res.status).toBe(201);
    expect(cognito.commandCalls(CreateUserPoolClientCommand)[0].args[0].input).toMatchObject({
      UserPoolId: "abc",
      ClientName: "web",
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: ["openid", "email"],
      AllowedOAuthFlowsUserPoolClient: true,
    });
  });
});

describe("GET /api/cognito/user-pools/[poolId]/clients/[clientId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("describes a client", async () => {
    cognito.on(DescribeUserPoolClientCommand).resolves({
      UserPoolClient: { ClientId: "cid", ClientName: "web" },
    });

    const res = await GET_CLIENT(
      new Request("http://test/api/cognito/user-pools/abc/clients/cid"),
      clientParams,
    );
    const body = await res.json();

    expect(body.client.ClientId).toBe("cid");
  });
});

describe("PATCH /api/cognito/user-pools/[poolId]/clients/[clientId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("preserves existing client settings when updating editable fields", async () => {
    cognito.on(DescribeUserPoolClientCommand).resolves({
      UserPoolClient: {
        UserPoolId: "abc",
        ClientId: "cid",
        ClientName: "old",
        ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH"],
        CallbackURLs: ["https://old.example/callback"],
      },
    });
    cognito.on(UpdateUserPoolClientCommand).resolves({
      UserPoolClient: { ClientId: "cid", ClientName: "new" },
    });

    const res = await PATCH(
      new Request("http://test/api/cognito/user-pools/abc/clients/cid", {
        method: "PATCH",
        body: JSON.stringify({ clientName: "new" }),
      }),
      clientParams,
    );

    expect(res.status).toBe(200);
    const input = cognito.commandCalls(UpdateUserPoolClientCommand)[0].args[0].input;
    expect(input.ClientName).toBe("new");
    expect(input.ExplicitAuthFlows).toEqual(["ALLOW_USER_SRP_AUTH"]);
    expect(input.CallbackURLs).toEqual(["https://old.example/callback"]);
  });
});

describe("DELETE /api/cognito/user-pools/[poolId]/clients/[clientId]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("deletes a client", async () => {
    cognito.on(DeleteUserPoolClientCommand).resolves({});

    const res = await DELETE(
      new Request("http://test/api/cognito/user-pools/abc/clients/cid", { method: "DELETE" }),
      clientParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(DeleteUserPoolClientCommand)[0].args[0].input).toEqual({
      UserPoolId: "abc",
      ClientId: "cid",
    });
  });
});
