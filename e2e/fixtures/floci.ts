import { S3Client } from "@aws-sdk/client-s3";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SQSClient } from "@aws-sdk/client-sqs";

const FLOCI_ENDPOINT = process.env.FLOCI_ENDPOINT ?? "http://localhost:4566";
const REGION = process.env.AWS_REGION ?? "us-east-1";

const config = {
  endpoint: FLOCI_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

export const flociS3 = new S3Client({ ...config, forcePathStyle: true });
export const flociSqs = new SQSClient(config);
export const flociCloudwatchLogs = new CloudWatchLogsClient(config);
export const flociCognito = new CognitoIdentityProviderClient(config);
