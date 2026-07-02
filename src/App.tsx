import { Component, type ReactNode } from "react";
import BillOfFare from "./concepts/brand4/BillOfFare";

// If anything throws mid-render, show a composed page instead of blank cream.
class Boundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (this.state.broken) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#f8f4ea", color: "#2f2e2a", fontFamily: "Georgia, 'Times New Roman', serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: "0.72rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#6c6343" }}>Maison NC</div>
            <h1 style={{ fontStyle: "italic", fontWeight: 500, fontSize: "1.9rem", margin: "0.7rem 0 0.4rem" }}>The kitchen hit a snag.</h1>
            <p style={{ color: "#65635c", fontStyle: "italic", margin: 0 }}>Refresh the page and the table will be reset.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Boundary>
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#f8f4ea" }}>
        <BillOfFare />
      </div>
    </Boundary>
  );
}
