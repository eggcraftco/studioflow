export function LoadingScreen() {
  return (
    <main
      className="page-shell loading-screen-overlay"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        width: "100vw",
        padding: 24,
        background: "var(--app-bg, #f3f4f6)",
      }}
    >
      <section className="card" style={{ padding: 28, textAlign: "center", maxWidth: 420, width: "min(420px, 100%)" }}>
        <div className="pill">NivaDesk</div>
        <h1 style={{ margin: "18px 0 8px" }}>Loading your workspace…</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>Checking your account access.</p>
      </section>
    </main>
  );
}
