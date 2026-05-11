import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DELETE as DELETE_NOTIFICATIONS,
  GET,
  PUT,
} from "@/app/api/s3/buckets/[bucket]/notifications/route";

const s3 = mockClient(S3Client);
const context = { params: Promise.resolve({ bucket: "assets" }) };

describe("GET /api/s3/buckets/[bucket]/notifications", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("flattens bucket notification configurations", async () => {
    s3.on(GetBucketNotificationConfigurationCommand).resolves({
      QueueConfigurations: [
        {
          Id: "images",
          QueueArn: "arn:aws:sqs:us-east-1:000000000000:images",
          Events: ["s3:ObjectCreated:*"],
          Filter: {
            Key: {
              FilterRules: [
                { Name: "prefix", Value: "images/" },
                { Name: "suffix", Value: ".jpg" },
              ],
            },
          },
        },
      ],
      EventBridgeConfiguration: {},
    });

    const res = await GET(new Request("http://test/api/s3/buckets/assets/notifications"), context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.eventBridgeEnabled).toBe(true);
    expect(body.triggers).toEqual([
      {
        id: "images",
        destinationType: "Queue",
        destinationArn: "arn:aws:sqs:us-east-1:000000000000:images",
        eventTypes: ["s3:ObjectCreated:*"],
        prefixFilter: "images/",
        suffixFilter: ".jpg",
      },
    ]);
  });
});

describe("PUT /api/s3/buckets/[bucket]/notifications", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("saves trigger event configuration", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).resolves({});

    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({
          eventBridgeEnabled: true,
          triggers: [
            {
              id: "images",
              destinationType: "Queue",
              destinationArn: "arn:aws:sqs:us-east-1:000000000000:images",
              eventTypes: ["s3:ObjectCreated:*", "s3:ObjectRemoved:Delete", "unsupported"],
              prefixFilter: "images/",
              suffixFilter: ".jpg",
            },
          ],
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(PutBucketNotificationConfigurationCommand)[0].args[0].input).toEqual({
      Bucket: "assets",
      NotificationConfiguration: {
        QueueConfigurations: [
          {
            Id: "images",
            QueueArn: "arn:aws:sqs:us-east-1:000000000000:images",
            Events: ["s3:ObjectCreated:*", "s3:ObjectRemoved:Delete"],
            Filter: {
              Key: {
                FilterRules: [
                  { Name: "prefix", Value: "images/" },
                  { Name: "suffix", Value: ".jpg" },
                ],
              },
            },
          },
        ],
        TopicConfigurations: [],
        LambdaFunctionConfigurations: [],
        EventBridgeConfiguration: {},
      },
    });
  });
});

describe("DELETE /api/s3/buckets/[bucket]/notifications", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("clears trigger event configuration", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).resolves({});

    const res = await DELETE_NOTIFICATIONS(
      new Request("http://test/api/s3/buckets/assets/notifications"),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(PutBucketNotificationConfigurationCommand)[0].args[0].input).toEqual({
      Bucket: "assets",
      NotificationConfiguration: {},
    });
  });
});
