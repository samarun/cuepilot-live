# CuePilot Live HTTP API

Base URL:

```text
http://127.0.0.1:8090/api/v1
```

All normal API responses are JSON and include `"apiVersion": "1.1.0"`. Every legacy `/api/...` URL remains available; `/api/v1/...` is the preferred versioned form. Trigger commands return `202 Accepted` after delivery and expose an acknowledgement URL that progresses through `delivered`, `executed`, `rejected`, or `timed-out`.

## Health and status

```http
GET /api/health
GET /api/status
GET /api/cues
GET /api/cues/:cueId
GET /api/project
GET /api/logs
```

## Cue actions

```http
POST /api/cues/:cueId/play
POST /api/cues/:cueId/pause
POST /api/cues/:cueId/resume
POST /api/cues/:cueId/stop
POST /api/cues/:cueId/restart
POST /api/cues/:cueId/fade-out
POST /api/cues/:cueId/toggle
POST /api/cues/:cueId/seek
POST /api/cues/:cueId/volume
POST /api/cues/:cueId/loop
POST /api/cues/:cueId/arm
```

Set cue volume:

```json
{
  "volume": 0.75
}
```

Set cue looping:

```json
{
  "enabled": true
}
```

Seek a cue to a position in seconds. Seeking a stopped cue arms that position; the next play starts there.

```json
{
  "position": 42.5,
  "audition": false
}
```

Set `audition` to `true` to begin playback from the seek position, including when the cue was stopped or paused.

Start immediately from an ad-hoc position without changing the cue's saved start time:

```http
POST /api/cues/:cueId/play
Content-Type: application/json
```

```json
{
  "startTime": 42.5
}
```

When the project playback mode is `single` (the default), triggering a new cue stops the previous cue before starting. Set `settings.playbackMode` to `layered` when overlapping playback is required.

Saved cue boundaries use `startTime` and `endTime` in seconds. An `endTime` of `0` means the end of the source file. Natural completion at the saved end boundary also activates Play Next and global Auto-play Next behavior.

## Transport actions

```http
POST /api/transport/stop-all
POST /api/transport/fade-out-all
POST /api/transport/pause-all
POST /api/transport/resume-all
POST /api/transport/next
POST /api/transport/previous
POST /api/transport/go
POST /api/transport/panic
```

## Project

```http
GET /api/project
PUT /api/project
```

PUT body:

```json
{
  "project": {
    "schemaVersion": 2,
    "id": "default-project",
    "name": "Sunday Live",
    "cues": [],
    "templates": [],
    "settings": {}
  }
}
```

## Media import

```http
POST /api/media/import
Content-Type: audio/wav
X-File-Name: walk-in.wav

<raw file bytes>
```

Response:

```json
{
  "success": true,
  "media": {
    "fileName": "walk-in.wav",
    "mediaUrl": "/media/walk-in.wav",
    "bytes": 1234567
  }
}
```

## Playback-client API

These endpoints are used by the React application:

```http
POST /api/client/register
POST /api/client/heartbeat
POST /api/client/take-control
POST /api/client/state
POST /api/client/command-ack
GET  /api/events?clientId=:clientId
```

`/api/events` is a Server-Sent Events stream carrying trigger commands to the active browser.

## Successful trigger response

```json
{
  "success": true,
  "status": 202,
  "commandId": "uuid",
  "commandStatus": "delivered",
  "statusUrl": "/api/v1/commands/uuid",
  "activeClientId": "uuid"
}
```

Follow the command through execution:

```http
GET /api/v1/commands/:commandId
```

The enriched `GET /api/v1/status` response includes playback-owner connection health, selected and armed cues, active cues, cue states, transport state, position/duration/remaining timing, Live Safe mode, and master loudness/peak data.

## Error response

```json
{
  "success": false,
  "error": {
    "code": "CUE_NOT_FOUND",
    "message": "Cue not found."
  }
}
```

Common status codes:

- `200`: successful read or state update
- `201`: client/media created
- `202`: playback command accepted and delivered
- `401`: bearer token invalid
- `404`: endpoint, cue, or client missing
- `409`: no active playback browser
- `413`: request or file too large
- `429`: duplicate trigger debounced
- `500`: internal error

## LAN authentication

Localhost requests do not require a token. When `allowLanAccess` is enabled, CuePilot refuses to start unless `apiToken` is configured in `config/settings.json` or supplied through `CUEPILOT_API_TOKEN`. Every non-loopback request must then include:

```http
Authorization: Bearer your-long-random-token
```

The dedicated Companion module has a matching bearer-token configuration field. Existing localhost Generic HTTP buttons continue to work unchanged.
