import { useState } from 'react';
import {
  ConnectButton,
  MeroProvider,
  useApps,
  useCreateApp,
  useExecute,
  useMero,
  useSubscription,
  useView,
  type Failure,
} from '@calimero-network/mero-react';
import { MAX_COUNT, MAX_SIDES, MIN_COUNT, MIN_SIDES, type Roll } from './types';

/**
 * Where the page finds its node:
 * - `VITE_NODE_URL`: a dev node (`merod local`), mock attestation allowed. Dev only.
 * - `VITE_CLUSTER`: a Calimero Cloud cluster by name.
 * - neither: the node that serves the page (bundled into the .mpk with `--frontend`).
 */
const DEV_NODE = import.meta.env.VITE_NODE_URL as string | undefined;
const CLUSTER = import.meta.env.VITE_CLUSTER as string | undefined;
const MIN_RELEASE = (import.meta.env.VITE_MIN_RELEASE as string | undefined) ?? '2.3.109';
const PACKAGE = (import.meta.env.VITE_PACKAGE as string | undefined) ?? 'com.example.dice';

const HISTORY_LIMIT = 20;
const PRESETS = [4, 6, 8, 10, 12, 20, 100];

export default function App() {
  if (DEV_NODE) {
    return (
      <MeroProvider nodeUrl={DEV_NODE} allowMock>
        <Main />
      </MeroProvider>
    );
  }
  return CLUSTER ? (
    <MeroProvider cluster={CLUSTER} minReleaseVersion={MIN_RELEASE}>
      <Main />
    </MeroProvider>
  ) : (
    <MeroProvider servedByNode minReleaseVersion={MIN_RELEASE}>
      <Main />
    </MeroProvider>
  );
}

function Main() {
  const { isAuthenticated, appId, setAppId } = useMero();
  return (
    <main className="shell">
      <header className="top">
        <h1>
          <span className="logo" aria-hidden>⚄</span> Dice Roller
        </h1>
        <ConnectButton appName="Dice Roller" />
      </header>
      {!isAuthenticated && <p className="muted">Sign in with your passkey to roll.</p>}
      {isAuthenticated && !appId && <PickApp onPick={setAppId} />}
      {isAuthenticated && appId && <Table onLeave={() => setAppId(null)} />}
    </main>
  );
}

