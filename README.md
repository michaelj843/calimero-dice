# dice-roller

A random dice roller as a Calimero app: a `calimero:app` WASM component written with
`calimero-sdk`. Every member of the app's organization can roll; each roll is stored
in a shared history and announced with a `Rolled` event.

## Why the dice are fair and the same everywhere

An app instance is replicated by its own Raft log across nodes, so a roll must come out
the same on every replica. The app takes its randomness from `env::random_bytes`, which
the node seeds per log entry: the leader picks the seed, every replica that applies the
entry gets the same faces, and the caller cannot choose them. Faces are drawn with
rejection sampling (`uniform` in `src/lib.rs`), so there is no modulo bias.

## ABI

Names are camelCase; `u64` values travel as decimal strings.

| Method | Kind | Params | Returns | Notes |
| --- | --- | --- | --- | --- |
| `init` | init | | | starts with no rolls |
| `roll` | call | `sides: u32, count: u32` | `Roll` | members only; `sides` 2..=1000, `count` 1..=100; emits `Rolled` |
| `lastRoll` | view | | `Roll \| null` | |
| `history` | view | `limit: u32` | `Roll[]` | newest first, at most 100 |
| `count` | view | | `u64` | number of rolls so far |

`Roll` is `{ id, by, sides, faces, total, at }` (`at` is ms since the epoch).
Errors (`422 APP_ERROR {code, fields}`): `BadSides { sides }`, `BadCount { count }`.

Example: `roll {"sides": 6, "count": 2}` →
`{"id":"0","by":"bob","sides":6,"faces":[3,5],"total":"8","at":"1700000000000"}`

## Build and test

Needs Rust (the pinned toolchain in `rust-toolchain.toml` adds the `wasm32-wasip2`
target). `calimero-sdk` is pulled from git, pinned to a core commit.

```bash
cargo test
```

`cargo test` builds the component for `wasm32-wasip2` and runs it on the real wasmtime
engine through `calimero_sdk::testing::TestApp` (`tests/dice.rs`): faces in range,
totals, seeded determinism, history order, refusals for bad dice and non-members.

To package and deploy it, install `meroctl` from
[calimero-network/core](https://github.com/calimero-network/core)
(`cargo install --locked --path crates/meroctl` in a checkout), then:

```bash
meroctl app build . --out dice.wasm
(cd app && npm ci && npm run build)
meroctl app pack --wasm dice.wasm --frontend app/dist \
  --package com.example.dice --app-version 0.1.0 --out dist/dice-0.1.0.mpk
meroctl app inspect dist/dice-0.1.0.mpk
```

## Frontend

`app/` is a Vite + React page built on `@calimero-network/mero-react` (mero-js underneath).
It signs in with a passkey, lets you pick a `com.example.dice` instance, rolls with `roll`,
shows `history` and `count`, and refreshes live on every `Rolled` event, so everyone at the
table sees each roll as it lands. All of it is `app/src/App.tsx`.

```bash
cd app
npm install
VITE_NODE_URL=http://127.0.0.1:2501 npm run dev   # a merod local node (mock attestation, dev only)
VITE_CLUSTER=eu-shared-1 npm run dev              # or a Calimero Cloud cluster
```

On a dev node, sign in from an origin registered to the package, not `localhost:5173`
(that is the cluster's own origin, so sessions there are not bound to the package and
cannot create tables from a release another account installed: `400 VERSION_REQUIRED`):

```bash
meroctl app origins add com.example.dice http://dice.localhost:5173 --dev-passkey <file>
# then open http://dice.localhost:5173
```

With neither set, the page talks to the node that serves it: pack it into the `.mpk` with
`--frontend app/dist` (above). `VITE_PACKAGE` names the package to list instances of
(default `com.example.dice`); `.env.example` lists every option. The build uses relative
URLs and no inline scripts, as the node's content security policy requires.
