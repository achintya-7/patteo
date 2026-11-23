import { Component, type ReactNode } from "react";
import { log } from "../log";
import { catppuccinMocha } from "../theme/theme";

/** Contains render errors to one pane instead of killing the app. Resets when `resetKey` changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    log.error({ err: String(error), stack: error.stack, pane: this.props.label }, "render error");
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <box flexDirection="column" padding={1}>
        <text fg={catppuccinMocha.error}>{`✗ ${this.props.label ?? "This view"} crashed: ${this.state.error.message}`}</text>
        <text fg={catppuccinMocha.subtle}>{"Switch tab or workspace to retry. Details: PATTEO_DEBUG=1 → ~/.config/patteo/patteo.log"}</text>
      </box>
    );
  }
}
