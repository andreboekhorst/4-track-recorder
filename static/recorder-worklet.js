/**
 * Low-latency recorder AudioWorklet.
 * - Pass-through: input → output (for direct monitoring with minimal delay).
 * - Captures PCM and sends to main thread for recording (no MediaRecorder buffering).
 */
class RecorderWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !input[0]?.length) return true;

    const channelIn = input[0];
    const channelOut = output[0];
    const length = Math.min(channelIn.length, channelOut?.length ?? 0);

    // Pass-through for low-latency monitoring (mic → worklet → destination)
    if (channelOut && length > 0) {
      channelOut.set(channelIn.subarray(0, length));
    }

    // Send PCM to main thread (copy; worklet buffers are reused)
    const copy = new Float32Array(length);
    copy.set(channelIn.subarray(0, length));
    this.port.postMessage({ type: "pcm", data: copy }, [copy.buffer]);

    return true;
  }
}

registerProcessor("recorder", RecorderWorkletProcessor);
