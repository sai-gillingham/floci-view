import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { GET } from "@/app/api/s3/buckets/route";

const s3 = mockClient(S3Client);

describe("GET /api/s3/buckets", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("returns the bucket list on success", async () => {
    s3.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: "alpha", CreationDate: new Date("2024-01-01") }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buckets).toHaveLength(1);
    expect(body.buckets[0].Name).toBe("alpha");
  });

  it("returns an empty array when no Buckets field is present", async () => {
    s3.on(ListBucketsCommand).resolves({});
    const res = await GET();
    const body = await res.json();
    expect(body.buckets).toEqual([]);
  });

  it("returns 500 on SDK error", async () => {
    s3.on(ListBucketsCommand).rejects(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});
