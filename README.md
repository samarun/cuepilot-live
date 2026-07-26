# CuePilot Live

CuePilot Live is an offline-first audio cue player for live events, broadcasts, theatre, church services, conferences, and virtual production sessions.

It uses a React operator interface, the Web Audio API for playback, and a framework-free Node.js server for local storage and Bitfocus Companion HTTP control.

![CuePilot Live UI concept](docs/ui-concept.png)

## Included

- Dark and light interface modes
- Detailed cue list, touch-friendly grid, meter, settings, and logs views
- WAV, MP3, M4A, AAC, OGG, and FLAC import subject to browser codec support
- Local media collection under `media/`
- Keyboard shortcuts per cue
- Global Space/Play-Pause, Escape/Stop All, Shift+Escape/Panic, and arrow-key navigation
- Play, pause, resume, restart, stop, fade-out, toggle, seek, and loop control
- Rename, describe, replace, duplicate, reorder, and delete cues from the operator UI
- Drag-and-drop cue ordering, saved start/end boundaries, Premiere-style scrub previews, and optional play-next follow actions
- Mouse-draggable fade-in/fade-out handles directly on each waveform
- Undo/redo for cue edits, deletion, replacement, ordering, trims, fades, templates, and bulk changes
- Multi-selection with bulk volume, mute, group assignment, reusable cue templates, and explicit auto-follow targets
- Single-cue playback by default, with an optional layered mode for overlapping beds and effects
- Per-cue volume, trigger mode, fades, colour, shortcut, description, and group metadata
- Polyphonic Web Audio playback
- Master and active-cue peak/RMS meters
- BS.1770-style K-weighted momentary, short-term, and dual-gated integrated LUFS metering
- 4× oversampled inter-sample true-peak indication in dBTP
- Persistent project JSON
- Local event log
- Active playback-browser ownership
- Server-Sent Events command delivery
- Bitfocus Companion-compatible HTTP API
- Dedicated Companion module with cue/transport actions, feedback, variables, presets, and protected Panic
- Versioned API aliases, enriched show status, and delivered/executed/rejected/timed-out command acknowledgements
- Localhost-only server by default
- Optional LAN binding, bearer token, CORS allowlist, and upload limit configuration
- No CDN or cloud dependency at runtime

## Important production note

The meter follows the core ITU-R BS.1770-5 signal path: K-weighting, 400 ms loudness blocks, a -70 LUFS absolute gate, a -10 LU relative gate, and 4× true-peak interpolation. Before treating it as a compliance instrument, validate the browser/device combination with the official EBU loudness test set. Listening-level and analogue-output calibration still require calibrated external equipment.

Before using the application in a critical show, complete the production checklist and validate it with the exact browser, operating system, audio interface, files, sample rate, and Companion configuration that will be used at the event.

## Requirements

- Node.js 20 or newer
- npm
- A current Chromium-based browser is recommended for consistent Web Audio behaviour

## Install

```bash
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:8090
```

The production server attempts to open the interface automatically.

## Development

```bash
npm install
npm run dev
```

Development URLs:

```text
React/Vite UI: http://127.0.0.1:5173
Node API:      http://127.0.0.1:8090
```

## Commands

```bash
npm run dev       # Vite and local API server
npm run build     # Production React bundle into dist/
npm start         # Production server
npm test          # Node unit tests
npm run check     # Tests followed by build
```

## Start scripts

- macOS/Linux: `./start-audio-cue-player.sh`
- Windows: `start-audio-cue-player.bat`

The scripts create the production build when `dist/index.html` is missing, then start the local server.

## First use

1. Start the app and open `http://127.0.0.1:8090`.
2. Select **Enable Audio**. Browser security requires a deliberate user interaction before audio can start.
3. Import one or more audio files.
4. Open a cue’s menu and select **Edit cue**.
5. Assign a keyboard shortcut, volume, fade, loop, trigger mode, and cue colour.
6. Open **Settings** to choose dark/light mode and verify playback ownership.
7. Configure Companion using the HTTP examples below.

## Keyboard controls

| Control | Default |
|---|---|
| Play or pause the active/selected cue | Space |
| Stop all | Escape |
| Panic | Shift+Escape |
| Select next cue | Arrow Down |
| Select previous cue | Arrow Up |
| Direct cue trigger | Cue-specific shortcut |

