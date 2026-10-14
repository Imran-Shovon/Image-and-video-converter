import { StaticPage } from './StaticPage';

export default function TermsPage() {
  return (
    <StaticPage title="Terms of Use" intro="Last updated: 14 October 2026">
      <h2>Using the tools</h2>
      <p>
        Media Toolkit provides free tools for converting, compressing and editing media files in your browser. You may use them for personal and commercial
        work, provided you follow these terms and applicable law.
      </p>
      <h2>Your content</h2>
      <ul>
        <li>You are responsible for the files you process and must have the right to use and modify them, including any copyright, trademark or privacy rights of others.</li>
        <li>Do not use the tools to process illegal content or to infringe the rights of others.</li>
      </ul>
      <h2>No warranty</h2>
      <p>
        The tools are provided “as is”. Every output is checked automatically before it is offered for download, but we cannot guarantee that results are
        suitable for your purpose. Keep your original files.
      </p>
      <h2>Limits</h2>
      <p>Processing limits (file size, duration, resolution) depend on your device and browser and are shown in the app.</p>
      <h2>Reporting abuse</h2>
      <p>To report abuse of this service, contact the site operator using the details published with this deployment.</p>
      <h2>Changes</h2>
      <p>These terms may be updated. Continued use after changes means you accept the updated terms.</p>
    </StaticPage>
  );
}
