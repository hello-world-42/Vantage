import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, fetchText, HttpRequestError } from "../src/lib/http.js";

/** A fake fetch that answers after `delayMs`, or rejects when its signal aborts. */
function fakeFetch(respond: () => Response, delayMs = 0): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(respond()), delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal?.reason);
      });
    })) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function rejectsWith(promise: Promise<unknown>, code: string, status?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof HttpRequestError, "throws HttpRequestError");
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

test("fetchJson returns the parsed body", async () => {
  const data = await fetchJson<{ temp: number }>("https://example.test", { fetch: fakeFetch(() => json({ temp: 21 })) });
  assert.deepEqual(data, { temp: 21 });
});

test("fetchText returns the raw body", async () => {
  const text = await fetchText("https://example.test", { fetch: fakeFetch(() => new Response("a,b\n1,2")) });
  assert.equal(text, "a,b\n1,2");
});

test("a slow upstream times out with code 'timeout'", async () => {
  const started = Date.now();
  await rejectsWith(
    fetchJson("https://example.test", { timeoutMs: 50, fetch: fakeFetch(() => json({}), 5_000) }),
    "timeout",
  );
  assert.ok(Date.now() - started < 1_000, "gives up near the timeout, not after the upstream answers");
});

test("the caller's signal cancels the request with code 'aborted'", async () => {
  const controller = new AbortController();
  const pending = fetchJson("https://example.test", { signal: controller.signal, fetch: fakeFetch(() => json({}), 5_000) });
  controller.abort();
  await rejectsWith(pending, "aborted");
});

test("an HTTP error status becomes code 'http' with the status", async () => {
  await rejectsWith(fetchJson("https://example.test", { fetch: fakeFetch(() => json({ error: "nope" }, 503)) }), "http", 503);
});

test("a network failure becomes code 'network'", async () => {
  const broken = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  await rejectsWith(fetchJson("https://example.test", { fetch: broken }), "network");
});

test("an unreadable body becomes code 'invalid_response'", async () => {
  await rejectsWith(fetchJson("https://example.test", { fetch: fakeFetch(() => new Response("<html>")) }), "invalid_response");
});

test("error messages never include the URL, which may hold an API key", async () => {
  const url = "https://api.mapbox.com/search?q=atlanta&access_token=pk.SECRET123";
  await assert.rejects(
    fetchJson(url, { service: "Mapbox", fetch: fakeFetch(() => json({}, 401)) }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Mapbox responded with HTTP 401.");
      assert.doesNotMatch(error.message, /SECRET|access_token|mapbox\.com/);
      return true;
    },
  );
});
