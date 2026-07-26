# Production validation checklist

Complete this checklist on the actual show laptop and audio interface.

## Installation and offline operation

- [ ] Run `npm install`, `npm run build`, and `npm test` before the event.
- [ ] Disconnect internet access and confirm the app still starts.
- [ ] Confirm no browser console errors occur.
- [ ] Confirm project and media paths remain valid after a restart.
- [ ] Back up the complete application folder and show media.

## Audio system

- [ ] Select the intended operating-system audio output.
- [ ] Confirm sample-rate compatibility with the audio interface.
- [ ] Confirm left/right routing and polarity.
- [ ] Confirm every cue decodes and preloads.
- [ ] Confirm cue starts are acceptably immediate.
- [ ] Confirm fades do not click.
- [ ] Confirm looping is acceptable for each looped file.
- [ ] Confirm simultaneous-cue behaviour at the maximum expected voice count.
- [ ] Confirm the browser does not suspend audio after inactivity.
- [ ] Disable operating-system notification sounds.

## Operator controls

- [ ] Confirm every keyboard shortcut.
- [ ] Confirm duplicate shortcuts are removed.
- [ ] Confirm Space triggers GO.
- [ ] Confirm Escape stops all.
- [ ] Confirm Shift+Escape performs Panic.
- [ ] Confirm the correct cue remains selected after navigation.
- [ ] Confirm light and dark themes remain legible in the venue.

## Bitfocus Companion

- [ ] Confirm Companion reaches `/api/health`.
- [ ] Confirm cue play, toggle, fade-out, Stop All, and Panic buttons.
- [ ] Confirm the dedicated module reports active, armed, paused, completed, error, muted, and engine-offline feedback correctly.
- [ ] Confirm cue name, position, remaining time, loudness, and connection variables update.
- [ ] Confirm delivered commands receive an `executed` acknowledgement rather than timing out.
- [ ] Confirm the active browser is shown as the playback engine.
- [ ] Confirm a standby browser does not duplicate playback.
- [ ] Confirm “Take Playback Control” transfers ownership safely.
- [ ] Confirm rapid repeated button presses are debounced.
- [ ] Label Panic distinctly and protect it from accidental presses.
- [ ] Leave module-level Panic disabled until its protected button has been rehearsed.

## Reliability

- [ ] Run a continuous two-hour playback test.
- [ ] Run the complete show cue sequence at least twice.
- [ ] Monitor CPU, memory, and audio glitches.
- [ ] Test browser refresh and reconnection.
- [ ] Test server restart and project recovery.
- [ ] Test a deliberately missing audio file.
- [ ] Test a corrupted/unsupported audio file.
- [ ] Verify logs capture UI, keyboard, and API actions.

## Metering

- [ ] Compare peak/RMS readings against a trusted reference.
- [ ] Confirm clip indication near 0 dBFS.
- [ ] Confirm loudness reset.
- [ ] Run the official EBU loudness test set in the exact production browser and confirm readings are within the required tolerance.
- [ ] Calibrate the downstream audio interface and monitoring chain separately; browser dBTP/LUFS metering cannot perform analogue or acoustic calibration.

## Show-day discipline

- [ ] Connect laptop power and disable sleep.
- [ ] Disable automatic OS/browser updates.
- [ ] Close unnecessary applications and tabs.
- [ ] Use a wired network for remote Companion control.
- [ ] Keep a backup playback device and emergency audio files ready.
- [ ] Reconfirm output level before doors open.
