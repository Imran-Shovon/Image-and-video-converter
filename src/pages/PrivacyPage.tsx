import { StaticPage } from './StaticPage';

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy Policy" intro="Last updated: 14 October 2026">
      <h2>Your files stay on your device</h2>
      <p>
        Every tool on this site processes files entirely inside your web browser. Images and videos are never uploaded to our servers or to any third party.
        Processed files exist only in your browser’s memory and are discarded when you leave the page or start over.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>Your tool settings (for example, the last output format you chose) and your theme preference are saved in your browser’s local storage so they are remembered next time. They never leave your device.</li>
        <li>If you use Remove background, the AI model it needs is downloaded from this website once and kept in your browser’s storage so it doesn’t have to be downloaded again. You can remove it by clearing this site’s data in your browser.</li>
        <li>We do not use cookies, analytics, advertising or tracking scripts.</li>
      </ul>
      <h2>What our server sees</h2>
      <p>
        Our hosting provider receives standard request information (such as IP address and browser type) when your browser downloads the website and the
        processing engines. These logs are used only to operate and secure the service and are kept for the provider’s standard retention period.
      </p>
      <h2>Metadata</h2>
      <p>When an image is re-encoded, its metadata (EXIF camera data, GPS location, colour profiles) is removed. Video outputs also drop metadata, chapters and subtitles.</p>
      <h2>Server-side processing</h2>
      <p>
        Server-side processing is not available in this version. If it is added in the future, files will be uploaded only after you explicitly agree, the
        retention period will be shown before upload, and files will be deleted automatically afterwards.
      </p>
      <h2>Contact</h2>
      <p>Questions about privacy can be sent to the site operator using the contact details published with this deployment.</p>
    </StaticPage>
  );
}
