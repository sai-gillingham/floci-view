import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  attributesFromBody,
  errorResponse,
  optionalBoolean,
  optionalString,
  parseBody,
} from "@/app/api/cognito/helpers";

type UserParams = Promise<{ poolId: string; username: string[] }>;

function usernameFromParts(parts: string[]) {
  return parts.join("/");
}

export async function GET(
  _request: Request,
  { params }: { params: UserParams }
) {
  const { poolId, username } = await params;
  try {
    const result = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: poolId, Username: usernameFromParts(username) })
    );
    return NextResponse.json({ user: result });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: UserParams }
) {
  const { poolId, username } = await params;
  const Username = usernameFromParts(username);
  try {
    const body = await parseBody(request);
    const attributes = attributesFromBody(body);

    if (attributes.length) {
      await cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: poolId,
          Username,
          UserAttributes: attributes,
        })
      );
    }

    const enabled = optionalBoolean(body, "enabled");
    if (enabled === true) {
      await cognitoClient.send(new AdminEnableUserCommand({ UserPoolId: poolId, Username }));
    } else if (enabled === false) {
      await cognitoClient.send(new AdminDisableUserCommand({ UserPoolId: poolId, Username }));
    }

    const password = optionalString(body, "password");
    if (password) {
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username,
          Password: password,
          Permanent: body.permanent !== false,
        })
      );
    }

    const updated = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: poolId, Username })
    );
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: UserParams }
) {
  const { poolId, username } = await params;
  try {
    const body = await parseBody(request);
    if (body.action !== "reset-password") {
      return NextResponse.json({ error: "Unsupported user action" }, { status: 400 });
    }

    await cognitoClient.send(
      new AdminResetUserPasswordCommand({
        UserPoolId: poolId,
        Username: usernameFromParts(username),
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: UserParams }
) {
  const { poolId, username } = await params;
  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: poolId,
        Username: usernameFromParts(username),
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
