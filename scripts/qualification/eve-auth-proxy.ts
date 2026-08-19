import { createServer } from "node:http";
import { Readable } from "node:stream";

const upstreamBaseUrl = "http://127.0.0.1:3001";
const qualificationEnv = Reflect.get(process, "env") as Record<
  string,
  string | undefined
>;
const eveBaseUrl =
  qualificationEnv.WORKOUTPAL_EVE_PROXY_EVE_URL ?? "http://127.0.0.1:4274";
const port = Number(qualificationEnv.WORKOUTPAL_EVE_PROXY_PORT ?? "3080");
const defaultCookie = qualificationEnv.WORKOUTPAL_EVE_PROXY_COOKIE;
const defaultWorkspaceId = qualificationEnv.WORKOUTPAL_EVE_PROXY_WORKSPACE_ID;

if (defaultCookie === undefined || defaultWorkspaceId === undefined) {
  throw new Error(
    "WORKOUTPAL_EVE_PROXY_COOKIE and WORKOUTPAL_EVE_PROXY_WORKSPACE_ID are required.",
  );
}

async function requestBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  try {
    const incomingHeaders = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (name === "host" || name === "content-length" || value === undefined)
        continue;
      incomingHeaders.set(
        name,
        Array.isArray(value) ? value.join(", ") : value,
      );
    }
    incomingHeaders.set("cookie", request.headers.cookie ?? defaultCookie);
    incomingHeaders.set(
      "x-workoutpal-workspace-id",
      request.headers["x-workoutpal-workspace-id"]?.toString() ??
        defaultWorkspaceId,
    );
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await requestBody(request);
    const requestPath = request.url ?? "/";
    const targetBaseUrl = requestPath.startsWith("/eve/v1")
      ? eveBaseUrl
      : upstreamBaseUrl;
    const upstream = await fetch(`${targetBaseUrl}${requestPath}`, {
      method: request.method,
      headers: incomingHeaders,
      ...(body === undefined ? {} : { body, duplex: "half" as const }),
    });
    response.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      if (
        name === "transfer-encoding" ||
        name === "content-length" ||
        name === "content-encoding"
      )
        return;
      response.setHeader(name, value);
    });
    if (upstream.body === null) {
      response.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(response);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(error instanceof Error ? error.message : "Proxy failure.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Qualification Eve auth proxy listening on ${port}.`);
});
