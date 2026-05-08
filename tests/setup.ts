import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, expect } from "bun:test";
import { cleanup } from "@testing-library/react";

type Matchers = Parameters<typeof expect.extend>[0];
expect.extend(matchers as unknown as Matchers);

beforeEach(() => {
  process.env.FLOCI_ENDPOINT = "http://floci.test:4566";
  process.env.AWS_REGION = "us-east-1";
  process.env.FLOCI_DATA_PATH = "/tmp/floci-data-test";
});

afterEach(() => {
  cleanup();
});
