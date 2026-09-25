import type { TimeInfo } from "@echosim/inspector";
import type { LifeApp } from "../../app/bootstrap.js";
import { weatherLabel } from "../models/townView.js";
import { DayCycle } from "./DayCycle.js";

interface TopBarProps {
  app: LifeApp | null;
  time?: TimeInfo;
  phoneBadge?: number;
  onPhone(): void;
  onTown(): void;
  onMap(): void;
}

export function TopBar({ app, time, phoneBadge = 0, onPhone, onTown, onMap }: TopBarProps) {
  const speed = app?.adapter.speed ?? 1;
  const running = app?.adapter.running ?? false;
  const buildMode = app?.buildMode ?? false;
  return (
    <header className="top-bar">
      <div className="top-bar__identity">
        <span className="top-bar__mark" aria-hidden="true">E</span>
        <span>
          <strong>EchoSim</strong>
          <small>{buildMode ? "Build Mode" : "Town"}</small>
        </span>
      </div>

      <DayCycle time={time} />

      <div className="top-bar__controls">
        <div className="top-bar__time">
          <strong>{time ? `${time.dayName} · Day ${time.day + 1}` : "Starting…"}</strong>
          <span>{time ? `${time.hhmm} · ${weatherLabel(time.weather)}` : ""}</span>
        </div>
        {buildMode ? (
          <button type="button" className="primary-button"
            onClick={() => app?.setBuildMode(false)} aria-label="Exit build mode">
            Done building
          </button>
        ) : (
          <>
            <div className="hud-button-group" aria-label="Simulation speed">
              <button type="button" className={`speed-button${!running ? " is-active" : ""}`}
                aria-label={running ? "Pause simulation" : "Resume simulation"}
                onClick={() => app?.adapter.togglePause()}>
                {running ? "Pause" : "Play"}
              </button>
              {[1, 2, 4].map((value) => (
                <button type="button" key={value}
                  className={`speed-button speed-button--${value}${speed === value ? " is-active" : ""}`}
                  aria-label={`${value} times simulation speed`}
                  onClick={() => app?.adapter.setSpeed(value as 1 | 2 | 4)}>
                  {value}×
                </button>
              ))}
            </div>
            <div className="hud-button-group hud-button-group--tools">
              <button type="button" className="hud-tool hud-tool--camera"
                onClick={() => app?.camera.cycleMode()}
                title="Cycle camera (C)" aria-label="Cycle camera mode">Camera</button>
              <button type="button" className="hud-tool hud-tool--phone"
                onClick={onPhone}
                aria-label={phoneBadge > 0 ? `Open phone, ${phoneBadge} pending invitations` : "Open phone"}>
                Phone
                {phoneBadge > 0 && (
                  <span className="hud-attention-badge" aria-hidden="true">
                    {phoneBadge > 9 ? "9+" : phoneBadge}
                  </span>
                )}
              </button>
              <button type="button" className="hud-tool hud-tool--town"
                onClick={onTown} aria-label="Open Town Observer">Town</button>
              <button type="button" className="hud-tool hud-tool--map"
                onClick={onMap} aria-label="Open town map">Map</button>
              <button type="button" className="hud-tool hud-tool--build"
                onClick={() => app?.setBuildMode(true)} aria-label="Enter build mode">Build</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
