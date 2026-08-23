/**
 * PlayerAgentController (Sprint 39): sequential action queue + autonomy.
 *
 * Manual priority reuses the LOD gate: while the queue drives the player,
 * autonomous planning is gated to Coarse (critical needs still bypass —
 * "emergency safety" per spec §8). When the queue drains:
 *   assisted/autonomous → Full (cognition resumes)
 *   full-manual         → stays Coarse
 */
import type { LifeModeAdapter, AutonomyMode } from "./LifeModeAdapter.js";
import { SocialActionType } from "@echosim/social";

export interface QueuedAction {
  id: number;
  label: string;
  status: "pending" | "walking" | "active" | "done" | "failed" | "cancelled";
  readonly command: Command;
}

export type Command =
  | { type: "move"; locationId: string; locationName: string }
  | { type: "social"; targetId: string; targetName: string; action: SocialActionType };

let NEXT_ID = 1;

export class PlayerAgentController {
  autonomy: AutonomyMode = "assisted";
  private readonly queue: QueuedAction[] = [];
  private unsubscribe: () => void;

  constructor(private readonly adapter: LifeModeAdapter) {
    // Start gated: nothing queued yet, but full-manual must hold from birth.
    this.applyGate();
    this.unsubscribe = this.adapter.subscribe(() => this.pump());
  }

  // ---------------- queue surface ----------------

  enqueueMove(locationId: string, locationName: string): void {
    this.queue.push({
      id: NEXT_ID++, label: `Go to ${locationName}`, status: "pending",
      command: { type: "move", locationId, locationName },
    });
    this.afterMutation();
  }

  enqueueSocial(targetId: string, targetName: string, action: SocialActionType): void {
    const label =
      action === SocialActionType.Greet ? `Greet ${targetName}` :
      action === SocialActionType.Chat ? `Talk to ${targetName}` :
      `${SocialActionType[action]} ${targetName}`;
    this.queue.push({
      id: NEXT_ID++, label, status: "pending",
      command: { type: "social", targetId, targetName, action },
    });
    this.afterMutation();
  }

  cancel(id: number): void {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return;
    if (item.status === "walking" || item.status === "active") {
      // Abandon in-flight work: navigation supersede handles travel; seat poses release.
      this.adapter.interactionsStandUp();
      item.status = "cancelled";
      this.applyGate();
      this.emit();
      return;
    }
    item.status = "cancelled";
    this.afterMutation();
  }

  cancelAll(): void {
    for (const q of this.queue)
      if (q.status !== "done" && q.status !== "failed") q.status = "cancelled";
    this.adapter.interactionsStandUp();
    this.drainToFinished();
    this.afterMutation();
  }

  items(): readonly QueuedAction[] { return [...this.queue]; }
  get busy(): boolean {
    return this.queue.some((q) =>
      q.status === "pending" || q.status === "walking" || q.status === "active");
  }

  /**
   * Convenience: walk to the target if needed, then interact.
   * Returns false immediately when the pair can never co-locate today.
   */
  enqueueVisitAndSocial(targetId: string, targetName: string,
    action: SocialActionType, targetLocationId: string | undefined,
    locationName: string): boolean {
    if (!targetLocationId) return false;
    if (this.adapter.playerLocationId() !== targetLocationId)
      this.enqueueMove(targetLocationId, locationName);
    this.enqueueSocial(targetId, targetName, action);
    return true;
  }

  setAutonomy(mode: AutonomyMode): void {
    this.autonomy = mode;
    this.applyGate();
    this.emit();
  }

  dispose(): void { this.unsubscribe(); }

  // ---------------- internals ----------------

  private afterMutation(): void {
    this.applyGate();
    this.emit();
  }

  /** LOD gate = manual priority over utility AI (spec §10). */
  private applyGate(): void {
    if (this.busy || this.autonomy === "full-manual")
      this.adapter.lod.setLevel(this.adapter.playerId, 2 /* Coarse */);
    else
      this.adapter.lod.setLevel(this.adapter.playerId, 0 /* Full */);
  }

  private emit(): void {
    this.adapter.touch();
  }

  /** Drives the head queue item each simulation beat. */
  private pump(): void {
    const head = this.queue.find((q) =>
      q.status === "pending" || q.status === "walking" || q.status === "active");
    if (!head) {
      this.applyGate(); // queue drained → autonomy decides planning
      return;
    }

    if (head.command.type === "move") {
      const cmd = head.command;
      const here = this.adapter.playerLocationId();
      if (here === cmd.locationId) {
        head.status = "done";
        this.applyGate();
        this.emit();
        return;
      }
      if (head.status === "pending") {
        head.status = "walking";
        const ok = this.adapter.commandMoveTo(cmd.locationId);
        if (!ok) head.status = "failed";
      }
      return; // walking: wait for arrival on a later beat
    }

    // social
    if (head.status === "pending") {
      head.status = "active";
      const cmd = head.command;
      const result = this.adapter.town.social.attempt(
        this.adapter.playerId, cmd.targetId as never, cmd.action);
      head.label += result.accepted ? "" : " ✗";
      head.status = result.accepted ? "done" : "failed";
      this.applyGate();
      this.emit();
    }
  }

  private drainToFinished(): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const s = this.queue[i]!.status;
      if (s === "cancelled" || s === "done" || s === "failed") continue;
      this.queue.splice(i, 1);
    }
  }
}
