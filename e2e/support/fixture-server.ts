import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

export interface FixtureServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Serves the fixture directory over http so the extension scans pages through a
 * real origin. Scanning file:// URLs needs a Chrome toggle a test cannot set.
 */
export async function startFixtureServer(root: string): Promise<FixtureServer> {
  const server = createServer(async (request, response) => {
    const requested = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = path.normalize(decodeURIComponent(requested.pathname)).replace(/^([/\\])+/, "");
    const target = path.join(root, relative);
    if (!target.startsWith(root)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind a port.");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
