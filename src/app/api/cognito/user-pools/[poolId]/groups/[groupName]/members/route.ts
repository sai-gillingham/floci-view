import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { errorResponse, parseBody, requiredString } from "../../../../../helpers";

type GroupParams = Promise<{ poolId: string; groupName: string }>;

export async function GET(
  _request: Request,
  { params }: { params: GroupParams }
) {
  const { poolId, groupName } = await params;
  try {
    const result = await cognitoClient.send(
      new ListUsersInGroupCommand({
        UserPoolId: poolId,
        GroupName: groupName,
        Limit: 60,
      })
    );
    return NextResponse.json({ users: result.Users ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: GroupParams }
) {
  const { poolId, groupName } = await params;
  try {
    const body = await parseBody(request);
    const Username = requiredString(body, "username");
    if (!Username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: poolId,
        GroupName: groupName,
        Username,
      })
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: GroupParams }
) {
  const { poolId, groupName } = await params;
  try {
    const body = await parseBody(request);
    const Username = requiredString(body, "username");
    if (!Username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: poolId,
        GroupName: groupName,
        Username,
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
