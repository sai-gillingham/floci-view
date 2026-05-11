import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  DeleteGroupCommand,
  ListGroupsCommand,
  ListUsersInGroupCommand,
  UpdateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET, POST } from "@/app/api/cognito/user-pools/[poolId]/groups/route";
import {
  DELETE as DELETE_GROUP,
  PATCH as PATCH_GROUP,
} from "@/app/api/cognito/user-pools/[poolId]/groups/[groupName]/route";
import {
  DELETE as DELETE_MEMBER,
  GET as GET_MEMBERS,
  POST as POST_MEMBER,
} from "@/app/api/cognito/user-pools/[poolId]/groups/[groupName]/members/route";

const cognito = mockClient(CognitoIdentityProviderClient);
const params = { params: Promise.resolve({ poolId: "abc" }) };
const groupParams = { params: Promise.resolve({ poolId: "abc", groupName: "admins" }) };

describe("GET /api/cognito/user-pools/[poolId]/groups", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("returns groups", async () => {
    cognito.on(ListGroupsCommand).resolves({ Groups: [{ GroupName: "admins" }] });

    const res = await GET(new Request("http://test/api/cognito/user-pools/abc/groups"), params);
    const body = await res.json();

    expect(body.groups).toHaveLength(1);
  });
});

describe("POST /api/cognito/user-pools/[poolId]/groups", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("creates a group", async () => {
    cognito.on(CreateGroupCommand).resolves({ Group: { GroupName: "admins" } });

    const res = await POST(
      new Request("http://test/api/cognito/user-pools/abc/groups", {
        method: "POST",
        body: JSON.stringify({ groupName: "admins", precedence: "1" }),
      }),
      params,
    );

    expect(res.status).toBe(201);
    expect(cognito.commandCalls(CreateGroupCommand)[0].args[0].input).toMatchObject({
      UserPoolId: "abc",
      GroupName: "admins",
      Precedence: 1,
    });
  });
});

describe("PATCH /api/cognito/user-pools/[poolId]/groups/[groupName]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("updates a group", async () => {
    cognito.on(UpdateGroupCommand).resolves({ Group: { GroupName: "admins" } });

    const res = await PATCH_GROUP(
      new Request("http://test/api/cognito/user-pools/abc/groups/admins", {
        method: "PATCH",
        body: JSON.stringify({ description: "Administrators" }),
      }),
      groupParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(UpdateGroupCommand)[0].args[0].input.Description).toBe("Administrators");
  });
});

describe("DELETE /api/cognito/user-pools/[poolId]/groups/[groupName]", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("deletes a group", async () => {
    cognito.on(DeleteGroupCommand).resolves({});

    const res = await DELETE_GROUP(
      new Request("http://test/api/cognito/user-pools/abc/groups/admins", { method: "DELETE" }),
      groupParams,
    );

    expect(res.status).toBe(200);
    expect(cognito.commandCalls(DeleteGroupCommand)[0].args[0].input.GroupName).toBe("admins");
  });
});

describe("group members", () => {
  beforeEach(() => {
    cognito.reset();
  });

  it("lists, adds, and removes group members", async () => {
    cognito.on(ListUsersInGroupCommand).resolves({ Users: [{ Username: "alice" }] });
    cognito.on(AdminAddUserToGroupCommand).resolves({});
    cognito.on(AdminRemoveUserFromGroupCommand).resolves({});

    const listRes = await GET_MEMBERS(
      new Request("http://test/api/cognito/user-pools/abc/groups/admins/members"),
      groupParams,
    );
    const listBody = await listRes.json();
    expect(listBody.users[0].Username).toBe("alice");

    await POST_MEMBER(
      new Request("http://test/api/cognito/user-pools/abc/groups/admins/members", {
        method: "POST",
        body: JSON.stringify({ username: "bob" }),
      }),
      groupParams,
    );
    await DELETE_MEMBER(
      new Request("http://test/api/cognito/user-pools/abc/groups/admins/members", {
        method: "DELETE",
        body: JSON.stringify({ username: "bob" }),
      }),
      groupParams,
    );

    expect(cognito.commandCalls(AdminAddUserToGroupCommand)[0].args[0].input.Username).toBe("bob");
    expect(cognito.commandCalls(AdminRemoveUserFromGroupCommand)[0].args[0].input.Username).toBe("bob");
  });
});
