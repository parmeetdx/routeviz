export default function Loading() {
  return (
    <div className="grid gap-5">
      <div className="h-32 animate-pulse rounded-[1.4rem] border border-border bg-panel" />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 animate-pulse rounded-[1.2rem] border border-border bg-panel" />
        <div className="h-80 animate-pulse rounded-[1.2rem] border border-border bg-panel" />
      </div>
    </div>
  );
}
