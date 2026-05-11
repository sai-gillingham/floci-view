import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  AdminCreateUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { attributesFromBody, errorResponse, parseBody, requiredString, optionalString } from "@/app/api/cognito/helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  try {
    const result = await cognitoClient.send(
      new ListUsersCommand({ UserPoolId: poolId })
    );
    return NextResponse.json({ users: result.Users ?? [] });
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
    const Username = requiredString(body, "username");
    if (!Username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

    const UserAttributes = attributesFromBody(body);
    const TemporaryPassword = optionalString(body, "temporaryPassword");
    const result = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username,
        TemporaryPassword,
        UserAttributes: UserAttributes.length ? UserAttributes : undefined,
        MessageAction: body.suppressInvite === true ? "SUPPRESS" : undefined,
      })
    );

    return NextResponse.json({ user: result.User ?? null }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
