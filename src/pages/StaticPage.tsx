import { useEffect, type ReactNode } from 'react';

export function StaticPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Media Toolkit`;
  }, [title]);
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="text-muted">{intro}</p>}
      </header>
      <div className="flex flex-col gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-accent [&_a]:underline [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left">
        {children}
      </div>
    </article>
  );
}
