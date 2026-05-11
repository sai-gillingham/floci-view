import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  CreateUserPoolClientCommand,
  ListUserPoolClientsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createClientInput, errorResponse, parseBody } from "@/app/api/cognito/helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const result = await cognitoClient.send(
      new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 })
    );
    return NextResponse.json({ clients: result.UserPoolClients ?? [] });
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
    const input = createClientInput(poolId, await parseBody(request));
    if (!input) return NextResponse.json({ error: "Client name is required" }, { status: 400 });

    const result = await cognitoClient.send(new CreateUserPoolClientCommand(input));
    return NextResponse.json({ client: result.UserPoolClient ?? null }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
