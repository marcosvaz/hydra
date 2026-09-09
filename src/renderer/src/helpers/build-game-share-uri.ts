import type { GameShop } from "@types";
import { getSharedSourceUrl } from "../../../shared/game-share.js";

interface BuildGameShareUriOptions {
  shop: GameShop;
  objectId: string;
  sourceId?: string;
  repackId?: string;
  sourceUrl?: string;
}

export function buildGameShareUri({
  shop,
  objectId,
  sourceId,
  repackId,
  sourceUrl,
}: BuildGameShareUriOptions) {
  const searchParams = new URLSearchParams({
    v: "1",
    shop,
    objectId,
  });

  if (sourceId) {
    searchParams.set("sourceId", sourceId);
  }

  if (repackId) {
    searchParams.set("repackId", repackId);
  }
  const validSourceUrl = getSharedSourceUrl(sourceUrl);
  if (validSourceUrl) searchParams.set("sourceUrl", validSourceUrl);

  return `hydralauncher://game?${searchParams.toString()}`;
}
