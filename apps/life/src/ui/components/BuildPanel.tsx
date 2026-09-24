import type { LifeApp } from "../../app/bootstrap.js";
import type { BuildKind } from "../../build/BuildController.js";

const ITEMS: readonly { kind: BuildKind; label: string }[] = [
  { kind: "chair", label: "Chair" }, { kind: "sofa", label: "Sofa" },
  { kind: "table", label: "Table" }, { kind: "bookshelf", label: "Bookshelf" },
  { kind: "bench", label: "Bench" }, { kind: "bed", label: "Bed" },
  { kind: "desk", label: "Desk" }, { kind: "counter", label: "Counter" },
];

export function BuildPanel({ app, feedback }: { app: LifeApp; feedback?: string }) {
  return (
    <section className="build-panel" data-testid="build-panel">
      <header>
        <span><small>Simulation paused</small><strong>Build Mode</strong></span>
        <button type="button" className="secondary-button" onClick={() => app.setBuildMode(false)}>Done</button>
      </header>
      <p>Pick furniture, then click inside a lot to place it.</p>
      <div className="build-catalog">
        {ITEMS.map((item) => (
          <button type="button" key={item.kind}
            className={app.buildSelection === item.kind ? "is-active" : ""}
            onClick={() => app.setBuildSelection(app.buildSelection === item.kind ? null : item.kind)}>
            <i aria-hidden="true" />{item.label}
          </button>
        ))}
      </div>
      <footer>
        <span>{app.buildSelection ? `${ITEMS.find((x) => x.kind === app.buildSelection)?.label} selected` : "Choose an item"}</span>
        <div>
          <button type="button" disabled={!app.build.canUndo} onClick={() => app.build.undo()}>Undo</button>
          <button type="button" disabled={!app.build.canRedo} onClick={() => app.build.redo()}>Redo</button>
        </div>
      </footer>
      {feedback && <small className="build-panel__feedback">{feedback}</small>}
    </section>
  );
}
