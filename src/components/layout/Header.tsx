import { Dialog, DropdownMenu } from 'radix-ui';
import { ChevronDown, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { availableTools, type ToolInfo } from '@/features/tools';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/primitives';

function ToolMenu({ label, tools }: { label: string; tools: ToolInfo[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-surface-2">
        {label} <ChevronDown className="size-4" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 grid min-w-64 gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          {tools.map((t) => (
            <DropdownMenu.Item key={t.id} asChild>
              <Link to={t.path} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
                <t.icon className="size-4 text-accent" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-medium">{t.title}</span>
                  <span className="text-xs text-muted">{t.short}</span>
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThemeToggle() {
  const { pref, cycle } = useTheme();
  const Icon = pref === 'dark' ? Moon : pref === 'system' ? Monitor : Sun;
  const next = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light';
  return (
    <Button variant="ghost" onClick={cycle} aria-label={`Theme: ${pref}. Switch to ${next}.`} title={`Theme: ${pref}`} icon={<Icon className="size-5" aria-hidden />} />
  );
}

export function Header() {
  const tools = availableTools();
  const imageTools = tools.filter((t) => t.kind === 'image');
  const videoTools = tools.filter((t) => t.kind === 'video');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span>Media Toolkit</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <ToolMenu label="Image tools" tools={imageTools} />
          <ToolMenu label="Video tools" tools={videoTools} />
          <NavLink to="/formats" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-surface-2">
            Formats
          </NavLink>
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button variant="ghost" className="md:hidden" aria-label="Open menu" icon={<Menu className="size-5" aria-hidden />} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-4 overflow-y-auto bg-surface p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold">All tools</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" aria-label="Close menu" icon={<X className="size-5" aria-hidden />} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Navigate to an image or video tool.</Dialog.Description>
                {[
                  { label: 'Image tools', list: imageTools },
                  { label: 'Video tools', list: videoTools },
                ].map((group) => (
                  <div key={group.label} className="flex flex-col gap-1">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{group.label}</p>
                    {group.list.map((t) => (
                      <Dialog.Close asChild key={t.id}>
                        <Link to={t.path} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-2">
                          <t.icon className="size-4 text-accent" aria-hidden />
                          {t.title}
                        </Link>
                      </Dialog.Close>
                    ))}
                  </div>
                ))}
                <Dialog.Close asChild>
                  <Link to="/formats" className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-surface-2">
                    Supported formats
                  </Link>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
