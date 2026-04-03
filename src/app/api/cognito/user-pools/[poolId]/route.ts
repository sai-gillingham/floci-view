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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
