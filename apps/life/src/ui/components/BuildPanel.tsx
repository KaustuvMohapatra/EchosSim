import type { LifeApp } from "../../app/bootstrap.js";
import type { BuildKind } from "../../build/BuildController.js";

const ITEMS: readonly { kind: BuildKind; label: string; detail: string }[] = [
  { kind: "chair", label: "Chair", detail: "A place to rest and regain comfort." },
  { kind: "sofa", label: "Sofa", detail: "Comfort and relaxation for nearby residents." },
  { kind: "table", label: "Table", detail: "A place for quiet reflection." },
  { kind: "bookshelf", label: "Bookshelf", detail: "Read books and develop Knowledge." },
  { kind: "bench", label: "Bench", detail: "A place to take a break." },
  { kind: "bed", label: "Bed", detail: "Take a nap and recover Energy." },
  { kind: "desk", label: "Desk", detail: "Creative projects can develop Creativity." },
  { kind: "counter", label: "Counter", detail: "Chat with locals and practice Social skills." },
  { kind: "arcade", label: "Arcade", detail: "Residents play games to gain Fun and Social experience." },
  { kind: "easel", label: "Art Easel", detail: "Residents paint, improve their mood, and develop Creativity." },
  { kind: "garden", label: "Garden", detail: "Tending plants improves Fun and Fitness, using Energy." },
  { kind: "noticeboard", label: "Noticeboard", detail: "Discover community notices and gain Knowledge." },
];

export function BuildPanel({ app, feedback }: { app: LifeApp; feedback?: string }) {
  const active = ITEMS.find((item) => item.kind === app.buildSelection);
  return (
    <section className="build-panel" data-testid="build-panel">
      <header>
        <span><small>Simulation paused</small><strong>Build &amp; Play</strong></span>
        <button type="button" className="secondary-button" onClick={() => app.setBuildMode(false)}>Done</button>
      </header>
      <p>Choose an object and click a lot to place it. Nearby residents can use what you build.</p>
      <div className="build-catalog">
        {ITEMS.map((item) => (
          <button type="button" key={item.kind}
            className={app.buildSelection === item.kind ? "is-active" : ""}
            title={item.detail} aria-pressed={app.buildSelection === item.kind}
            onClick={() => app.setBuildSelection(app.buildSelection === item.kind ? null : item.kind)}>
            <i aria-hidden="true" />{item.label}
          </button>
        ))}
      </div>
      <div className="build-panel__description" aria-live="polite">
        {active ? <><strong>{active.label}</strong><span>{active.detail}</span></>
          : <span>Objects influence residents' needs, memories and experience when used.</span>}
      </div>
      <footer>
        <span>{active ? `${active.label} selected` : "Choose an object"}</span>
        <div>
          <button type="button" disabled={!app.build.canUndo} onClick={() => app.build.undo()}>Undo</button>
          <button type="button" disabled={!app.build.canRedo} onClick={() => app.build.redo()}>Redo</button>
        </div>
      </footer>
      {feedback && <small className="build-panel__feedback">{feedback}</small>}
    </section>
  );
}
