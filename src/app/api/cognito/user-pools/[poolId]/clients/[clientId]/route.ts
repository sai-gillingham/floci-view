import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  DeleteUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { clientUpdateInputFromDetail, errorResponse, parseBody } from "../../../../helpers";

type ClientParams = Promise<{ poolId: string; clientId: string }>;

export async function GET(
  _request: Request,
  { params }: { params: ClientParams }
) {
  const { poolId, clientId } = await params;
  try {
    const result = await cognitoClient.send(
      new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })
    );
    return NextResponse.json({ client: result.UserPoolClient ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: ClientParams }
) {
  const { poolId, clientId } = await params;
  try {
    const current = await cognitoClient.send(
      new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })
    );
    if (!current.UserPoolClient) {
      return NextResponse.json({ error: "User pool client not found" }, { status: 404 });
    }

    const input = clientUpdateInputFromDetail(current.UserPoolClient, await parseBody(request));
    const result = await cognitoClient.send(new UpdateUserPoolClientCommand(input));
    return NextResponse.json({ client: result.UserPoolClient ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: ClientParams }
) {
  const { poolId, clientId } = await params;
  try {
    await cognitoClient.send(
      new DeleteUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
