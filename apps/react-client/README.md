# React client

The React client is a desktop-only PWA for creating, sharing, and taking realtime AI interviews. It uses Vite, Chakra UI, TanStack Router/Query/Form, Zustand, Axios, Socket.IO, Orval, and Vitest.

## Run locally

From the repository root:

```bash
pnpm install
pnpm dev:web
```

Vite listens on `http://localhost:5173` and proxies same-origin `/api` and `/socket.io` traffic to `http://localhost:3000`. Override that development target with `VITE_API_PROXY_TARGET`. Set `VITE_API_URL` only when the browser must call a separately hosted API directly.

The UI intentionally blocks touch-first, mobile, tablet, and windows narrower than 1100 pixels before routing can issue protected API work or activate media features.

## Generate API clients

Start NestJS, then run:

```bash
pnpm api:generate
```

Orval generates the application API from `http://localhost:3000/api-docs.json` and Better Auth from `http://localhost:3000/auth-docs.json`. Override those sources with `OPENAPI_SCHEMA_URL` and `AUTH_OPENAPI_SCHEMA_URL`. Generated files are committed so a normal build does not require a running backend.

## Interview media

- Camera and screen tracks are encoded with `MediaRecorder`, acknowledged in order, and discarded by the server. The disposable encoders pause while assistant audio plays, then resume without stopping their live tracks.
- The microphone is converted in the browser to mono 16 kHz signed little-endian PCM16 for the socket protocol; the server wraps each completed turn as WAV at the Gemini STT boundary.
- Acoustic silence detection ends a candidate turn; the server also retains its inactivity timeout as a network fallback.
- The server sends one completed assistant WAV. The client waits for turn end, native-decodes the complete file once, and plays one Web Audio source while final subtitle text remains visible.
- Raw media is never written to Query cache, Zustand persistence, local storage, or IndexedDB.

The lobby enters application fullscreen from the candidate's explicit Begin gesture. If Escape or another browser action exits fullscreen, the live question and transcript are removed from the rendered view and a blocking re-entry screen records an ephemeral exit count. Browsers intentionally retain an escape path for user safety, so this is a deterrence and recovery workflow—not an inescapable kiosk or a security boundary. The server deadline continues during an interruption.

The live header measures authenticated Socket.IO acknowledgement round-trip time without reading or mutating an interview. It displays the latest latency sample; no latency history is persisted.

An interview attempt is the only state that can defer a PWA update. The update prompt never reloads an active room.

## Verify

```bash
pnpm --filter @interview-app/react-client typecheck
pnpm --filter @interview-app/react-client test
pnpm --filter @interview-app/react-client build
pnpm test:e2e:web
```

Vitest covers pure media/protocol logic and React components. Playwright runs the critical desktop journeys in Chromium. Production output is served by nginx in `apps/react-client/Dockerfile`, which proxies API and WebSocket traffic to the Compose backend.
