import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Asset, SSE_URL } from "../entities/api.js";

const EVENTS: Record<string, Array<string[]>> = {
  "task.updated": [["tasks"], ["home"]],
  "task.completed": [["tasks"], ["assets"], ["home"], ["notifications"]],
  "notification.created": [["notifications"], ["home"]],
  "knowledge.updated": [["knowledge"], ["home"]],
  "asset.updated": [["assets"], ["home"]],
  "credit.updated": [["credits"], ["home"]],
};

function patchAssetThumbnail(item: unknown, assetId: string, thumbnailRef: string): unknown {
  if (!item || typeof item !== "object") return item;
  const candidate = item as Asset;
  if (candidate.id !== assetId) return item;
  if (candidate.thumbnailRef === thumbnailRef && candidate.hasContent === true) return item;
  return { ...candidate, thumbnailRef, hasContent: true };
}

function patchAssetList(list: unknown, assetId: string, thumbnailRef: string): unknown {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const next = list.map((item) => {
    const updated = patchAssetThumbnail(item, assetId, thumbnailRef);
    if (updated !== item) changed = true;
    return updated;
  });
  return changed ? next : list;
}

export function useSse(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(SSE_URL);
    const invalidatePresentationTask = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { taskId?: string };
        if (data.taskId) {
          void queryClient.invalidateQueries({
            queryKey: ["presentation-generation-task", data.taskId],
          });
        }
      } catch {
        // A malformed optional notification must not tear down the shared SSE channel.
      }
    };
    const applyThumbnailUpdate = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          assetId?: string;
          thumbnailRef?: string;
        };
        if (!data.assetId || !data.thumbnailRef) return;
        const { assetId, thumbnailRef } = data;
        // Patch cached lists in-place so cards cross-fade immediately without list refetch flicker.
        queryClient.setQueriesData({ queryKey: ["assets"] }, (old: unknown) => {
          if (Array.isArray(old)) return patchAssetList(old, assetId, thumbnailRef);
          if (old && typeof old === "object" && "items" in old) {
            const page = old as { items: unknown };
            const nextItems = patchAssetList(page.items, assetId, thumbnailRef);
            return nextItems === page.items ? old : { ...page, items: nextItems };
          }
          return old;
        });
        queryClient.setQueriesData({ queryKey: ["home"] }, (old: unknown) => {
          if (!old || typeof old !== "object" || !("recentAssets" in old)) return old;
          const home = old as { recentAssets: unknown };
          const nextRecent = patchAssetList(home.recentAssets, assetId, thumbnailRef);
          return nextRecent === home.recentAssets ? old : { ...home, recentAssets: nextRecent };
        });
        queryClient.setQueryData(["asset", assetId], (old: unknown) =>
          patchAssetThumbnail(old, assetId, thumbnailRef),
        );
      } catch {
        // Keep the shared SSE connection resilient against malformed payloads.
      }
    };
    const onEvent = (key: string) => {
      const targets = EVENTS[key];
      if (!targets) return;
      for (const parts of targets) {
        void queryClient.invalidateQueries({ queryKey: parts as never });
      }
    };
    source.addEventListener("task.updated", (event) => {
      onEvent("task.updated");
      invalidatePresentationTask(event);
    });
    source.addEventListener("task.completed", (event) => {
      onEvent("task.completed");
      invalidatePresentationTask(event);
    });
    source.addEventListener("notification.created", (_e) => onEvent("notification.created"));
    source.addEventListener("knowledge.updated", (_e) => onEvent("knowledge.updated"));
    source.addEventListener("asset.updated", (_e) => onEvent("asset.updated"));
    source.addEventListener("asset.thumbnail.updated", applyThumbnailUpdate);
    source.addEventListener("credit.updated", (_e) => onEvent("credit.updated"));
    source.onerror = () => undefined;
    return () => source.close();
  }, [queryClient]);
}
