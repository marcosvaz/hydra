import { PlusCircleIcon, SyncIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { useTranslation } from "react-i18next";

interface SharedRepackNoticeProps {
  status:
    | "none"
    | "loading"
    | "failed"
    | "source_missing"
    | "repack_missing"
    | "ready";
  onAddSource: () => void;
  onRetry: () => void;
}

const messages = {
  loading: "shared_download_loading",
  failed: "shared_download_load_failed",
  source_missing: "shared_download_source_missing",
  repack_missing: "shared_download_option_missing",
} as const;

export function SharedRepackNotice({
  status,
  onAddSource,
  onRetry,
}: Readonly<SharedRepackNoticeProps>) {
  const { t } = useTranslation("game_details");
  if (status === "none" || status === "ready") return null;
  return (
    <div className="repacks-modal__shared-notice">
      <p role="status">{t(messages[status])}</p>
      {status === "source_missing" && (
        <Button type="button" theme="outline" onClick={onAddSource}>
          <PlusCircleIcon />
          {t("add_download_source", { ns: "settings" })}
        </Button>
      )}
      {status !== "loading" && (
        <Button type="button" theme="outline" onClick={onRetry}>
          <SyncIcon />
          {t("shared_download_retry")}
        </Button>
      )}
    </div>
  );
}
