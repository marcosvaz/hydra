import { useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { gameDetailsContext } from "@renderer/context";
import {
  findSharedRepack,
  getSharedRepackStatus,
  getSharedSourceUrl,
} from "@shared";
import type { SharedRepackTarget } from "@shared";
import type { DownloadSource } from "@types";

export function useSharedRepack(
  sources: DownloadSource[],
  sourcesLoaded: boolean,
  sourcesFailed: boolean
) {
  const {
    repacks,
    isLoadingRepacks,
    repacksLoadFailed,
    isLoading,
    hasNSFWContentBlocked,
    shop,
    setShowRepacksModal,
  } = useContext(gameDetailsContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [target, setTarget] = useState<SharedRepackTarget | null>(null);
  const handledSearch = useRef<string | null>(null);

  useEffect(() => {
    const sourceId = searchParams.get("sourceId");
    const repackId = searchParams.get("repackId");
    const sourceUrl = getSharedSourceUrl(searchParams.get("sourceUrl"));
    if (!sourceId && !repackId && !sourceUrl) {
      handledSearch.current = null;
      return;
    }
    if (isLoading || hasNSFWContentBlocked || shop === "custom") return;
    const search = searchParams.toString();
    if (handledSearch.current === search) return;
    handledSearch.current = search;
    setTarget({ sourceId, repackId, sourceUrl });
    setShowRepacksModal(true);
    const remaining = new URLSearchParams(searchParams);
    for (const key of ["sourceId", "repackId", "sourceUrl"])
      remaining.delete(key);
    setSearchParams(remaining, { replace: true });
  }, [
    searchParams,
    setSearchParams,
    isLoading,
    hasNSFWContentBlocked,
    shop,
    setShowRepacksModal,
  ]);

  const status = getSharedRepackStatus({
    target,
    sources,
    repacks,
    loading: !sourcesLoaded || isLoadingRepacks,
    failed: sourcesFailed || repacksLoadFailed,
  });
  const sharedRepack =
    status === "ready" && target
      ? findSharedRepack(repacks, target.sourceId, target.repackId)
      : null;

  return { target, status, sharedRepack };
}
