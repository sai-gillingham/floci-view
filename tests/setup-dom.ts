process.env.FLOCI_ENDPOINT ??= "http://floci.test:4566";
process.env.AWS_REGION ??= "us-east-1";
process.env.FLOCI_DATA_PATH ??= "/tmp/floci-data-test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
  var __HAPPY_DOM_REGISTERED__: boolean | undefined;
}

if (!globalThis.__HAPPY_DOM_REGISTERED__) {
  GlobalRegistrator.register({ url: "http://localhost:3000" });
  globalThis.__HAPPY_DOM_REGISTERED__ = true;
}
