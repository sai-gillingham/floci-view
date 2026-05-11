import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import {
  DELETE as DELETE_OBJECT,
  GET,
  PATCH,
  POST,
} from "@/app/api/s3/buckets/[bucket]/objects/route";

const s3 = mockClient(S3Client);
const context = { params: Promise.resolve({ bucket: "assets" }) };

describe("GET /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("requires a key", async () => {
    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects"), context);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key is required" });
  });

  it("returns object content and metadata", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "hello",
      ContentType: "text/plain",
      ContentLength: 5,
      Metadata: { owner: "dev" },
      ETag: "abc",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt"), context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.object).toMatchObject({
      Key: "notes.txt",
      Body: "hello",
      BodyEncoding: "text",
      Metadata: { owner: "dev" },
    });
  });

  it("treats missing content type as text", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=a.txt"), context);
    const body = await res.json();

    expect(body.object.BodyEncoding).toBe("text");
    expect(body.object.Body).toBe("plain");
  });

  it("base64-encodes non-text bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: new Uint8Array([1, 2, 3]),
      ContentType: "image/png",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=a.png"), context);
    const body = await res.json();

    expect(body.object.BodyEncoding).toBe("base64");
    expect(body.object.Body).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("recognizes structured text content types", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "{}",
      ContentType: "application/vnd.api+json",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=data.json"), context);
    const body = await res.json();

    expect(body.object.BodyEncoding).toBe("text");
    expect(body.object.Body).toBe("{}");
  });

  it("decodes Uint8Array bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: new TextEncoder().encode("bytes"),
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("bytes");
  });

  it("decodes ArrayBuffer bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: new TextEncoder().encode("buf").buffer,
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("buf");
  });

  it("decodes Blob bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: new Blob(["blob"]),
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("blob");
  });

  it("reads transformToByteArray bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: {
        transformToByteArray: async () => new TextEncoder().encode("tb"),
      },
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("tb");
  });

  it("reads transformToString bodies", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: {
        transformToString: async () => "ts",
      },
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("ts");
  });

  it("concatenates async iterable bodies", async () => {
    const Body = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([97]);
        yield "b";
      },
    };

    s3.on(GetObjectCommand).resolves({
      Body,
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("ab");
  });

  it("marks preview as truncated when the object is larger than the preview window", async () => {
    const total = 600 * 1024;
    async function* Body() {
      const chunk = new Uint8Array(64 * 1024).fill(97);
      for (let i = 0; i < 10; i += 1) {
        yield chunk;
      }
    }

    s3.on(GetObjectCommand).resolves({
      Body: Body(),
      ContentType: "text/plain",
      ContentRange: `bytes 0-${512 * 1024 - 1}/${total}`,
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=big.txt"), context);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.object.Truncated).toBe(true);
    expect(json.object.ContentLength).toBe(total);
    expect(json.object.Body.length).toBe(512 * 1024);
  });

  it("uses measured length when ContentLength is missing", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "12345",
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.ContentLength).toBe(5);
  });

  it("streams an attachment when download is requested", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "hello",
      ContentType: "text/plain",
      ContentLength: 5,
    });

    const res = await GET(
      new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt&download=1"),
      context,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="notes.txt"');
    expect(await res.text()).toBe("hello");
  });

  it("sanitizes download filenames", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "x",
      ContentType: "text/plain",
    });

    const key = 'path/to/file"x".txt';
    const res = await GET(
      new NextRequest(
        `http://test/api/s3/buckets/assets/objects?key=${encodeURIComponent(key)}&download=1`,
      ),
      context,
    );

    expect(res.headers.get("content-disposition")).toBe('attachment; filename="filex.txt"');
  });

  it("treats unrecognized bodies as empty byte payloads", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { notHandled: true },
      ContentType: "text/plain",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect((await res.json()).object.Body).toBe("");
  });

  it("returns 500 on SDK error", async () => {
    s3.on(GetObjectCommand).rejects(new Error("missing"));
    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=x"), context);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("missing");
  });
});

