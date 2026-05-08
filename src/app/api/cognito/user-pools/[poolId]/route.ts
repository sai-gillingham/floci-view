import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import { DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
