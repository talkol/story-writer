import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { testApiKey } from '../ai/client';
import ActionSheet from '../components/ActionSheet';
import Icon from '../components/Icon';
import NavBar, { BackButton, LargeTitle, useScrollRef } from '../components/NavBar';
import { StorageFullError } from '../storage/quota';
import { loadSettings, saveSettings } from '../storage/settings';
import { replaceAll } from '../storage/stories';
import { FONT_SCALES, type FontScale } from '../types';

type Status = { tone: 'ok' | 'error' | 'info'; text: string } | null;

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Set when the user was sent here from Create New without a key.
  const next = params.get('next');

  const [settings, setSettings] = useState(loadSettings);
  const [keyInput, setKeyInput] = useState(settings.apiKey ?? '');
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useScrollRef();

  const dirty = keyInput.trim() !== (settings.apiKey ?? '');

  function persist(patch: Partial<typeof settings>): boolean {
    const merged = { ...settings, ...patch };
    try {
      saveSettings(merged);
      setSettings(merged);
      return true;
    } catch (err) {
      setStatus({
        tone: 'error',
        text: err instanceof StorageFullError ? err.message : 'Could not save settings.',
      });
      return false;
    }
  }

  function saveKey() {
    if (!persist({ apiKey: keyInput.trim() || null })) return;
    setStatus({ tone: 'ok', text: keyInput.trim() ? 'Key saved.' : 'Key removed.' });
    if (next && keyInput.trim()) navigate(next, { replace: true });
  }

  async function runTest() {
    setTesting(true);
    setStatus({ tone: 'info', text: 'Checking…' });
    const result = await testApiKey(keyInput);
    setStatus({ tone: result.ok ? 'ok' : 'error', text: result.message });
    setTesting(false);
  }

  function applyFontScale(scale: FontScale) {
    if (!persist({ fontScale: scale })) return;
    document.documentElement.style.setProperty('--font-scale', String(scale));
  }

  return (
    <>
      <NavBar
        title="Settings"
        largeTitle
        scrollRef={scrollRef}
        left={
          <BackButton
            label={next ? 'Library' : 'Back'}
            onClick={() => (next ? navigate('/library') : navigate(-1))}
          />
        }
      />

      <div className="screen" ref={scrollRef}>
        <LargeTitle>Settings</LargeTitle>
        <div className="settings">
          {next && (
            <p className="settings__banner">
              Stories are written by AI, so the app needs your OpenAI API key before it can
              create one. Add it below and you’ll be taken straight back.
            </p>
          )}

          <section className="settings__section">
            <h2 className="settings__heading">OpenAI API key</h2>
            <input
              type="password"
              className="field"
              value={keyInput}
              placeholder="sk-…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setStatus(null);
              }}
            />
            <div className="settings__row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={saveKey}
                disabled={!dirty}
              >
                {dirty ? 'Save key' : 'Saved'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={runTest}
                disabled={testing || !keyInput.trim()}
              >
                {testing ? 'Checking…' : 'Test key'}
              </button>
            </div>

            {status && (
              <p className={`settings__status settings__status--${status.tone}`} role="status">
                {status.text}
              </p>
            )}

            {/* Sits directly under the field, which is where someone who has no key
                is looking. Below the security note it would be missed. */}
            <p className="settings__note">
              Don’t have a key?{' '}
              <a
                className="settings__link"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Create one on the OpenAI platform
                <Icon name="arrow-square-out" size={13} />
              </a>
              . You’ll need an account with billing set up.
            </p>

            <p className="settings__note">
              Stored in this browser’s local storage and sent only to{' '}
              <code>api.openai.com</code>. Anyone with access to this device or browser
              profile can read it — use a dedicated key with a spend limit.
            </p>
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">Text Size</h2>
            <div className="settings__row" role="group" aria-label="Text size">
              {FONT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  className={`btn${settings.fontScale === scale ? ' btn--selected' : ''}`}
                  aria-pressed={settings.fontScale === scale}
                  onClick={() => applyFontScale(scale)}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
            <p className="settings__note">Applies to the reader. Pages re-flow to fit.</p>
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">Data</h2>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setConfirmClear(true)}
            >
              Clear all data
            </button>
            <p className="settings__note">
              Stories live only on this device. Export anything you want to keep first.
            </p>
          </section>
        </div>
      </div>

      {confirmClear && (
        <ActionSheet
          title="Delete every story?"
          message="This removes all stories on this device permanently. It cannot be undone."
          items={[
            {
              label: 'Delete everything',
              destructive: true,
              onSelect: () => {
                replaceAll([]);
                setConfirmClear(false);
                setStatus({ tone: 'ok', text: 'All stories removed.' });
              },
            },
          ]}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
