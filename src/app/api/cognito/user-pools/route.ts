import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import { ListUserPoolsCommand } from "@aws-sdk/client-cognito-identity-provider";

export async function GET() {
  try {
    const result = await cognitoClient.send(new ListUserPoolsCommand({ MaxResults: 60 }));
    return NextResponse.json({ userPools: result.UserPools ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
