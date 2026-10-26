import { useNavigate } from 'react-router-dom';
import type { DiagramMethod } from '@labguide/shared';
import { api } from '../../api';
import { useSession } from '../../session';
import { Icon } from '../../components/ui';

/** Methods offered on the choice screen. "photo" is a reserved extension point. */
const METHODS: { id: DiagramMethod; available: boolean }[] = [
  { id: 'canvas', available: true },
  { id: 'photo', available: false },
];

export function DiagramMethodChoice() {
  const { session } = useSession();
  const nav = useNavigate();
  async function chooseCanvas() {
    await api.setProgress(session.id, 'diagram', 'canvas').catch(() => undefined);
    nav(`/s/${session.id}/diagram/canvas`);
  }
  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">How will you make your diagram?</h1>
      <p>Your plan passed the checks. Now draw a labelled, side-view (sectional) diagram of your setup.</p>
      <div className="choice-grid">
        {METHODS.map((m) =>
          m.id === 'canvas' ? (
            <button key={m.id} className="choice" onClick={chooseCanvas}>
              <span className="check" aria-hidden="true"><Icon name="pencil" size={16} /></span>
              <span>
                <strong>Build on canvas</strong>
                <br />
                <span className="muted">Drag apparatus onto a bench, place items inside each other, and add labels.</span>
              </span>
            </button>
          ) : (
            <PhotoMethodCard key={m.id} />
          ),
        )}
      </div>
      {session.workingDiagram && (
        <p className="btn-row">
          <button className="btn" onClick={() => nav(`/s/${session.id}/diagram/result`)}>
            <Icon name="history" /> View my diagram and versions
          </button>
        </p>
      )}
    </section>
  );
}

/** Disabled card. Deliberately contains no file input, camera access or upload code. */
function PhotoMethodCard() {
  return (
    <div className="choice choice-disabled" aria-disabled="true" role="group" aria-labelledby="photo-title" aria-describedby="photo-desc">
      <span className="check" aria-hidden="true" style={{ background: '#e6e3dc' }}><Icon name="camera" size={16} /></span>
      <span>
        <strong id="photo-title">Upload a photo of a hand-drawn diagram</strong> <span className="pill">Coming soon</span>
        <br />
        <span id="photo-desc" className="muted">Photo upload will be added later.</span>
      </span>
    </div>
  );
}

/**
 * Extension point for the future "photo" DiagramMethod (route /s/:id/diagram/photo).
 * TODO(photo upload): build the upload flow here and the matching server endpoint.
 */
export function PhotoUploadComingSoon() {
  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">Photo upload</h1>
      <p className="notice"><span className="pill">Coming soon</span> Photo upload will be added later.</p>
    </section>
  );
}
