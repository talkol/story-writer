import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar, { NavButton } from '../components/NavBar';
import { loadSettings, saveSettings } from '../storage/settings';
import { replaceAll } from '../storage/stories';
import { StorageFullError } from '../storage/quota';
import { FONT_SCALES, type FontScale } from '../types';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadSettings);
  const [keyInput, setKeyInput] = useState(settings.apiKey ?? '');
  const [status, setStatus] = useState<string | null>(null);

  function persist(next: typeof settings) {
    try {
      saveSettings(next);
      setSettings(next);
      setStatus('Saved.');
    } catch (err) {
      setStatus(err instanceof StorageFullError ? err.message : 'Could not save.');
    }
  }

  return (
    <>
      <NavBar
        title="Settings"
        left={
          <NavButton label="Back" onClick={() => navigate(-1)}>
            ‹ Back
          </NavButton>
        }
      />
      <div className="screen">
        <div className="stub">
          <h2>OpenAI API key</h2>
          <input
            type="password"
            className="field"
            value={keyInput}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <p>
            <button
              type="button"
              className="nav__btn"
              onClick={() => persist({ ...settings, apiKey: keyInput.trim() || null })}
            >
              Save key
            </button>
            <button type="button" className="nav__btn" disabled title="Lands with the AI client">
              Test key
            </button>
          </p>
          <p>
            This key is stored in this browser’s local storage and is sent only to
            <code>api.openai.com</code>. Anyone with access to this device or browser
            profile can read it. Use a dedicated key with a spend limit.
          </p>

          <h2>Reading</h2>
          <p>
            {FONT_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className="nav__btn"
                aria-pressed={settings.fontScale === scale}
                style={{
                  fontWeight: settings.fontScale === scale ? 700 : 400,
                  textDecoration: settings.fontScale === scale ? 'underline' : 'none',
                }}
                onClick={() => persist({ ...settings, fontScale: scale as FontScale })}
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </p>

          <h2>Data</h2>
          <p>
            <button
              type="button"
              className="nav__btn"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                if (confirm('Delete every story on this device? This cannot be undone.')) {
                  replaceAll([]);
                  setStatus('All stories removed.');
                }
              }}
            >
              Clear all data
            </button>
          </p>

          {status && <p role="status">{status}</p>}
        </div>
      </div>
    </>
  );
}