describe("POST /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("uploads JSON content with normalized metadata", async () => {
    s3.on(PutObjectCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "notes.txt",
          content: "hello",
          contentType: "text/plain",
          metadata: { Owner: " Dev ", empty: " " },
        }),
      }),
      context,
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "assets",
      Key: "notes.txt",
      Body: "hello",
      ContentType: "text/plain",
      Metadata: { owner: "Dev" },
    });
  });

  it("requires a key for JSON uploads", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key is required" });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("uploads multipart files with explicit keys and metadata", async () => {
    s3.on(PutObjectCommand).resolves({});

    const form = new FormData();
    form.append("key", "custom/path.txt");
    form.append("file", new File(["upload"], "ignored.txt", { type: "text/plain" }));
    form.append("contentType", "text/markdown");
    form.append("metadata", '{"Section": " docs "}');

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "POST",
        body: form,
      }),
      context,
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Key: "custom/path.txt",
      ContentType: "text/markdown",
      Metadata: { section: "docs" },
    });
  });

  it("falls back to the file name when no key is provided", async () => {
    s3.on(PutObjectCommand).resolves({});

    const form = new FormData();
    form.append("file", new File(["x"], "auto.txt"));

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", { method: "POST", body: form }),
      context,
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input.Key).toBe("auto.txt");
  });

  it("returns 400 when multipart metadata JSON is malformed", async () => {
    const form = new FormData();
    form.append("key", "k.txt");
    form.append("file", new File(["z"], "z.txt"));
    form.append("metadata", "{not json");

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", { method: "POST", body: form }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed metadata JSON" });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("requires a key when the file name is empty", async () => {
    const form = new FormData();
    form.append("file", new File([], ""));

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", { method: "POST", body: form }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key is required" });
  });

  it("requires a file part for multipart uploads", async () => {
    const form = new FormData();
    form.append("key", "only-key.txt");

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", { method: "POST", body: form }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "file is required" });
  });

  it("returns 500 when PutObject fails", async () => {
    s3.on(PutObjectCommand).rejects(new Error("quota"));

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "k.txt", content: "x" }),
      }),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("quota");
  });
});

describe("PATCH /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("rewrites object metadata with a self-copy", async () => {
    s3.on(HeadObjectCommand).resolves({
      ContentType: "text/plain",
      CacheControl: "max-age=60",
      ContentDisposition: "inline",
    });
    s3.on(CopyObjectCommand).resolves({});

    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({
          key: "notes.txt",
          metadata: { Env: " dev " },
          contentType: "application/json",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "assets",
      Key: "notes.txt",
      CopySource: "assets/notes.txt",
      MetadataDirective: "REPLACE",
      Metadata: { env: "dev" },
      ContentType: "application/json",
      CacheControl: "max-age=60",
      ContentDisposition: "inline",
    });
  });

  it("replaces user metadata when body.metadata is provided", async () => {
    s3.on(HeadObjectCommand).resolves({
      ContentType: "text/plain",
      Metadata: { keep: "yes", overlap: "old" },
    });
    s3.on(CopyObjectCommand).resolves({});

    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({
          key: "notes.txt",
          metadata: { Overlap: " new " },
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(CopyObjectCommand)[0].args[0].input.Metadata).toEqual({
      overlap: "new",
    });
  });

  it("falls back to existing ContentEncoding and ContentLanguage when omitted from PATCH", async () => {
    s3.on(HeadObjectCommand).resolves({
      ContentType: "application/json",
      ContentEncoding: "gzip",
      ContentLanguage: "en-US",
      Metadata: { section: "intro" },
    });
    s3.on(CopyObjectCommand).resolves({});

    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({ key: "doc.json" }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    const input = s3.commandCalls(CopyObjectCommand)[0].args[0].input;
    expect(input.Metadata).toEqual({ section: "intro" });
    expect(input.ContentEncoding).toBe("gzip");
    expect(input.ContentLanguage).toBe("en-US");
  });

  it("requires a key", async () => {
    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({ metadata: { a: "b" } }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key is required" });
  });

  it("returns 500 when the head request fails", async () => {
    s3.on(HeadObjectCommand).rejects(new Error("404"));

    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({ key: "missing.txt" }),
      }),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("404");
  });
});

describe("DELETE /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("deletes an object by key", async () => {
    s3.on(DeleteObjectCommand).resolves({});

    const res = await DELETE_OBJECT(
      new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt"),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({
      Bucket: "assets",
      Key: "notes.txt",
    });
  });

  it("reads the key from a JSON body when missing from the query string", async () => {
    s3.on(DeleteObjectCommand).resolves({});

    const res = await DELETE_OBJECT(
      new NextRequest("http://test/api/s3/buckets/assets/objects", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "nested/obj.txt" }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe("nested/obj.txt");
  });

  it("requires a key", async () => {
    const res = await DELETE_OBJECT(new NextRequest("http://test/api/s3/buckets/assets/objects"), context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key is required" });
  });

  it("returns 500 when delete fails", async () => {
    s3.on(DeleteObjectCommand).rejects(new Error("denied"));

    const res = await DELETE_OBJECT(
      new NextRequest("http://test/api/s3/buckets/assets/objects?key=a.txt"),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("denied");
  });
});
