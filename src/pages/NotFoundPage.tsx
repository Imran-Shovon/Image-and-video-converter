import { Link } from 'react-router';
import { StaticPage } from './StaticPage';

export default function NotFoundPage() {
  return (
    <StaticPage title="Page not found">
      <p>
        That page doesn’t exist. <Link to="/">Go to the homepage</Link> to find a tool.
      </p>
    </StaticPage>
  );
}
