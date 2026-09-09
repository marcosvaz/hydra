export function getSharedSourceUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function parseGameShareUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    const version = url.searchParams.get("v");
    const shop = url.searchParams.get("shop");
    const objectId = url.searchParams.get("objectId");
    if (
      url.protocol !== "hydralauncher:" ||
      url.host !== "game" ||
      (version !== null && version !== "1") ||
      !shop ||
      !["steam", "launchbox"].includes(shop) ||
      !objectId?.trim() ||
      objectId === "." ||
      objectId === ".."
    )
      return null;

    const params = new URLSearchParams();
    for (const key of ["sourceId", "repackId"]) {
      const value = url.searchParams.get(key);
      if (value) params.set(key, value);
    }
    const sourceUrl = getSharedSourceUrl(url.searchParams.get("sourceUrl"));
    if (sourceUrl) params.set("sourceUrl", sourceUrl);
    const search = params.toString();
    const suffix = search ? `?${search}` : "";
    return `game/${shop}/${encodeURIComponent(objectId)}${suffix}`;
  } catch {
    return null;
  }
}

export interface SharedRepackTarget {
  sourceId: string | null;
  repackId: string | null;
  sourceUrl: string | null;
}

export function getSharedRepackStatus({
  target,
  sources,
  repacks,
  loading,
  failed,
}: {
  target: SharedRepackTarget | null;
  sources: { id: string; url: string }[];
  repacks: { id: string; downloadSourceId: string }[];
  loading: boolean;
  failed: boolean;
}):
  | "none"
  | "loading"
  | "failed"
  | "source_missing"
  | "repack_missing"
  | "ready" {
  if (!target) return "none";
  if (loading) return "loading";
  if (failed) return "failed";
  const hasSource = sources.some((source) => {
    if (target.sourceId) return source.id === target.sourceId;
    return getSharedSourceUrl(source.url) === target.sourceUrl;
  });
  if ((target.sourceId || target.sourceUrl) && !hasSource)
    return "source_missing";
  return findSharedRepack(repacks, target.sourceId, target.repackId)
    ? "ready"
    : "repack_missing";
}

export function findSharedRepack<
  T extends { id: string; downloadSourceId: string },
>(repacks: T[], sourceId: string | null, repackId: string | null): T | null {
  if (!repackId) return null;
  return (
    repacks.find(
      (repack) =>
        repack.id === repackId &&
        (!sourceId || repack.downloadSourceId === sourceId)
    ) ?? null
  );
}
