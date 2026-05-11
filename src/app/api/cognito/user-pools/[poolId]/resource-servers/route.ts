import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  CreateResourceServerCommand,
  ListResourceServersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  errorResponse,
  optionalString,
  parseBody,
  requiredString,
  scopesFromBody,
} from "@/app/api/cognito/helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const result = await cognitoClient.send(
      new ListResourceServersCommand({ UserPoolId: poolId, MaxResults: 60 })
    );
    return NextResponse.json({ resourceServers: result.ResourceServers ?? [] });
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
    const Identifier = requiredString(body, "identifier");
    const Name = optionalString(body, "name") ?? Identifier;
    if (!Identifier) return NextResponse.json({ error: "Identifier is required" }, { status: 400 });

    const result = await cognitoClient.send(
      new CreateResourceServerCommand({
        UserPoolId: poolId,
        Identifier,
        Name,
        Scopes: scopesFromBody(body),
      })
    );
    return NextResponse.json({ resourceServer: result.ResourceServer ?? null }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
