import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  DeleteResourceServerCommand,
  UpdateResourceServerCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { errorResponse, optionalString, parseBody, scopesFromBody } from "../../../../helpers";

type ResourceParams = Promise<{ poolId: string; identifier: string[] }>;

function identifierFromParts(parts: string[]) {
  return parts.join("/");
}

export async function PATCH(
  request: Request,
  { params }: { params: ResourceParams }
) {
  const { poolId, identifier } = await params;
  try {
    const body = await parseBody(request);
    const Identifier = identifierFromParts(identifier);
    const result = await cognitoClient.send(
      new UpdateResourceServerCommand({
        UserPoolId: poolId,
        Identifier,
        Name: optionalString(body, "name") ?? Identifier,
        Scopes: scopesFromBody(body),
      })
    );
    return NextResponse.json({ resourceServer: result.ResourceServer ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: ResourceParams }
) {
  const { poolId, identifier } = await params;
  try {
    await cognitoClient.send(
      new DeleteResourceServerCommand({
        UserPoolId: poolId,
        Identifier: identifierFromParts(identifier),
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