Keyboard triggering is ignored while typing in form fields and can be disabled in Settings.

## Bitfocus Companion

The dedicated module is in `companion-module-cuepilot-live/`. Build its installable package with `npm install` followed by `npm run package` in that directory, then add the resulting `cuepilot-live-0.1.0.tgz` as a local Companion module. It provides cue actions, transport controls, state feedback, show variables, cue presets, and an intentionally disabled-by-default Panic action.

The Generic HTTP Requests module remains fully supported for existing button configurations. Configure the request method as `POST`.

### Trigger a cue

```text
http://127.0.0.1:8090/api/cues/walk-in-music/play
```

### Toggle a cue

```text
http://127.0.0.1:8090/api/cues/walk-in-music/toggle
```

### Fade out a cue

```text
http://127.0.0.1:8090/api/cues/walk-in-music/fade-out
```

### Seek or trigger from a specific time

Send JSON with the request:

```text
POST http://127.0.0.1:8090/api/cues/walk-in-music/seek
{"position": 42.5}
```

Add `"audition": true` to start listening immediately from the requested position.

Or play immediately from that position:

```text
POST http://127.0.0.1:8090/api/cues/walk-in-music/play
{"startTime": 42.5}
```

### Stop all

```text
http://127.0.0.1:8090/api/transport/stop-all
```

### Panic

```text
http://127.0.0.1:8090/api/transport/panic
```

Cue IDs are stored in `projects/current-project.json` and are returned by:

```text
GET http://127.0.0.1:8090/api/cues
```

See [API.md](docs/API.md) for the complete contract.

## LAN access

The default server binds to `127.0.0.1`, which is only reachable from the local machine.

To let Companion run on another computer, create `config/settings.json`:

```json
{
  "allowLanAccess": true,
  "apiToken": "replace-with-a-long-random-token",
  "corsAllowlist": [
    "http://127.0.0.1:8090"
  ]
}
```

LAN mode will not start without a token. Restart the server, then use the laptop’s LAN IP in Companion, for example:

```text
http://192.168.1.40:8090/api/transport/stop-all
```

When an API token is enabled, send:

```text
Authorization: Bearer replace-with-a-long-random-token
```

Loopback requests from the CuePilot computer remain token-free so the local operator interface works normally. Every non-loopback LAN API request must send the bearer token. Do not expose the server directly to the public internet.

## Storage

```text
projects/current-project.json   Current project and cue definitions
media/                          Collected local audio files
logs/events.log                 JSON Lines event log
config/default.json             Default server settings
config/settings.json            Optional local overrides
```

Large audio data is never embedded in project JSON.

## Architecture

```text
Bitfocus Companion
        |
        | HTTP POST
        v
Framework-free Node.js server
        |-- REST API
        |-- project/media/log storage
        |-- playback ownership
        `-- Server-Sent Events
                    |
                    v
              React browser UI
                    |
                    v
              Web Audio API
                    |
                    v
              Audio interface
```

Only one browser is the active playback engine. Other open clients remain in standby until **Take Playback Control** is selected.

## Security defaults

- Binds to localhost unless LAN access is explicitly enabled
- Sanitises media names and blocks path traversal
- Limits JSON request sizes
- Limits media upload size
- Restricts CORS to an allowlist
- Bearer-token validation is optional on localhost and mandatory for non-loopback requests whenever LAN access is enabled
- No shell command API
- No arbitrary filesystem browsing API

## Known scope boundaries

- Browser-native BS.1770-style metering has not yet been certified against every item in the official EBU compliance test set
- Digital dBTP measurement cannot calibrate the downstream DAC, audio interface, amplifier, or loudspeaker chain
- Pause/resume recreates an `AudioBufferSourceNode`, as required by Web Audio
- File format support depends on the browser/OS codec stack
- Audio output-device selection is browser-dependent
- Fixed loop counts are not implemented; looping uses each cue's saved Start At and End At boundaries
- The play-next follow action is implemented; HTTP callbacks and more advanced follow conditions are not

## Production checklist

See [PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

Metering references: [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en) and [EBU loudness resources and test signals](https://tech.ebu.ch/loudness/).

## Licence

MIT. Third-party dependencies and licences are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
