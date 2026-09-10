/**
 * Server-sent events, consumed with `fetch` rather than `EventSource`.
 *
 * `EventSource` cannot attach an `Authorization` header, and the plugin must
 * not place its access token in a query string where it would land in logs.
 */
export interface ServerEvent {
  id: string;
  event: string;
  data: string;
}

export interface ConsumeOptions {
  url: string;
  /** Header source; called on each (re)connect so tokens stay fresh. */
  headers: () => Promise<Record<string, string>>;
  signal: AbortSignal;
  onEvent: (event: ServerEvent) => void;
}

/**
 * Opens the stream and pumps events until the signal aborts. Resolves on a
 * clean shutdown and rejects only on an unexpected failure, so the caller can
 * decide how loudly to complain.
 */
export async function consumeEventStream(options: ConsumeOptions): Promise<void> {
  const response = await fetch(options.url, {
    headers: { Accept: "text/event-stream", ...(await options.headers()) },
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`事件流连接失败：HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!options.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEvent(raw);
        if (event) options.onEvent(event);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Exported for tests: a single SSE frame. */
export function parseEvent(raw: string): ServerEvent | null {
  let id = "";
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    switch (field) {
      case "id":
        id = value;
        break;
      case "event":
        event = value;
        break;
      case "data":
        data.push(value);
        break;
      default:
        break;
    }
  }
  if (data.length === 0) return null;
  return { id, event, data: data.join("\n") };
}
