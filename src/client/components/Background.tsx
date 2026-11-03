export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="blob"
        style={{ width: "55vmax", height: "55vmax", left: "-15vmax", top: "-20vmax", background: "#bcd3ff" }}
      />
      <div
        className="blob"
        style={{
          width: "50vmax",
          height: "50vmax",
          right: "-18vmax",
          top: "20vh",
          background: "#ffd1ec",
          animationDelay: "-9s",
        }}
      />
      <div
        className="blob"
        style={{
          width: "45vmax",
          height: "45vmax",
          left: "10vw",
          bottom: "-20vmax",
          background: "#c9f5e4",
          animationDelay: "-18s",
        }}
      />
    </div>
  );
}
