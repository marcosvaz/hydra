import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseGameShareUri,
  findSharedRepack,
  getSharedSourceUrl,
  getSharedRepackStatus,
} from "./game-share.js";
import { buildGameShareUri } from "../renderer/src/helpers/build-game-share-uri.js";

test("game and release links round trip with encoded identifiers", () => {
  for (const shop of ["steam", "launchbox"] as const) {
    const uri = buildGameShareUri({
      shop,
      objectId: "123 /?#",
      sourceId: "source&1",
      repackId: "release+2",
    });
    const route = parseGameShareUri(uri);
    assert.equal(
      route,
      `game/${shop}/123%20%2F%3F%23?sourceId=source%261&repackId=release%2B2`
    );
    assert.equal(
      parseGameShareUri(buildGameShareUri({ shop, objectId: "123" })),
      `game/${shop}/123`
    );
  }
});

test("invalid protocols, shops, versions and missing IDs are rejected", () => {
  for (const uri of [
    "invalid",
    "https://game?shop=steam&objectId=1",
    "hydralauncher://run?shop=steam&objectId=1",
    "hydralauncher://game?shop=custom&objectId=1",
    "hydralauncher://game?v=2&shop=steam&objectId=1",
    "hydralauncher://game?v=&shop=steam&objectId=1",
    "hydralauncher://game?shop=steam",
    "hydralauncher://game?shop=steam&objectId=%20",
    "hydralauncher://game?shop=steam&objectId=..",
  ]) {
    assert.equal(parseGameShareUri(uri), null, uri);
  }
});

test("legacy unversioned links work and unrelated parameters are dropped", () => {
  assert.equal(
    parseGameShareUri(
      "hydralauncher://game?shop=steam&objectId=123&download=true&uri=magnet"
    ),
    "game/steam/123"
  );
});

test("release resolution never substitutes a different source or release", () => {
  const repacks = [
    { id: "release", downloadSourceId: "A" },
    { id: "release", downloadSourceId: "B" },
  ];
  assert.equal(findSharedRepack(repacks, "B", "release"), repacks[1]);
  assert.equal(findSharedRepack(repacks, null, "release"), repacks[0]);
  assert.equal(findSharedRepack(repacks, "C", "release"), null);
  assert.equal(findSharedRepack(repacks, "A", "missing"), null);
  assert.equal(findSharedRepack(repacks, "A", null), null);
  assert.equal(findSharedRepack([], "A", "release"), null);
});

test("source URL survives sharing and routing without losing query parameters", () => {
  const sourceUrl = "https://example.com/source.json?lang=en&edition=full";
  const uri = buildGameShareUri({
    shop: "steam",
    objectId: "123",
    sourceId: "A",
    repackId: "release",
    sourceUrl,
  });
  const route = parseGameShareUri(uri);
  assert.ok(route);
  const params = new URL(route, "https://example.com/").searchParams;
  assert.equal(params.get("sourceUrl"), sourceUrl);
  assert.equal(params.get("sourceId"), "A");
  assert.equal(params.get("repackId"), "release");
});

test("unsafe source URLs are never offered for adding", () => {
  for (const sourceUrl of [
    "javascript:alert(1)",
    "file:///source.json",
    "hydralauncher://run",
    "https://user:password@example.com/source.json",
    "not a URL",
  ]) {
    assert.equal(getSharedSourceUrl(sourceUrl), null);
    const uri = buildGameShareUri({
      shop: "steam",
      objectId: "123",
      sourceUrl,
    });
    assert.equal(new URL(uri).searchParams.has("sourceUrl"), false);
    const route = parseGameShareUri(
      `hydralauncher://game?shop=steam&objectId=123&sourceUrl=${encodeURIComponent(sourceUrl)}`
    );
    assert.equal(route, "game/steam/123");
  }
});

test("missing source becomes a highlighted release after adding and refreshing", () => {
  const target = {
    sourceId: "A",
    repackId: "release",
    sourceUrl: "https://example.com/source.json",
  };
  const pending = {
    target,
    sources: [],
    repacks: [],
    loading: true,
    failed: false,
  };
  assert.equal(getSharedRepackStatus(pending), "loading");
  assert.equal(
    getSharedRepackStatus({ ...pending, loading: false }),
    "source_missing"
  );
  const installed = {
    ...pending,
    sources: [{ id: "A", url: target.sourceUrl }],
    loading: false,
  };
  assert.equal(getSharedRepackStatus(installed), "repack_missing");
  const ready = {
    ...installed,
    repacks: [{ id: "release", downloadSourceId: "A" }],
  };
  assert.equal(getSharedRepackStatus(ready), "ready");
  assert.equal(getSharedRepackStatus({ ...ready, failed: true }), "failed");
  assert.equal(
    getSharedRepackStatus({
      ...ready,
      repacks: [{ id: "release", downloadSourceId: "B" }],
    }),
    "repack_missing"
  );
});

test("legacy links support manual source addition and URL-only source identification", () => {
  const options = {
    sources: [{ id: "A", url: "https://example.com/source.json" }],
    repacks: [{ id: "release", downloadSourceId: "A" }],
    loading: false,
    failed: false,
  };
  assert.equal(
    getSharedRepackStatus({
      ...options,
      target: { sourceId: "A", repackId: "release", sourceUrl: null },
    }),
    "ready"
  );
  assert.equal(
    getSharedRepackStatus({
      ...options,
      target: {
        sourceId: null,
        repackId: "release",
        sourceUrl: "https://example.com/source.json",
      },
    }),
    "ready"
  );
  assert.equal(getSharedRepackStatus({ ...options, target: null }), "none");
});
