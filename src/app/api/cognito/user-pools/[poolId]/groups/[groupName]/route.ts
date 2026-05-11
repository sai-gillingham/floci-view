import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  DeleteGroupCommand,
  UpdateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  errorResponse,
  optionalNumber,
  optionalString,
  parseBody,
} from "../../../../helpers";

type GroupParams = Promise<{ poolId: string; groupName: string }>;

export async function PATCH(
  request: Request,
  { params }: { params: GroupParams }
) {
  const { poolId, groupName } = await params;
  try {
    const body = await parseBody(request);
    const result = await cognitoClient.send(
      new UpdateGroupCommand({
        UserPoolId: poolId,
        GroupName: groupName,
        Description: optionalString(body, "description"),
        RoleArn: optionalString(body, "roleArn"),
        Precedence: optionalNumber(body, "precedence"),
      })
    );
    return NextResponse.json({ group: result.Group ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: GroupParams }
) {
  const { poolId, groupName } = await params;
  try {
    await cognitoClient.send(
      new DeleteGroupCommand({ UserPoolId: poolId, GroupName: groupName })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
