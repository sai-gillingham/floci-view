import { NextResponse } from "next/server";
import { cognitoClient } from "@/lib/aws-clients";
import {
  CreateUserPoolCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createPoolInput, errorResponse, parseBody } from "@/app/api/cognito/helpers";

export async function GET() {
  try {
    const result = await cognitoClient.send(new ListUserPoolsCommand({ MaxResults: 60 }));
    return NextResponse.json({ userPools: result.UserPools ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = createPoolInput(await parseBody(request));
    if (!input) return NextResponse.json({ error: "Pool name is required" }, { status: 400 });

    const result = await cognitoClient.send(new CreateUserPoolCommand(input));
    return NextResponse.json({ userPool: result.UserPool ?? null }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
