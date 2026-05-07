declare module "better-auth/node" {
  import type { IncomingHttpHeaders } from "node:http";

  export function toNodeHandler(auth: unknown): unknown;
  export function fromNodeHeaders(headers: IncomingHttpHeaders): Headers;
}
