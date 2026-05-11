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

  it("maps topic and lambda triggers without filters", async () => {
    s3.on(GetBucketNotificationConfigurationCommand).resolves({
      TopicConfigurations: [
        {
          Id: "t1",
          TopicArn: "arn:aws:sns:us-east-1:000000000000:alerts",
          Events: ["s3:ObjectCreated:Put"],
        },
      ],
      LambdaFunctionConfigurations: [
        {
          Id: "l1",
          LambdaFunctionArn: "arn:aws:lambda:us-east-1:000000000000:f",
          Events: ["s3:ObjectRemoved:Delete"],
        },
      ],
    });

    const res = await GET(new Request("http://test/api/s3/buckets/assets/notifications"), context);
    const body = await res.json();

    expect(body.triggers).toEqual([
      {
        id: "t1",
        destinationType: "Topic",
        destinationArn: "arn:aws:sns:us-east-1:000000000000:alerts",
        eventTypes: ["s3:ObjectCreated:Put"],
        prefixFilter: "",
        suffixFilter: "",
      },
      {
        id: "l1",
        destinationType: "Lambda",
        destinationArn: "arn:aws:lambda:us-east-1:000000000000:f",
        eventTypes: ["s3:ObjectRemoved:Delete"],
        prefixFilter: "",
        suffixFilter: "",
      },
    ]);
    expect(body.eventBridgeEnabled).toBe(false);
  });

  it("returns 500 when the configuration cannot be loaded", async () => {
    s3.on(GetBucketNotificationConfigurationCommand).rejects(new Error("throttled"));

    const res = await GET(new Request("http://test/api/s3/buckets/assets/notifications"), context);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("throttled");
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
    expect(await res.json()).toEqual({
      ok: true,
      eventBridgeEnabled: true,
      triggers: [
        {
          id: "images",
          destinationType: "Queue",
          destinationArn: "arn:aws:sqs:us-east-1:000000000000:images",
          eventTypes: ["s3:ObjectCreated:*", "s3:ObjectRemoved:Delete"],
          prefixFilter: "images/",
          suffixFilter: ".jpg",
        },
      ],
    });
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

  it("writes topic and lambda triggers with optional prefix filters", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).resolves({});

    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({
          eventBridgeEnabled: false,
          triggers: [
            {
              id: "t1",
              destinationType: "Topic",
              destinationArn: "arn:aws:sns:us-east-1:000000000000:topic",
              eventTypes: ["s3:ObjectTagging:*"],
              suffixFilter: ".txt",
            },
            {
              id: "l1",
              destinationType: "Lambda",
              destinationArn: "arn:aws:lambda:us-east-1:000000000000:fn",
              eventTypes: ["s3:ObjectRestore:*"],
              prefixFilter: "archives/",
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
        QueueConfigurations: [],
        TopicConfigurations: [
          {
            Id: "t1",
            TopicArn: "arn:aws:sns:us-east-1:000000000000:topic",
            Events: ["s3:ObjectTagging:*"],
            Filter: {
              Key: {
                FilterRules: [{ Name: "suffix", Value: ".txt" }],
              },
            },
          },
        ],
        LambdaFunctionConfigurations: [
          {
            Id: "l1",
            LambdaFunctionArn: "arn:aws:lambda:us-east-1:000000000000:fn",
            Events: ["s3:ObjectRestore:*"],
            Filter: {
              Key: {
                FilterRules: [{ Name: "prefix", Value: "archives/" }],
              },
            },
          },
        ],
      },
    });
  });

  it("returns 400 when triggers is not an array", async () => {
    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({ triggers: "nope" }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "triggers must be an array" });
    expect(s3.commandCalls(PutBucketNotificationConfigurationCommand)).toHaveLength(0);
  });

  it("returns 400 when a trigger fails validation", async () => {
    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({
          triggers: [
            {
              destinationType: "Queue",
              destinationArn: "arn:aws:sqs:us-east-1:000000000000:ok",
              eventTypes: ["s3:ObjectCreated:Copy"],
            },
            null,
            {
              destinationType: "Queue",
              destinationArn: "arn:aws:sqs:us-east-1:000000000000:also-ok",
              eventTypes: ["s3:ObjectCreated:Put"],
            },
          ],
        }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid trigger at index 1" });
    expect(s3.commandCalls(PutBucketNotificationConfigurationCommand)).toHaveLength(0);
  });

  it("treats a missing triggers array as empty", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).resolves({});

    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(PutBucketNotificationConfigurationCommand)[0].args[0].input).toEqual({
      Bucket: "assets",
      NotificationConfiguration: {
        QueueConfigurations: [],
        TopicConfigurations: [],
        LambdaFunctionConfigurations: [],
      },
    });
  });

  it("returns 500 when saving fails", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).rejects(new Error("conflict"));

    const res = await PUT(
      new Request("http://test/api/s3/buckets/assets/notifications", {
        method: "PUT",
        body: JSON.stringify({ triggers: [] }),
      }),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("conflict");
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

  it("returns 500 when clearing fails", async () => {
    s3.on(PutBucketNotificationConfigurationCommand).rejects(new Error("locked"));

    const res = await DELETE_NOTIFICATIONS(
      new Request("http://test/api/s3/buckets/assets/notifications"),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("locked");
  });
});
