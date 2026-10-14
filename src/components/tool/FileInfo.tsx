import type { ReactNode } from 'react';

export interface InfoRow {
  label: string;
  value: ReactNode;
}

export function FileInfo({ title, rows, actions }: { title?: ReactNode; rows: InfoRow[]; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="min-w-0 truncate font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted">{row.label}</dt>
            <dd className="min-w-0 truncate font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
