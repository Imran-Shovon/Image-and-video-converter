import { StaticPage } from './StaticPage';

const LICENSES: [string, string, string][] = [
  ['FFmpeg (via ffmpeg.wasm core, includes x264 and x265)', 'GPL-2.0-or-later', 'https://ffmpeg.org/legal.html'],
  ['ffmpeg.wasm (@ffmpeg/ffmpeg, @ffmpeg/util)', 'MIT', 'https://github.com/ffmpegwasm/ffmpeg.wasm'],
  ['Mediabunny', 'MPL-2.0', 'https://github.com/Vanilagy/mediabunny'],
  ['jSquash codecs (MozJPEG, libwebp, libavif, OxiPNG, resize)', 'Apache-2.0 (wrappers); codec licences: BSD/IJG, BSD, BSD-2, MIT', 'https://github.com/jamsinclair/jSquash'],
  ['gifenc', 'MIT', 'https://github.com/mattdesl/gifenc'],
  ['client-zip', 'MIT', 'https://github.com/Touffy/client-zip'],
  ['ONNX Runtime Web', 'MIT', 'https://github.com/microsoft/onnxruntime'],
  ['BiRefNet-lite model (background removal)', 'MIT', 'https://github.com/ZhengPeng7/BiRefNet'],
  ['React, React DOM', 'MIT', 'https://react.dev'],
  ['React Router', 'MIT', 'https://reactrouter.com'],
  ['Radix UI', 'MIT', 'https://www.radix-ui.com'],
  ['Lucide icons', 'ISC', 'https://lucide.dev'],
  ['Zustand', 'MIT', 'https://github.com/pmndrs/zustand'],
  ['Comlink', 'Apache-2.0', 'https://github.com/GoogleChromeLabs/comlink'],
  ['Inter font', 'OFL-1.1', 'https://rsms.me/inter/'],
];

export default function LicensesPage() {
  return (
    <StaticPage title="Open-source licenses" intro="This app is built on open-source software. The full texts are listed in THIRD_PARTY_LICENSES.md in the source repository.">
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>License</th>
          </tr>
        </thead>
        <tbody>
          {LICENSES.map(([name, license, url]) => (
            <tr key={name}>
              <td>
                <a href={url} target="_blank" rel="noreferrer noopener">
                  {name}
                </a>
              </td>
              <td>{license}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted">
        The FFmpeg core is licensed under the GPL because it includes x264 and x265. Its source code is available from the ffmpeg.wasm and FFmpeg projects
        linked above.
      </p>
    </StaticPage>
  );
}
