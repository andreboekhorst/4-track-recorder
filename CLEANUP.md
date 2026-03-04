TODO: Code Cleanup & Clarity Audit (We need to do this step by step - since we had some issues)
Context
The 4track recorder codebase has grown organically through iterative development. This plan identifies dead code, unclear patterns, duplicated logic, and areas where over-safety obscures intent — then proposes targeted cleanups to make the code clear for any future developer.

1. Dead Code to Remove
   1a. Delete Transport.svelte entirely
   File: src/lib/components/Transport.svelte (284 lines)
   Why: This is an older version of TransportButtons.svelte. It's imported nowhere. It contains commented-out functions (shuttle(), onDestroy), a TODO with a typo, unused CSS classes (.top, .transport, .time, .time-slider, .controls), and hardcoded pixel values that TransportButtons.svelte replaced with responsive cqw units.
   Action: Delete the file entirely.
   1b. Remove unused mVolume in Mixer.svelte
   File: src/lib/components/Mixer.svelte:7
   Why: let mVolume = $state(0) is declared but never read or written anywhere.
   Action: Delete line 7.
   1c. Clean up comment & unused CSS in Mixer.svelte
   File: src/lib/components/Mixer.svelte:50
   Why: Comment "Not sure if snippets are most useful here, but wanted to try them" — snippets are fine, remove the self-doubt. Also .bg and .light CSS classes (lines 78-104) are not used by any element in this component — they're leftovers from when meter lights lived here.
   Action: Remove the comment on line 50, delete .bg and .light CSS rules.
   1d. Remove commented-out code in engine.svelte.ts
   File: src/lib/audio/engine.svelte.ts:370-371
   Why: // this.playbackStartTime = 0; and // this.playbackOffset = 0; in stopAllPlayback() — either these should be active or they shouldn't exist. Since stopRecording() handles offset preservation separately, these comments are misleading.
   Action: Delete the commented lines.
   1e. Remove commented-out CSS in TransportButtons.svelte
   File: src/lib/components/TransportButtons.svelte:135-141
   Why: Commented-out :before pseudo-element for .rec-light — dead styling.
   Action: Delete the commented block.
   1f. Remove Mixer.svelte from +page.svelte imports (if unused)
   File: src/lib/components/Mixer.svelte — the channelStrip snippet is now duplicated in +page.svelte directly
   Why: Mixer.svelte is still imported by index.ts but check if it's actually rendered anywhere. If the channel strip rendering moved to +page.svelte, Mixer may be dead.
   Action: Verify usage and remove if dead.
2. Duplicated Logic to Consolidate
   2a. startPlayback() vs playOtherTracksForMonitoring()
   File: src/lib/audio/engine.svelte.ts:229-272 and 323-348
   Why: Nearly identical loops — both create BufferSource, apply trimStart, connect to gainNode, call src.start(). The only difference: one excludes a track index and doesn't set up position ticking.
   Action: Extract a shared helper like scheduleTrackSources(excludeIndex?: number, offset?: number): AudioBufferSourceNode[], then call it from both methods.
   2b. stop() and pause() share offset calculation
   File: src/lib/audio/engine.svelte.ts:275-288 and 291-309
   Why: Both compute playbackOffset + (ctx.currentTime - playbackStartTime) clamped to max duration, then call stopSources(). Minor duplication but worth noting.
   Action: Consider extracting capturePlaybackOffset() if we're already refactoring.
