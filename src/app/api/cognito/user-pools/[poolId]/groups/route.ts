import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  CreateGroupCommand,
  ListGroupsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  errorResponse,
  optionalNumber,
  optionalString,
  parseBody,
  requiredString,
} from "../../../helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const result = await cognitoClient.send(
      new ListGroupsCommand({ UserPoolId: poolId, Limit: 60 })
    );
    return NextResponse.json({ groups: result.Groups ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const body = await parseBody(request);
    const GroupName = requiredString(body, "groupName");
    if (!GroupName) return NextResponse.json({ error: "Group name is required" }, { status: 400 });

    const result = await cognitoClient.send(
      new CreateGroupCommand({
        UserPoolId: poolId,
        GroupName,
        Description: optionalString(body, "description"),
        RoleArn: optionalString(body, "roleArn"),
        Precedence: optionalNumber(body, "precedence"),
      })
    );
    return NextResponse.json({ group: result.Group ?? null }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
