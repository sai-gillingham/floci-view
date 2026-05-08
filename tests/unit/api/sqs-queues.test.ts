import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { ListQueuesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GET } from "@/app/api/sqs/queues/route";

const sqs = mockClient(SQSClient);

describe("GET /api/sqs/queues", () => {
  beforeEach(() => {
    sqs.reset();
  });

  it("returns the queue URLs", async () => {
    sqs.on(ListQueuesCommand).resolves({
      QueueUrls: ["http://localhost:4566/queue/a", "http://localhost:4566/queue/b"],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.queues).toHaveLength(2);
  });

  it("returns an empty array when the response has no QueueUrls", async () => {
    sqs.on(ListQueuesCommand).resolves({});
    const res = await GET();
    const body = await res.json();
    expect(body.queues).toEqual([]);
  });

  it("returns 500 on SDK error", async () => {
    sqs.on(ListQueuesCommand).rejects(new Error("queue down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("queue down");
  });
});
