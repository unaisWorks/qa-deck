const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Readable, Writable } = require("node:stream");

const { handleProxyAsset } = require("../server.js");

// Spins up a throwaway HTTP server standing in for the "real" target site,
// so we can assert on exactly what handleProxyAsset forwards to it.
function withTargetServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

// Minimal fake IncomingMessage: a readable stream (for req.pipe) with a
// method/headers pair, matching what handleProxyAsset reads from `req`.
function fakeRequest({ method = "GET", headers = {}, body = null } = {}) {
  const stream = body != null ? Readable.from([Buffer.from(body)]) : Readable.from([]);
  stream.method = method;
  stream.headers = headers;
  return stream;
}

// Fake ServerResponse that captures status/headers/body instead of writing
// to a real socket. Must be a genuine Writable — server.js pipes the
// upstream response into it (`proxyRes.pipe(res)`), and stream.pipe()
// requires real EventEmitter behavior (.on/.emit) on its destination. A
// plain object with just writeHead/write/end methods throws inside pipe()
// asynchronously, which bypasses this test's Promise entirely and hangs
// the process forever (a real ServerResponse never has this problem).
function fakeResponse() {
  const res = new Writable({
    write(chunk, _enc, callback) {
      res.chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.statusCode = null;
  res.headers = null;
  res.chunks = [];
  res.headersSent = false;
  res.writeHead = (status, headers) => {
    res.statusCode = status;
    res.headers = headers || {};
    res.headersSent = true;
    return res;
  };
  return res;
}

function proxyAssetUrlObj(targetUrl) {
  return new URL(`http://x/api/proxy-asset?url=${encodeURIComponent(targetUrl)}`);
}

test("forwards the real HTTP method and body to the target (POST)", async () => {
  let received = null;
  const { server, url } = await withTargetServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received = { method: req.method, body, contentType: req.headers["content-type"] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  try {
    const req = fakeRequest({
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "13" },
      body: '{"q":"villa"}',
    });
    const res = fakeResponse();
    await handleProxyAsset(req, res, proxyAssetUrlObj(`${url}/search`));

    assert.equal(received.method, "POST");
    assert.equal(received.body, '{"q":"villa"}');
    assert.equal(received.contentType, "application/json");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(Buffer.concat(res.chunks).toString()), { ok: true });
  } finally {
    server.close();
  }
});

test("forwards auth/cookie headers so authenticated API calls succeed", async () => {
  let receivedHeaders = null;
  const { server, url } = await withTargetServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });

  try {
    const req = fakeRequest({
      method: "GET",
      headers: { authorization: "Bearer secret-token", cookie: "session=abc123" },
    });
    const res = fakeResponse();
    await handleProxyAsset(req, res, proxyAssetUrlObj(`${url}/me`));

    assert.equal(receivedHeaders["authorization"], "Bearer secret-token");
    assert.equal(receivedHeaders["cookie"], "session=abc123");
  } finally {
    server.close();
  }
});

test("relays the target's real status code instead of always 200", async () => {
  const { server, url } = await withTargetServer((req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  try {
    const req = fakeRequest({ method: "GET" });
    const res = fakeResponse();
    await handleProxyAsset(req, res, proxyAssetUrlObj(`${url}/missing`));
    assert.equal(res.statusCode, 404);
  } finally {
    server.close();
  }
});

test("does not cache non-GET responses", async () => {
  const { server, url } = await withTargetServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });

  try {
    const req = fakeRequest({ method: "POST", headers: { "content-length": "2" }, body: "{}" });
    const res = fakeResponse();
    await handleProxyAsset(req, res, proxyAssetUrlObj(`${url}/submit`));
    assert.ok(!res.headers["Cache-Control"], "POST responses must not be cached");
  } finally {
    server.close();
  }
});

test("still caches plain GET asset fetches (unchanged behavior)", async () => {
  const { server, url } = await withTargetServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end("body{}");
  });

  try {
    const req = fakeRequest({ method: "GET" });
    const res = fakeResponse();
    await handleProxyAsset(req, res, proxyAssetUrlObj(`${url}/style.css`));
    assert.equal(res.headers["Cache-Control"], "public, max-age=3600");
  } finally {
    server.close();
  }
});
