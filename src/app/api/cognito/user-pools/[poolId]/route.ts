import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { errorResponse, parseBody, poolUpdateInputFromDetail } from "@/app/api/cognito/helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const result = await cognitoClient.send(
      new DescribeUserPoolCommand({ UserPoolId: poolId })
    );
    return NextResponse.json({ userPool: result.UserPool ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const current = await cognitoClient.send(
      new DescribeUserPoolCommand({ UserPoolId: poolId })
    );
    if (!current.UserPool) {
      return NextResponse.json({ error: "User pool not found" }, { status: 404 });
    }

    const input = poolUpdateInputFromDetail(current.UserPool, await parseBody(request));
    await cognitoClient.send(new UpdateUserPoolCommand(input));

    const updated = await cognitoClient.send(
      new DescribeUserPoolCommand({ UserPoolId: poolId })
    );
    return NextResponse.json({ userPool: updated.UserPool ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    await cognitoClient.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
