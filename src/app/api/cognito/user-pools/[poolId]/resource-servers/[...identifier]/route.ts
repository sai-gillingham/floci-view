import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  DeleteResourceServerCommand,
  DescribeResourceServerCommand,
  UpdateResourceServerCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { errorResponse, optionalString, parseBody, scopesFromBody } from "@/app/api/cognito/helpers";

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
    const nameFromBody = optionalString(body, "name");
    let Name: string;
    if (nameFromBody !== undefined) {
      Name = nameFromBody;
    } else {
      const existing = await cognitoClient.send(
        new DescribeResourceServerCommand({ UserPoolId: poolId, Identifier }),
      );
      const existingName = existing.ResourceServer?.Name;
      if (!existingName) {
        return errorResponse(
          new Error("Resource server not found or has no display name; provide name in the request body"),
          404,
        );
      }
      Name = existingName;
    }

    const result = await cognitoClient.send(
      new UpdateResourceServerCommand({
        UserPoolId: poolId,
        Identifier,
        Name,
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
