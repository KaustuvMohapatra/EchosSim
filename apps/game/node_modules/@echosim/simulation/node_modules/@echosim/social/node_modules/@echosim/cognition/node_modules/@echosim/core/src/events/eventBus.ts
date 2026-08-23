/**
 * Typed publish/subscribe bus for simulation events. Instance-owned (no global
 * singletons), snapshot-iteration semantics (subscribing/unsubscribing during
 * publish is safe; late subscribers never see the in-flight event), fault
 * aggregation: one bad handler cannot silently swallow the rest.
 */

export interface EventBusStatistics {
  publishedEvents: number;
  handlerInvocations: number;
  faultedHandlers: number;
}

type Handler = (payload: unknown) => void;

export class EventBus {
  private readonly handlersByType = new Map<string, Handler[]>();
  private readonly stats: EventBusStatistics = {
    publishedEvents: 0,
    handlerInvocations: 0,
    faultedHandlers: 0,
  };

  onFault?: (eventType: string, error: unknown) => void;

  get statistics(): Readonly<EventBusStatistics> {
    return this.stats;
  }

  subscribe<T>(eventType: string, handler: (payload: T) => void): () => void {
    if (typeof handler !== "function") throw new Error("Handler required.");
    this.addHandler(eventType, handler as Handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribe(eventType, handler as Handler);
    };
  }

  unsubscribe<T>(eventType: string, handler: (payload: T) => void): void {
    this.removeHandler(eventType, handler as Handler);
  }

  publish<T>(eventType: string, payload: T): void {
    const snapshot = this.handlersByType.get(eventType);
    this.stats.publishedEvents++;
    if (!snapshot || snapshot.length === 0) return;

    let firstFault: unknown = undefined;
    let hasFault = false;
    for (const handler of [...snapshot]) {
      try {
        handler(payload);
        this.stats.handlerInvocations++;
      } catch (error) {
        this.stats.faultedHandlers++;
        if (!hasFault) {
          firstFault = error;
          hasFault = true;
        }
        this.onFault?.(eventType, error);
      }
    }

    if (hasFault)
      throw new Error(
        `One or more handlers faulted while publishing ${eventType}: ${String(firstFault)}`,
      );
  }

  subscriberCount<T>(eventType: string): number {
    return this.handlersByType.get(eventType)?.length ?? 0;
  }

  private addHandler(type: string, handler: Handler): void {
    const existing = this.handlersByType.get(type) ?? [];
    this.handlersByType.set(type, [...existing, handler]);
  }

  private removeHandler(type: string, handler: Handler): void {
    const existing = this.handlersByType.get(type);
    if (!existing) return;
    const index = existing.indexOf(handler);
    if (index < 0) return;
    const next = [...existing.slice(0, index), ...existing.slice(index + 1)];
    if (next.length === 0) this.handlersByType.delete(type);
    else this.handlersByType.set(type, next);
  }
}
