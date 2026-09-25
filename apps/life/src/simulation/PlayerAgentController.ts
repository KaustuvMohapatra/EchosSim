/**
 * PlayerAgentController: sequential action queue + autonomy + household control.
 */
import type { LifeModeAdapter, AutonomyMode } from "./LifeModeAdapter.js";
import { SocialActionType } from "@echosim/social";

export interface QueuedAction {
  id: number;
  label: string;
  status: "pending" | "walking" | "active" | "done" | "failed" | "cancelled";
  /** Human-readable outcome detail from the real command path. */
  detail?: string;
  readonly command: Command;
}

export type Command =
  | { type: "move"; locationId: string; locationName: string }
  | { type: "social"; targetId: string; targetName: string; action: SocialActionType };

let NEXT_ID = 1;

export class PlayerAgentController {
  autonomy: AutonomyMode = "assisted";
  controlled: string;
  private readonly queue: QueuedAction[] = [];
  private unsubscribe: () => void;

  constructor(private readonly adapter: LifeModeAdapter) {
    this.controlled = adapter.playerId;
    this.applyGate();
    this.unsubscribe = this.adapter.subscribe(() => this.pump());
  }

  // ---------------- control switching ----------------

  householdIds(): string[] {
    return this.adapter.town.groups
      .groupsOf(this.controlled)
      .filter((group) => group.kind === "Household")
      .map((group) => group.id);
  }

  householdMembers(): string[] {
    const ids = new Set<string>();
    for (const gid of this.householdIds())
      for (const member of this.adapter.town.groups.membersOf(gid)) ids.add(member);
    return [...ids].sort();
  }

  canSwitchTo(agentId: string): boolean {
    if (!this.adapter.town.residents.tryMind(agentId)) return false;
    for (const gid of this.householdIds())
      if (this.adapter.town.groups.isMember(gid, agentId)) return true;
    return false;
  }

  switchTo(agentId: string): boolean {
    if (!this.canSwitchTo(agentId)) return false;
    const previous = this.controlled;
    this.cancelAllFor(previous);
    this.removeFinished();
    this.controlled = agentId;
    this.applyGate();
    this.emit();
    return true;
  }

  // ---------------- queue surface ----------------

  enqueueMove(locationId: string, locationName: string): void {
    this.queue.push({
      id: NEXT_ID++,
      label: `Go to ${locationName}`,
      status: "pending",
      command: { type: "move", locationId, locationName },
    });
    this.afterMutation();
  }

  enqueueSocial(targetId: string, targetName: string, action: SocialActionType): void {
    const label = action === SocialActionType.Greet ? `Greet ${targetName}`
      : action === SocialActionType.Chat ? `Talk to ${targetName}`
      : `${SocialActionType[action]} ${targetName}`;
    this.queue.push({
      id: NEXT_ID++, label, status: "pending",
      command: { type: "social", targetId, targetName, action },
    });
    this.afterMutation();
  }

  cancel(id: number): void {
    const item = this.queue.find((q) => q.id === id);
    if (!item || item.status === "done" || item.status === "failed" ||
        item.status === "cancelled") return;

    if (item.status === "walking")
      this.adapter.town.navigation.cancel(this.controlled);
    if (item.status === "walking" || item.status === "active")
      this.adapter.interactionsStandUp(this.controlled);

    item.status = "cancelled";
    item.detail = "Cancelled by player.";
    this.afterMutation();
  }

  cancelAllFor(agentId: string): void {
    this.cancelAllForAgent(agentId);
  }

  cancelAll(): void {
    this.cancelAllForAgent(this.controlled);
  }

  clearFinished(): void {
    if (!this.removeFinished()) return;
    this.afterMutation();
  }

  items(): readonly QueuedAction[] { return [...this.queue]; }
  get busy(): boolean {
    return this.queue.some((q) =>
      q.status === "pending" || q.status === "walking" || q.status === "active");
  }

  enqueueVisitAndSocial(targetId: string, targetName: string,
    action: SocialActionType, targetLocationId: string | undefined,
    locationName: string): boolean {
    if (!targetLocationId) return false;
    if (this.adapter.playerLocationId(this.controlled) !== targetLocationId)
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
    this.pruneFinishedHistory();
    this.applyGate();
    this.emit();
  }

  private applyGate(): void {
    if (this.busy || this.autonomy === "full-manual")
      this.adapter.lod.setLevel(this.controlled, 2 /* Coarse */);
    else
      this.adapter.lod.setLevel(this.controlled, 0 /* Full */);
  }

  private emit(): void { this.adapter.touch(); }

  private pump(): void {
    const head = this.queue.find((q) =>
      q.status === "pending" || q.status === "walking" || q.status === "active");
    if (!head) {
      this.applyGate();
      return;
    }

    if (head.command.type === "move") {
      const command = head.command;
      const state = this.adapter.town.agentsById.get(this.controlled);
      const here = state?.hasLocation ? state.currentLocationId : undefined;
      if (here === command.locationId) {
        head.status = "done";
        this.applyGate();
        this.emit();
        return;
      }
      if (head.status === "pending") {
        head.status = "walking";
        const accepted = this.adapter.commandMoveTo(command.locationId, this.controlled);
        if (!accepted) {
          head.status = "failed";
          head.detail = this.adapter.lastCommandFeedback || "Travel could not be started.";
        }
      }
      return;
    }

    if (head.status === "pending") {
      head.status = "active";
      const command = head.command;
      const result = this.adapter.town.social.attempt(
        this.controlled, command.targetId as never, command.action);
      head.status = result.accepted ? "done" : "failed";
      head.detail = result.accepted ? undefined : result.reason;
      this.applyGate();
      this.emit();
    }
  }

  private cancelAllForAgent(agentId: string): void {
    if (this.queue.some((item) => item.status === "walking"))
      this.adapter.town.navigation.cancel(agentId);
    this.adapter.interactionsStandUp(agentId);
    for (const item of this.queue) {
      if (item.status === "done" || item.status === "failed" || item.status === "cancelled")
        continue;
      item.status = "cancelled";
      item.detail = "Cancelled by player.";
    }
    this.afterMutation();
  }

  private removeFinished(): boolean {
    let changed = false;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const status = this.queue[i]!.status;
      if (status !== "cancelled" && status !== "done" && status !== "failed") continue;
      this.queue.splice(i, 1);
      changed = true;
    }
    return changed;
  }

  private pruneFinishedHistory(maxFinished = 24): void {
    let finished = this.queue.filter((item) =>
      item.status === "cancelled" || item.status === "done" || item.status === "failed").length;
    if (finished <= maxFinished) return;
    for (let i = 0; i < this.queue.length && finished > maxFinished;) {
      const status = this.queue[i]!.status;
      if (status === "cancelled" || status === "done" || status === "failed") {
        this.queue.splice(i, 1);
        finished--;
      } else {
        i++;
      }
    }
  }
}
