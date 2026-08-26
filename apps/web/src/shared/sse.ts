import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { SSE_URL } from "../entities/api.js";

const EVENTS: Record<string, Array<string[]>> = {
  "task.updated": [["tasks"], ["home"]],
  "task.completed": [["tasks"], ["assets"], ["home"], ["notifications"]],
  "notification.created": [["notifications"], ["home"]],
  "knowledge.updated": [["knowledge"], ["home"]],
  "asset.updated": [["assets"], ["home"]],
  "credit.updated": [["credits"], ["home"]],
};

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
    source.addEventListener("credit.updated", (_e) => onEvent("credit.updated"));
    source.onerror = () => undefined;
    return () => source.close();
  }, [queryClient]);
}
