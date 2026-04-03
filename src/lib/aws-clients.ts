import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

const FLOCI_ENDPOINT = process.env.FLOCI_ENDPOINT ?? "http://localhost:4566";

const commonConfig = {
  endpoint: FLOCI_ENDPOINT,
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
};

export const s3Client = new S3Client({ ...commonConfig, forcePathStyle: true });
export const sqsClient = new SQSClient(commonConfig);
export const cloudwatchLogsClient = new CloudWatchLogsClient(commonConfig);
export const cloudwatchClient = new CloudWatchClient(commonConfig);
export const cognitoClient = new CognitoIdentityProviderClient(commonConfig);
