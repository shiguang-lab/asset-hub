import { connect, type NatsConnection, type Subscription } from "nats";

export const ASSET_HUB_SUBJECT_PREFIX = "asset_hub";

export function eventSubject(eventType: string): string {
  return `${ASSET_HUB_SUBJECT_PREFIX}.${eventType}`;
}

export class NatsChannel {
  private nc: NatsConnection | null = null;

  async connect(url: string): Promise<void> {
    if (this.nc) return;
    this.nc = await connect({ servers: [url], name: "asset-hub" });
  }

  get connected(): boolean {
    return this.nc !== null;
  }

  publish(subject: string, data: unknown): void {
    if (!this.nc) throw new Error("NATS not connected");
    this.nc.publish(subject, JSON.stringify(data));
  }

  subscribe(subject: string, handler: (data: unknown) => Promise<void>): Subscription {
    if (!this.nc) throw new Error("NATS not connected");
    const sub = this.nc.subscribe(subject);
    void (async () => {
      for await (const msg of sub) {
        try {
          await handler(JSON.parse(new TextDecoder().decode(msg.data)) as unknown);
        } catch {
          // Message handlers are expected to be idempotent and swallow their own errors.
        }
      }
    })();
    return sub;
  }

  async close(): Promise<void> {
    if (!this.nc) return;
    await this.nc.drain();
    this.nc = null;
  }
}
