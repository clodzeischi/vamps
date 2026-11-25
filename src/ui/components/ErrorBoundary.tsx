// The last resort: something threw while drawing. Instead of a blank page, say
// so and offer ways out. The campaign isn't autosaved here (it may be what's
// broken): the player can export it.
import { Component, type ReactNode } from "react";
import { exportToFile } from "../../save/storage";
import { useStore } from "../store";

/** A part of the game that couldn't be fetched: offline, or a new version replaced it while this tab was open. */
const isStale = (e: Error) => /dynamically imported module|importing a module script|module script failed|preload/i.test(e.message);

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { game, screen } = useStore.getState();
    const stale = isStale(error);
    return (
      <div className="screen">
        <div className="modal-backdrop">
          <section className="panel modal event crash" role="alert">
            <h2 className="panel-title">{stale ? "The game has been updated" : "Something broke"}</h2>
            <p className="prose">
              {stale
                ? `Part of the game couldn't be loaded: there's a new version, or no connection. Reload the page${screen === "battle" ? "; Continue goes straight back into this battle" : ""}.`
                : "The game hit an error it couldn't recover from. Saved campaigns are safe. Export this one first if you haven't saved lately."}
            </p>
            {!stale && <pre className="crash-detail">{error.message}</pre>}
            <div className="modal-row">
              {game && <button className="action" onClick={() => exportToFile(game)}><span className="action-title">Export campaign</span></button>}
              {!stale && <button className="action" onClick={() => { useStore.getState().abandon(); this.setState({ error: null }); }}><span className="action-title">Main menu</span></button>}
              <button className="action primary" autoFocus onClick={() => location.reload()}><span className="action-title">Reload</span></button>
            </div>
          </section>
        </div>
      </div>
    );
  }
}