function PickApp({ onPick }: { onPick: (id: string) => void }) {
  const apps = useApps({ package: PACKAGE });
  return (
    <>
      <section className="card">
        <h2>Pick a table</h2>
        {apps.loading && <p className="muted">Loading dice tables…</p>}
        {apps.failure && <p role="alert" className="error">{apps.failure.message}</p>}
        {!apps.loading && !apps.failure && apps.data.length === 0 && (
          <p className="muted">No tables yet. Start one below.</p>
        )}
        {apps.data.length > 0 && (
          <ul className="apps">
            {apps.data.map((app) => (
              <li key={app.appId}>
                <button onClick={() => onPick(app.appId)}>{app.name || app.appId}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <NewTable onCreated={onPick} />
    </>
  );
}

/** Creates an instance of the dice package; its `init` takes no arguments. */
function NewTable({ onCreated }: { onCreated: (id: string) => void }) {
  const { create, loading, failure } = useCreateApp();
  const [name, setName] = useState('Game night');
  return (
    <section className="card">
      <h2>New table</h2>
      <form
        className="fields new-table"
        onSubmit={async (e) => {
          e.preventDefault();
          const appId = await create({ name: name.trim(), bundle: { package: PACKAGE } });
          if (appId) onCreated(appId);
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </label>
        <button className="primary" disabled={loading || !name.trim()}>
          {loading ? 'Creating…' : 'Create table'}
        </button>
      </form>
      {failure && (
        <p role="alert" className="error">
          {failure.code === 'VERSION_REQUIRED'
            ? `This account can't see ${PACKAGE}. Open the page from the package's own origin (see the README), or install the package with this account.`
            : failure.message}
        </p>
      )}
    </section>
  );
}

function Table({ onLeave }: { onLeave: () => void }) {
  const history = useView<Roll[]>('history', { limit: HISTORY_LIMIT });
  const count = useView<string>('count');
  const { execute, loading, failure, reset } = useExecute();
  const [sides, setSides] = useState(6);
  const [diceCount, setDiceCount] = useState(2);
  const [mine, setMine] = useState<Roll | null>(null);

  const refresh = () => {
    void history.refetch();
    void count.refetch();
  };

  // Someone in the org rolled (us included): reload the shared history.
  useSubscription(
    undefined,
    (event) => {
      if (event.kind === 'Rolled') refresh();
    },
    { onOpen: refresh },
  );

  const valid =
    Number.isInteger(sides) &&
    sides >= MIN_SIDES &&
    sides <= MAX_SIDES &&
    Number.isInteger(diceCount) &&
    diceCount >= MIN_COUNT &&
    diceCount <= MAX_COUNT;

  const roll = async () => {
    reset();
    const result = await execute<Roll>('roll', { sides, count: diceCount });
    if (result) setMine(result);
    refresh();
  };

  const latest = mine ?? history.data?.[0] ?? null;

  return (
    <>
      <section className="card">
        <div className="row">
          <h2>Roll</h2>
          <button className="link" onClick={onLeave}>
            Switch table
          </button>
        </div>

        <div className="presets" role="group" aria-label="Die type">
          {PRESETS.map((n) => (
            <button key={n} className={n === sides ? 'chip on' : 'chip'} onClick={() => setSides(n)}>
              d{n}
            </button>
          ))}
        </div>

        <div className="fields">
          <label>
            Dice
            <input
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={diceCount}
              onChange={(e) => setDiceCount(e.target.valueAsNumber)}
            />
          </label>
          <label>
            Sides
            <input
              type="number"
              min={MIN_SIDES}
              max={MAX_SIDES}
              value={sides}
              onChange={(e) => setSides(e.target.valueAsNumber)}
            />
          </label>
          <button className="primary" disabled={loading || !valid} onClick={() => void roll()}>
            {loading ? 'Rolling…' : `Roll ${Number.isFinite(diceCount) ? diceCount : '?'}d${Number.isFinite(sides) ? sides : '?'}`}
          </button>
        </div>
        {!valid && (
          <p className="hint">
            Dice {MIN_COUNT}–{MAX_COUNT}, sides {MIN_SIDES}–{MAX_SIDES}.
          </p>
        )}
        {failure && <p role="alert" className="error">{describe(failure)}</p>}
      </section>

      {latest && <Result roll={latest} />}

      <section className="card">
        <div className="row">
          <h2>History</h2>
          <span className="muted">{count.data ?? '…'} rolls</span>
        </div>
        {history.failure && <p role="alert" className="error">{history.failure.message}</p>}
        {history.data && history.data.length === 0 && <p className="muted">No rolls yet. Be the first.</p>}
        <ol className="history">
          {history.data?.map((r) => (
            <li key={r.id}>
              <span className="who" title={r.by}>
                {short(r.by)}
              </span>
              <span className="what">
                {r.faces.length}d{r.sides}
              </span>
              <span className="faces">{r.faces.join(' · ')}</span>
              <strong className="total">{r.total}</strong>
              <time className="muted" dateTime={new Date(Number(r.at)).toISOString()}>
                {new Date(Number(r.at)).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Result({ roll }: { roll: Roll }) {
  return (
    <section className="card result" aria-live="polite">
      <div className="dice">
        {roll.faces.map((f, i) => (
          <span key={`${roll.id}-${i}`} className="die" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
            {f}
          </span>
        ))}
      </div>
      <p className="sum">
        Total <strong>{roll.total}</strong>
        <span className="muted">
          {' '}
          · {roll.faces.length}d{roll.sides} by {short(roll.by)}
        </span>
      </p>
    </section>
  );
}

function describe(f: Failure): string {
  if (f.appCode === 'BadSides') return `A die needs ${MIN_SIDES}–${MAX_SIDES} sides.`;
  if (f.appCode === 'BadCount') return `Roll ${MIN_COUNT}–${MAX_COUNT} dice at a time.`;
  return f.message;
}

function short(account: string): string {
  return account.length > 14 ? `${account.slice(0, 6)}…${account.slice(-4)}` : account;
}
