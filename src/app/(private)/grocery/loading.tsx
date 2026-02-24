export default function GroceryLoading() {
  const skeletonKeys = [
    "loading-skeleton-1",
    "loading-skeleton-2",
    "loading-skeleton-3",
    "loading-skeleton-4",
    "loading-skeleton-5",
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="size-10 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-1">
        {skeletonKeys.map((key, index) => (
          <div
            key={key}
            className="h-12 animate-pulse rounded-lg bg-muted"
            style={{ animationDelay: `${index * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
