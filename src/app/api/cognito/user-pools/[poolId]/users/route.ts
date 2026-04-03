import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import { ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
