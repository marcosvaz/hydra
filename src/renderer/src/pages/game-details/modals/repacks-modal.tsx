import { AddDownloadSourceModal } from "../../settings/add-download-source-modal";
import { useSharedRepack } from "./use-shared-repack";
import { SharedRepackNotice } from "./shared-repack-notice";
import { logger } from "@renderer/logger";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  LinkIcon,
  PlusCircleIcon,
} from "@primer/octicons-react";
import {
  Badge,
  Button,
  CheckboxField,
  Modal,
  TextField,
} from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { clearNewDownloadOptions } from "@renderer/features";
import { buildGameShareUri, getGameKey } from "@renderer/helpers";
import {
  useAppDispatch,
  useAppSelector,
  useDate,
  useToast,
} from "@renderer/hooks";
import { levelDBService } from "@renderer/services/leveldb.service";
import type { Downloader } from "@shared";
import type { DownloadSource, Game, GameRepack } from "@types";
import { orderBy } from "lodash-es";
import { useContext, useEffect, useMemo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "react-tooltip";
import { DownloadSettingsModal } from "./download-settings-modal";
import "./repacks-modal.scss";

export interface RepacksModalProps {
  visible: boolean;
  startDownload: (
    repack: GameRepack,
    downloader: Downloader,
    downloadPath: string,
    automaticallyExtract: boolean,
    addToQueueOnly?: boolean,
    fileIndices?: number[],
    selectedFilesSize?: number | null,
    automaticallyDeleteArchiveFiles?: boolean,
    signal?: AbortSignal
  ) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function RepacksModal({
  visible,
  startDownload,
  onClose,
}: Readonly<RepacksModalProps>) {
  const [filteredRepacks, setFilteredRepacks] = useState<GameRepack[]>([]);
  const [repack, setRepack] = useState<GameRepack | null>(null);
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [downloadSources, setDownloadSources] = useState<DownloadSource[]>([]);
  const [selectedFingerprints, setSelectedFingerprints] = useState<string[]>(
    []
  );
  const [filterTerm, setFilterTerm] = useState("");

  const [lastCheckTimestamp, setLastCheckTimestamp] = useState<string | null>(
    null
  );
  const [isLoadingTimestamp, setIsLoadingTimestamp] = useState(true);
  const [viewedRepackIds, setViewedRepackIds] = useState<Set<string>>(
    new Set()
  );

  const { showSuccessToast, showErrorToast } = useToast();

  const { game, repacks, shop, objectId, refreshDownloadOptions } =
    useContext(gameDetailsContext);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [sourcesFailed, setSourcesFailed] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const { target, status, sharedRepack } = useSharedRepack(
    downloadSources,
    sourcesLoaded,
    sourcesFailed
  );

  const { t } = useTranslation("game_details");

  const { formatDate } = useDate();
  const dispatch = useAppDispatch();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const refreshSources = useCallback(async () => {
    setSourcesLoaded(false);
    setSourcesFailed(false);
    try {
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      setDownloadSources(orderBy(sources, "createdAt", "desc"));
    } catch (error) {
      logger.error("Failed to refresh shared download sources", error);
      setSourcesFailed(true);
    } finally {
      setSourcesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    if (!target) return;
    setFilterTerm("");
    setSelectedFingerprints([]);
    setShowSelectFolderModal(false);
  }, [target]);

  const refreshSharedOptions = () => {
    void refreshSources();
    refreshDownloadOptions();
  };

  useEffect(() => {
    const fetchLastCheckTimestamp = async () => {
      setIsLoadingTimestamp(true);

      try {
        const timestamp = (await levelDBService.get(
          "downloadSourcesSinceValue",
          null,
          "utf8"
        )) as string | null;

        setLastCheckTimestamp(timestamp);
      } catch {
        setLastCheckTimestamp(null);
      } finally {
        setIsLoadingTimestamp(false);
      }
    };

    if (visible && userPreferences?.enableNewDownloadOptionsBadges !== false) {
      fetchLastCheckTimestamp();
    } else {
      setIsLoadingTimestamp(false);
    }
  }, [visible, repacks, userPreferences?.enableNewDownloadOptionsBadges]);

  useEffect(() => {
    if (
      visible &&
      game?.newDownloadOptionsCount &&
      game.newDownloadOptionsCount > 0
    ) {
      const gameKey = getGameKey(game.shop, game.objectId);
      levelDBService
        .get(gameKey, "games")
        .then((gameData) => {
          if (gameData) {
            const updated = {
              ...(gameData as Game),
              newDownloadOptionsCount: undefined,
            };
            return levelDBService.put(gameKey, updated, "games");
          }
          return Promise.resolve();
        })
        .catch(() => {});

      const gameId = `${game.shop}:${game.objectId}`;
      dispatch(clearNewDownloadOptions({ gameId }));
    }
  }, [visible, game, dispatch]);

  const sortedRepacks = useMemo(() => {
    return orderBy(
      repacks,
      [
        (repack) => repack.id === sharedRepack?.id,
        (repack) => repack.uploadDate,
      ],
      ["desc", "desc"]
    );
  }, [repacks, sharedRepack?.id]);

  const getRepackAvailabilityStatus = (
    repack: GameRepack
  ): "online" | "partial" | "offline" => {
    const uris = Array.isArray(repack.uris) ? repack.uris : [];
    const unavailableSet = new Set(repack.unavailableUris ?? []);
    const availableCount = uris.filter(
      (uri) => !unavailableSet.has(uri)
    ).length;
    const unavailableCount = uris.length - availableCount;

    if (uris.length === 0) return "offline";
    if (unavailableCount === 0) return "online";
    if (availableCount === 0) return "offline";
    return "partial";
  };

  useEffect(() => {
    const term = filterTerm.trim().toLowerCase();

    const byTerm = sortedRepacks.filter((repack) => {
      if (!term) return true;
      const lowerTitle = repack.title.toLowerCase();
      const lowerRepacker = repack.downloadSourceName.toLowerCase();
      return lowerTitle.includes(term) || lowerRepacker.includes(term);
    });

    const bySource = byTerm.filter((repack) => {
      if (selectedFingerprints.length === 0) return true;

      return downloadSources.some(
        (src) =>
          src.fingerprint &&
          selectedFingerprints.includes(src.fingerprint) &&
          src.name === repack.downloadSourceName
      );
    });

    setFilteredRepacks(bySource);
  }, [sortedRepacks, filterTerm, selectedFingerprints, downloadSources]);

  const handleRepackClick = (repack: GameRepack) => {
    setRepack(repack);
    setShowSelectFolderModal(true);
    setViewedRepackIds((prev) => new Set(prev).add(repack.id));
  };

  const handleShareRepack = async (repack: GameRepack) => {
    if (!objectId || shop === "custom") {
      return;
    }

    const shareUri = buildGameShareUri({
      shop,
      objectId,
      sourceId: repack.downloadSourceId,
      repackId: repack.id,
      sourceUrl: downloadSources.find(
        (source) => source.id === repack.downloadSourceId
      )?.url,
    });

    try {
      await window.electron.clipboard.writeText(shareUri);

      showSuccessToast(
        t("download_option_link_copied"),
        `${repack.title} — ${repack.downloadSourceName}`
      );
    } catch {
      showErrorToast(t("game_link_copy_failed"));
    }
  };

  const handleFilter: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setFilterTerm(event.target.value);
  };

  const toggleFingerprint = (fingerprint: string) => {
    setSelectedFingerprints((prev) =>
      prev.includes(fingerprint)
        ? prev.filter((f) => f !== fingerprint)
        : [...prev, fingerprint]
    );
  };

  const checkIfLastDownloadedOption = (repack: GameRepack) => {
    if (!game?.download) return false;
    if (!Array.isArray(repack.uris)) return false;
    return repack.uris.some((uri) => uri.includes(game.download!.uri));
  };

  const isNewRepack = (repack: GameRepack): boolean => {
    if (isLoadingTimestamp) return false;

    if (viewedRepackIds.has(repack.id)) return false;

    if (!lastCheckTimestamp || !repack.createdAt) {
      return false;
    }

    try {
      const lastCheckDate = new Date(lastCheckTimestamp);

      if (isNaN(lastCheckDate.getTime())) {
        return false;
      }

      const lastCheckUtc = lastCheckDate.toISOString();

      return repack.createdAt > lastCheckUtc;
    } catch {
      return false;
    }
  };

  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  useEffect(() => {
    if (!visible) {
      setFilterTerm("");
      setSelectedFingerprints([]);
      setIsFilterDrawerOpen(false);
    }
  }, [visible]);

  return (
    <>
      <AddDownloadSourceModal
        visible={showAddSourceModal}
        initialSourceUrl={target?.sourceUrl ?? ""}
        onClose={() => setShowAddSourceModal(false)}
        onAddDownloadSource={refreshSharedOptions}
      />
      <DownloadSettingsModal
        visible={showSelectFolderModal}
        onClose={() => setShowSelectFolderModal(false)}
        startDownload={startDownload}
        repack={repack}
      />

      <Modal
        visible={visible}
        title={t("download_options_title")}
        description={t("repacks_modal_description")}
        onClose={onClose}
      >
        <div
          className={`repacks-modal__filter-container ${isFilterDrawerOpen ? "repacks-modal__filter-container--drawer-open" : ""}`}
        >
          <div className="repacks-modal__filter-top">
            <TextField
              placeholder={t("filter")}
              value={filterTerm}
              onChange={handleFilter}
            />
            {downloadSources.length > 0 && (
              <Button
                type="button"
                theme="outline"
                onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
                className="repacks-modal__filter-toggle"
              >
                {t("filter_by_source")}
                {isFilterDrawerOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </Button>
            )}
          </div>

          <div
            className={`repacks-modal__download-sources ${isFilterDrawerOpen ? "repacks-modal__download-sources--open" : ""}`}
          >
            <div className="repacks-modal__source-grid">
              {downloadSources
                .filter(
                  (
                    source
                  ): source is DownloadSource & { fingerprint: string } =>
                    source.fingerprint !== undefined
                )
                .map((source) => {
                  const label = source.name || source.url;
                  const truncatedLabel =
                    label.length > 16 ? label.substring(0, 16) + "..." : label;
                  return (
                    <div
                      key={source.fingerprint}
                      className="repacks-modal__source-item"
                    >
                      <CheckboxField
                        label={truncatedLabel}
                        checked={selectedFingerprints.includes(
                          source.fingerprint
                        )}
                        onChange={() => toggleFingerprint(source.fingerprint)}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        <SharedRepackNotice
          status={status}
          onAddSource={() => setShowAddSourceModal(true)}
          onRetry={refreshSharedOptions}
        />
        <div className="repacks-modal__repacks">
          {filteredRepacks.length === 0 ? (
            <div className="repacks-modal__no-results">
              <div className="repacks-modal__no-results-content">
                <div className="repacks-modal__no-results-text">
                  {t("no_repacks_found")}
                </div>
                <div className="repacks-modal__no-results-button">
                  <Button
                    type="button"
                    theme="primary"
                    onClick={() => {
                      setShowAddSourceModal(true);
                    }}
                  >
                    <PlusCircleIcon />
                    {t("add_download_source", { ns: "settings" })}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            filteredRepacks.map((repack) => {
              const isLastDownloadedOption =
                checkIfLastDownloadedOption(repack);
              const availabilityStatus = getRepackAvailabilityStatus(repack);
              const tooltipId = `availability-orb-${repack.id}`;

              return (
                <div
                  key={repack.id}
                  className={`repacks-modal__repack-row ${repack.id === sharedRepack?.id ? "repacks-modal__repack-row--shared" : ""}`}
                >
                  <Button
                    theme="dark"
                    onClick={() => handleRepackClick(repack)}
                    className="repacks-modal__repack-button"
                  >
                    <span
                      className={`repacks-modal__availability-orb repacks-modal__availability-orb--${availabilityStatus}`}
                      data-tooltip-id={tooltipId}
                      data-tooltip-content={t(`source_${availabilityStatus}`)}
                    />
                    <Tooltip id={tooltipId} />

                    <p className="repacks-modal__repack-title">
                      {repack.title}
                      {userPreferences?.enableNewDownloadOptionsBadges !==
                        false &&
                        isNewRepack(repack) && (
                          <span className="repacks-modal__new-badge">
                            {t("new_download_option")}
                          </span>
                        )}
                    </p>

                    {repack.id === sharedRepack?.id && (
                      <Badge>{t("shared_by_friend")}</Badge>
                    )}

                    {isLastDownloadedOption && (
                      <Badge>{t("last_downloaded_option")}</Badge>
                    )}

                    <p className="repacks-modal__repack-info">
                      {repack.fileSize} - {repack.downloadSourceName} -{" "}
                      {repack.uploadDate ? formatDate(repack.uploadDate) : ""}
                    </p>
                  </Button>
                  {shop !== "custom" && objectId && (
                    <Button
                      type="button"
                      theme="dark"
                      onClick={() => handleShareRepack(repack)}
                      title={t("share_download_option")}
                      aria-label={
                        t("share_download_option") + ": " + repack.title
                      }
                      className="repacks-modal__share-button"
                    >
                      <LinkIcon size={16} />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </>
  );
}
