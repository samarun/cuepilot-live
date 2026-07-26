# CuePilot Live

Connect this module to the CuePilot playback computer.

## Configuration

- **Host:** IP address of the CuePilot computer. Use `127.0.0.1` when Companion runs on the same computer.
- **Port:** CuePilot HTTP port, normally `8090`.
- **API token:** Required when CuePilot has LAN access enabled. It must match `apiToken` in CuePilot's `config/settings.json` or `CUEPILOT_API_TOKEN`.
- **Enable Panic:** Deliberately enable this before a Companion Panic action can stop the complete show.

The module refreshes cue choices, feedback, and variables automatically. The playback browser must be open, connected, and audio-enabled before cue commands can execute.

## Panic protection

The included Panic preset is red and will do nothing until **Enable Panic** is selected in the module configuration. Test Panic during rehearsal before relying on it in a show.
