export default function GroceryLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="size-10 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-muted"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
