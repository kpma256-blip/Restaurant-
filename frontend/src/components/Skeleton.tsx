export function SkeletonText({ width = "w-full", height = "h-4" }: { width?: string; height?: string }) {
  return <div className={`${width} ${height} animate-pulse rounded bg-slate-200`} />;
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <div className="card space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonText width="w-1/3" />
          <SkeletonText width="w-full" />
          <SkeletonText width="w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="px-3 py-2">
                <SkeletonText height="h-3" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-slate-100">
              {Array.from({ length: 6 }).map((_, j) => (
                <td key={j} className="px-3 py-2">
                  <SkeletonText height="h-4" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-2 p-4">
          <SkeletonText width="w-1/2" height="h-3" />
          <SkeletonText width="w-2/3" height="h-6" />
        </div>
      ))}
    </div>
  );
}
