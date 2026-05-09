import { describe, expect, it } from "bun:test";
import {
  cloudwatchClient,
  cloudwatchLogsClient,
  cognitoClient,
  s3Client,
  sqsClient,
} from "@/lib/aws-clients";

describe("aws-clients", () => {
  it("exports all 5 SDK clients", () => {
    expect(s3Client).toBeDefined();
    expect(sqsClient).toBeDefined();
    expect(cloudwatchClient).toBeDefined();
    expect(cloudwatchLogsClient).toBeDefined();
    expect(cognitoClient).toBeDefined();
  });

  it("forces path style on the s3 client", async () => {
    const forcePathStyle = await s3Client.config.forcePathStyle;
    expect(forcePathStyle).toBe(true);
  });

  it("resolves the AWS_REGION env value", async () => {
    const region = await s3Client.config.region();
    expect(region).toBe("us-east-1");
  });

  it("honours FLOCI_ENDPOINT for all clients", async () => {
    for (const client of [s3Client, sqsClient, cloudwatchClient, cloudwatchLogsClient, cognitoClient]) {
      const endpoint = await client.config.endpoint!();
      expect(endpoint.hostname).toBe("floci.test");
      expect(endpoint.port).toBe(4566);
    }
  });

  it("uses hardcoded test credentials", async () => {
    const creds = await s3Client.config.credentials();
    expect(creds.accessKeyId).toBe("test");
    expect(creds.secretAccessKey).toBe("test");
  });
});
