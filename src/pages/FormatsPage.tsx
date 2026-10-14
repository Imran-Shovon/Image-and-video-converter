import { AUDIO_OUTPUTS, IMAGE_INPUTS, IMAGE_OUTPUTS, OPERATIONS, VIDEO_INPUTS, VIDEO_OUTPUTS, type CapabilityStatus } from '@/lib/media/capabilities';
import { FORMATS } from '@/lib/media/formats';
import { Badge } from '@/components/ui/primitives';
import { StaticPage } from './StaticPage';

const STATUS: Record<CapabilityStatus, { label: string; tone: 'success' | 'accent' | 'warning' | 'neutral' | 'danger' }> = {
  tested: { label: 'Supported', tone: 'success' },
  'browser-dependent': { label: 'Depends on browser', tone: 'accent' },
  implemented: { label: 'Experimental', tone: 'warning' },
  planned: { label: 'Planned', tone: 'neutral' },
  unsupported: { label: 'Not supported', tone: 'danger' },
};

const StatusBadge = ({ status }: { status: CapabilityStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;

/** Generated from the capability matrix (spec §2.2), so it never advertises an untested format. */
export default function FormatsPage() {
  return (
    <StaticPage title="Supported formats" intro="This list is generated from the same capability matrix that drives every tool, so it always matches what the app can actually do.">
      <h2>Image input</h2>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {IMAGE_INPUTS.map((c) => (
            <tr key={c.format}>
              <td>{FORMATS[c.format].label}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td className="text-muted">{c.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Image output</h2>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Encoder</th>
            <th>Transparency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {IMAGE_OUTPUTS.map((c) => (
            <tr key={c.format}>
              <td>
                {FORMATS[c.format].label}
                {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
              </td>
              <td>{c.library}</td>
              <td>{c.transparency ? 'Yes' : 'No'}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Video input</h2>
      <table>
        <thead>
          <tr>
            <th>Container</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {VIDEO_INPUTS.map((c) => (
            <tr key={c.format}>
              <td>{FORMATS[c.format].label}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td className="text-muted">{c.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Video output</h2>
      <table>
        <thead>
          <tr>
            <th>Output</th>
            <th>Engines</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {VIDEO_OUTPUTS.map((c) => (
            <tr key={c.id}>
              <td>
                {c.label}
                {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
              </td>
              <td>{c.engines.map((e) => (e === 'webcodecs' ? 'WebCodecs' : 'ffmpeg.wasm')).join(', ')}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Audio output (Extract audio)</h2>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Codec</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {AUDIO_OUTPUTS.map((c) => (
            <tr key={c.format}>
              <td>{FORMATS[c.format].label}</td>
              <td>
                {c.codec}
                {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
              </td>
              <td>
                <StatusBadge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Operations</h2>
      <table>
        <thead>
          <tr>
            <th>Operation</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {OPERATIONS.map((o) => (
            <tr key={o.id}>
              <td>{o.label}</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td className="text-muted">{o.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StaticPage>
  );
}
