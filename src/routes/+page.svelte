<script lang="ts">
	import { AudioEngine } from '$lib';
	import { onMount } from 'svelte';

	let engine: AudioEngine | null = $state(null);
	let selectedTrack = $state(0);
	let fileInput = $state<HTMLInputElement>(undefined!);

	onMount(() => {
		engine = new AudioEngine();
		return () => engine?.dispose();
	});

	function handleRecord() {
		engine?.record(selectedTrack);
	}

	function handleStop() {
		engine?.stop();
	}

	function handlePlay() {
		engine?.play();
	}

	function handlePause() {
		engine?.pause();
	}

	function handleRewind() {
		engine?.rewind();
	}

	function handleSave() {
		if (!engine) return;
		const blob = engine.exportProject();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'recording.4trk';
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleLoad() {
		fileInput?.click();
	}

	function handleFileChange() {
		const file = fileInput?.files?.[0];
		if (file && engine) {
			engine.importProject(file);
			fileInput.value = '';
		}
	}
</script>

<svelte:head>
	<title>4track – Record</title>
</svelte:head>

{#if engine}
	<div class="app">
		<div class="time">{engine.position}s</div>
		<input
			type="range"
			class="time-slider"
			min="0"
			max={engine.duration || 180}
			step="0.1"
			value={engine.position}
			oninput={(e) => engine?.seek(Number(e.currentTarget.value))}
			disabled={engine.playState === 'recording' || !engine.hasContent}
		/>

		<label class="track-label" for="track-select">Track</label>
		<select id="track-select" class="track-select" bind:value={selectedTrack}>
			{#each engine.tracks as _, i}
				<option value={i}>Track {i + 1}</option>
			{/each}
		</select>

		<label class="trim-label">
			Trim
			<span class="trim-range">LINE</span>
			<input
				type="range"
				min="-1"
				max="1"
				step="0.01"
				value={engine.trimValue}
				oninput={(e) => engine?.setTrim(Number(e.currentTarget.value))}
			/>
			<span class="trim-range">MIC</span>
		</label>

		<label class="trim-label">
			Volume
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={engine.recordingVolume}
				oninput={(e) => engine?.setRecordingVolume(Number(e.currentTarget.value))}
			/>
		</label>

		<div class="latency">{engine.latencyInfo}</div>

		<div class="controls">
			<button
				class="record-btn"
				onclick={handleRecord}
				disabled={engine.playState === 'recording'}
			>
				Record
			</button>
			<button onclick={handleStop} disabled={engine.playState === 'stopped'}>Stop</button>
			<button
				onclick={handlePlay}
				disabled={engine.playState === 'playing' ||
					engine.playState === 'recording' ||
					!engine.hasContent}
			>
				Play
			</button>
			<button onclick={handlePause} disabled={engine.playState !== 'playing'}>Pause</button>
			<button
				onclick={handleRewind}
				disabled={!engine.hasContent || engine.playState === 'recording'}
			>
				Rewind
			</button>
		</div>

		<div class="mixer">
			{#each engine.tracks as track, i}
				<div class="channel-strip">
					<span class="channel-label">Track {i + 1}</span>
					<label>
						Vol
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={track.volume}
							oninput={(e) => engine?.setTrackVolume(i, Number(e.currentTarget.value))}
						/>
					</label>
					<label>
						Pan
						<input
							type="range"
							min="-1"
							max="1"
							step="0.01"
							value={track.pan}
							oninput={(e) => engine?.setTrackPan(i, Number(e.currentTarget.value))}
						/>
					</label>
					<span class="channel-level">{track.level}</span>
				</div>
			{/each}
		</div>

		<div class="master">
			<label class="master-label">
				Master Vol
				<input
					type="range"
					min="0"
					max="0.9"
					step="0.01"
					value={engine.masterVolume}
					oninput={(e) => engine?.setMasterVolume(Number(e.currentTarget.value))}
				/>
			</label>
		</div>

		<div class="file-controls">
			<button onclick={handleSave} disabled={!engine.hasContent}>Save</button>
			<button onclick={handleLoad}>Load</button>
			<input
				type="file"
				accept=".4trk"
				bind:this={fileInput}
				onchange={handleFileChange}
				hidden
			/>
		</div>
	</div>
{/if}

<style>
	.app {
		text-align: center;
	}

	.time {
		font-size: 2rem;
		margin-bottom: 0.25rem;
		font-variant-numeric: tabular-nums;
	}

	.time-slider {
		display: block;
		width: 80%;
		margin: 0 auto 1rem;
		accent-color: #f90;
	}

	.track-label {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.875rem;
		color: #aaa;
	}

	.track-select {
		margin-bottom: 1rem;
		padding: 0.5rem 1rem;
		font-size: 1rem;
		border: 1px solid #444;
		border-radius: 4px;
		background: #333;
		color: #eee;
		cursor: pointer;
	}

	.track-select:hover,
	.track-select:focus {
		background: #444;
		outline: none;
	}

	.trim-label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-bottom: 1rem;
		font-size: 0.75rem;
		color: #aaa;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.trim-label input[type='range'] {
		width: 100px;
		accent-color: #f90;
	}

	.trim-range {
		font-size: 0.6rem;
		color: #666;
		min-width: 2em;
		text-align: center;
	}

	.latency {
		font-size: 0.75rem;
		color: #888;
		margin-bottom: 0.5rem;
		min-height: 1.25rem;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.file-controls {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-top: 1rem;
	}

	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		border: 1px solid #444;
		border-radius: 4px;
		background: #333;
		color: #eee;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #444;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.record-btn {
		background: #c00;
		border-color: #a00;
	}

	.record-btn:hover:not(:disabled) {
		background: #e00;
	}

	.mixer {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid #333;
	}

	.channel-strip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: #222;
		border-radius: 6px;
		min-width: 80px;
	}

	.channel-label {
		font-size: 0.75rem;
		color: #aaa;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.channel-strip label {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 0.7rem;
		color: #888;
		gap: 0.2rem;
	}

	.channel-strip input[type='range'] {
		width: 70px;
		accent-color: #6cf;
	}

	.channel-level {
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		color: #6cf;
		min-width: 2ch;
		text-align: center;
	}

	.master {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid #333;
		text-align: center;
	}

	.master-label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #aaa;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.master-label input[type='range'] {
		width: 120px;
		accent-color: #6cf;
	}
</style>
