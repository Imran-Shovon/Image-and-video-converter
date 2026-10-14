import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="mt-6 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="shrink-0">A small toolkit. A smoother day.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/formats" className="hover:text-text">
            Supported formats
          </Link>
          <Link to="/browser-support" className="hover:text-text">
            Browser limitations
          </Link>
          <Link to="/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-text">
            Terms
          </Link>
          <Link to="/licenses" className="hover:text-text">
            Licenses
          </Link>
        </nav>
      </div>
    </footer>
  );
}
