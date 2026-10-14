import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { ProgressBar } from '@/components/tool/ProgressBar';
import HomePage from '@/pages/HomePage';

// Each tool is its own chunk; ffmpeg.wasm and WASM codecs load only when a tool needs them (spec §12).
const ConvertImagePage = lazy(() => import('@/features/images/ConvertImagePage'));
const CompressImagePage = lazy(() => import('@/features/images/CompressImagePage'));
const CropImagePage = lazy(() => import('@/features/images/CropImagePage'));
const ResizeImagePage = lazy(() => import('@/features/images/ResizeImagePage'));
const RemoveBackgroundPage = lazy(() => import('@/features/images/RemoveBackgroundPage'));
const VideoConvertPage = lazy(() => import('@/features/videos/pages/ConvertVideoPage'));
const VideoCompressPage = lazy(() => import('@/features/videos/pages/CompressVideoPage'));
const VideoTrimPage = lazy(() => import('@/features/videos/pages/TrimVideoPage'));
const VideoCropPage = lazy(() => import('@/features/videos/pages/CropVideoPage'));
const VideoResizePage = lazy(() => import('@/features/videos/pages/ResizeVideoPage'));
const ExtractAudioPage = lazy(() => import('@/features/videos/pages/ExtractAudioPage'));
const RemoveAudioPage = lazy(() => import('@/features/videos/pages/RemoveAudioPage'));
const ThumbnailPage = lazy(() => import('@/features/videos/pages/ThumbnailPage'));
const GifPage = lazy(() => import('@/features/videos/pages/GifPage'));
const FormatsPage = lazy(() => import('@/pages/FormatsPage'));
const BrowserSupportPage = lazy(() => import('@/pages/BrowserSupportPage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const LicensesPage = lazy(() => import('@/pages/LicensesPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <ProgressBar fraction={null} label="Loading tool" />
    </div>
  );
}

/** Moves focus to the main region on navigation so screen-reader users land on the new page. */
function FocusOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <ScrollRestoration />
      <FocusOnNavigate />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/image/convert', element: <ConvertImagePage /> },
      { path: '/image/compress', element: <CompressImagePage /> },
      { path: '/image/crop', element: <CropImagePage /> },
      { path: '/image/resize', element: <ResizeImagePage /> },
      { path: '/image/remove-background', element: <RemoveBackgroundPage /> },
      { path: '/video/convert', element: <VideoConvertPage /> },
      { path: '/video/compress', element: <VideoCompressPage /> },
      { path: '/video/trim', element: <VideoTrimPage /> },
      { path: '/video/crop', element: <VideoCropPage /> },
      { path: '/video/resize', element: <VideoResizePage /> },
      { path: '/video/extract-audio', element: <ExtractAudioPage /> },
      { path: '/video/remove-audio', element: <RemoveAudioPage /> },
      { path: '/video/thumbnail', element: <ThumbnailPage /> },
      { path: '/video/gif', element: <GifPage /> },
      { path: '/formats', element: <FormatsPage /> },
      { path: '/browser-support', element: <BrowserSupportPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/licenses', element: <LicensesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
