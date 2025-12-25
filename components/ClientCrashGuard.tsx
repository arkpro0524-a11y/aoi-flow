"use client";

import React from "react";

type Props = { children: React.ReactNode };
type State = { err?: Error; info?: string };

export default class ClientCrashGuard extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[ClientCrashGuard]", err, info);
    this.setState({ info: info?.componentStack ?? "" });
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 18, fontFamily: "ui-sans-serif, system-ui", color: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Application error (client)</div>
          <pre style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            padding: 12,
            lineHeight: 1.35,
            fontSize: 12,
          }}>
            {String(this.state.err?.stack || this.state.err?.message || this.state.err)}
          </pre>
          {this.state.info ? (
            <pre style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 10,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              padding: 12,
              lineHeight: 1.35,
              fontSize: 12,
              opacity: 0.9,
            }}>
              {this.state.info}
            </pre>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}