3. Unclear Code That Needs Explanation
   3a. Magic number in Cassette drag
   File: src/lib/components/Cassette.svelte — \_dragPercentage = xMove / rect.width / 16
   Why: The / 16 is unexplained. What does 16 represent? A sensitivity divisor? Related to reel visual ratio?
   Action: Name the constant (e.g., DRAG_SENSITIVITY = 16) or add a brief comment.
   3b. trimStart naming ambiguity
   File: src/lib/audio/track.svelte.ts and throughout engine.svelte.ts
   Why: "trimStart" sounds like it trims audio from the start. It actually stores the latency offset measured at the moment of first recording on that track. A name like latencyOffset or recordLatencySeconds would be clearer.
   Action: Rename to latencyOffset across the codebase.
   3c. TODO left in recording timer
   File: src/lib/audio/engine.svelte.ts:556
   Why: // TODO: at the moment it doesnt have granularity we need (1s) but we are doing that later — this is a known limitation. Should be addressed or at minimum clarified.
   Action: Either fix the granularity (recording timer uses 1000ms intervals vs playback's 50ms), or mark with a clear explanation of the tradeoff.
   3d. (ctx as any).outputLatency type casting
   File: src/lib/audio/engine.svelte.ts:604-605
   Why: outputLatency exists on AudioContext in modern browsers but isn't in the TS types yet. The as any cast hides this.
   Action: Add a brief comment explaining why the cast is needed, or extend the AudioContext type locally.
4. Over-Safety That Obscures Intent
   4a. Silent returns in startMonitoring()
   File: src/lib/audio/engine.svelte.ts:394-397
   Why: Three guard clauses that silently return: already monitoring, invalid track index, hidden track. A caller has no way to know their request was ignored.
   Action: At minimum, return a boolean or throw — so callers can react. Or log a warning.
   4b. record() doesn't check if startMonitoring() succeeded
   File: src/lib/audio/engine.svelte.ts:500
   Why: await this.startMonitoring(trackIndex) can throw (mic denied) but the error isn't caught here. If it throws, record() dies mid-execution. If monitoring silently returns (guard clause), recorderSourceNode may be null and this.recorderSourceNode! on line 503 will crash.
   Action: Add explicit error handling — if monitoring fails, don't proceed to record.
   4c. Empty catch in stopSources()
   File: src/lib/audio/engine.svelte.ts:358
   Why: catch { /_ already stopped _/ } — swallowing errors silently is fine here since .stop() on an already-stopped source throws. But the comment could be clearer.
   Action: This one is actually fine. Leave it.
5. Naming Inconsistencies
   5a. selected_i uses snake_case
   File: src/lib/components/els/SlideSelect.svelte:7
   Why: Rest of codebase uses camelCase.
   Action: Rename to selectedIndex.
   5b. Button naming: "rec" vs "record", "fwd" vs "ffwd"
   File: Transport.svelte uses "rec" and "fwd", TransportButtons.svelte uses "record" and "ffwd"
   Why: Since Transport.svelte is being deleted, this resolves itself. Just noting the inconsistency existed.
   5c. Abbreviated props: { lbl, val } in SlideSelect
   File: src/lib/components/els/SlideSelect.svelte:10-16
   Why: lbl and val are unnecessarily abbreviated. label and value are clearer.
   Action: Rename to label and value.
6. Potential Race Condition
   6a. Double getUserMedia if startMonitoring() called twice rapidly
   File: src/lib/audio/engine.svelte.ts:392-394
   Why: Guard checks this.recorderSourceNode, but it's only set AFTER the await getUserMedia() call. Two rapid calls could both pass the guard.
   Action: Add a monitoringInProgress flag set synchronously before the first await. Check it in the guard.
   Files to Modify
   DELETE: src/lib/components/Transport.svelte
   EDIT: src/lib/components/Mixer.svelte — remove mVolume, dead CSS, old comment
   EDIT: src/lib/audio/engine.svelte.ts — consolidate playback helpers, remove commented code, add monitoring guard, fix error propagation in record()
   EDIT: src/lib/components/TransportButtons.svelte — remove commented CSS
   EDIT: src/lib/components/els/SlideSelect.svelte — rename selected_i, lbl, val
   EDIT: src/lib/audio/track.svelte.ts — rename trimStart to latencyOffset
   EDIT: src/lib/components/Cassette.svelte — name the magic 16 constant
   Verification
   Run npx svelte-check after all changes
   Test: play, record, pause+record, stop, seek, rewind, ffwd
   Test: save and load a .4trk file
   Test: rapid record button presses (race condition fix)
   Visual check: cassette animation, meters, knobs all still work
