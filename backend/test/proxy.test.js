const test = require("node:test");
const assert = require("node:assert/strict");

const { buildProxiedHtml } = require("../server.js");

const PORT_PREFIX = "http://localhost:3747/api/proxy-asset";
const ORIGIN = "https://dubaiownersclub.com";
const BASE_TAG = `<base href="${PORT_PREFIX}/https/dubaiownersclub.com/"/>`;
const CAPTURE_SCRIPT = "<script>/* capture */</script>";

test("injected base tag is never re-proxied into a self-referencing URL", () => {
  // Reproduces an Angular CLI-style build: bare-relative script src plus the
  // page's own <base href="/"> tag, both depending on correct base resolution.
  const html = `<!doctype html><html><head><base href="/"><title>x</title></head>
<body><app-root></app-root>
<script src="main-QYINQS6F.js" type="module"></script>
</body></html>`;

  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  const baseTags = [...patched.matchAll(/<base[^>]*>/gi)].map((m) => m[0]);

  assert.equal(baseTags.length, 2, "original + injected base tags should both survive");
  for (const tag of baseTags) {
    assert.ok(!tag.includes("proxy-asset/http/localhost"), `base tag was double-proxied: ${tag}`);
  }
  // Our injected tag must be first — per the HTML spec only the first <base> wins.
  assert.ok(patched.indexOf(baseTags[0]) < patched.indexOf("app-root"));
});

test("absolute asset URLs are still routed through the asset proxy", () => {
  const html = `<html><head></head><body><img src="https://cdn.example.com/logo.png"></body></html>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.match(patched, /src="http:\/\/localhost:3747\/api\/proxy-asset\/https\/cdn\.example\.com\/logo\.png"/);
});

test("root-relative asset URLs are rewritten with the target origin prepended", () => {
  const html = `<html><head></head><body><link href="/assets/style.css"></body></html>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.match(patched, /href="http:\/\/localhost:3747\/api\/proxy-asset\/https\/dubaiownersclub\.com\/assets\/style\.css"/);
});

test("bare-relative asset URLs are left untouched (resolved by <base> in the browser)", () => {
  const html = `<html><head></head><body><script src="main-ABC123.js"></script></body></html>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.match(patched, /src="main-ABC123\.js"/);
});

test("CSP/refresh/x-frame-options meta tags are stripped", () => {
  const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><meta http-equiv="refresh" content="5"></head><body></body></html>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.ok(!/http-equiv/i.test(patched));
});

test("capture script and base tag are injected right after <head>", () => {
  const html = `<html><head><title>x</title></head><body></body></html>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.ok(patched.includes(`<head>${BASE_TAG}${CAPTURE_SCRIPT}`));
});

test("falls back to prepending injected tags when there is no <head>", () => {
  const html = `<div>fragment</div>`;
  const patched = buildProxiedHtml(html, ORIGIN, BASE_TAG, CAPTURE_SCRIPT);
  assert.ok(patched.startsWith(BASE_TAG + CAPTURE_SCRIPT));
});
