/** Hold-to-talk Aliyun NLS SpeechTranscriber (16 kHz PCM). */

const GATEWAY = "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1";

export type NlsAsrEvent =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

type NlsFrame = {
  header?: { name?: string; status?: number; status_text?: string };
  payload?: { result?: string };
};

export type StartNlsAsrOptions = {
  /** Must be acquired in the same user-gesture turn as the button click. */
  stream: MediaStream;
  /** Must be created/resumed in the same user-gesture turn (before any await for token). */
  audioCtx: AudioContext;
};

function hexId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / 16000;
  const newLen = Math.floor(input.length / ratio);
  const out = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, input[idx] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export type NlsAsrSession = {
  stop: () => Promise<string>;
};

export function createWishAudioContext(): AudioContext {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AC();
}

/** Open mic with a hard timeout — tablets can hang forever on getUserMedia. */
export function openWishMicrophone(timeoutMs = 6000): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("当前浏览器不支持麦克风"));
  }
  let settled = false;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("打开麦克风超时，请检查系统麦克风权限后重试"));
    }, timeoutMs);

    // 约束越简单，平板越不容易卡死
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (settled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(stream);
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

/** Resume AudioContext but never block the UI forever. */
export async function resumeWishAudioContext(audioCtx: AudioContext, timeoutMs = 1500): Promise<void> {
  if (audioCtx.state === "running") return;
  try {
    await Promise.race([
      audioCtx.resume(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    /* ignore — onaudioprocess may still kick it later */
  }
}

/**
 * Connects an already-opened mic + AudioContext to Aliyun realtime ASR.
 * Call stop() to end and get best final text.
 */
export async function startNlsAsr(
  token: string,
  appkey: string,
  onEvent: ((ev: NlsAsrEvent) => void) | undefined,
  opts: StartNlsAsrOptions
): Promise<NlsAsrSession> {
  let finalText = "";
  let partialText = "";
  let started = false;
  let closed = false;
  const queue: Uint8Array[] = [];
  const taskId = hexId();
  const { stream, audioCtx } = opts;

  if (audioCtx.state === "suspended") {
    try {
      await Promise.race([
        audioCtx.resume(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1500);
        }),
      ]);
    } catch {
      /* ignore */
    }
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(audioCtx.destination);

  const ws = new WebSocket(`${GATEWAY}?token=${encodeURIComponent(token)}`);
  ws.binaryType = "arraybuffer";

  const command = (name: "StartTranscription" | "StopTranscription") => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const header = {
      message_id: hexId(),
      task_id: taskId,
      namespace: "SpeechTranscriber",
      name,
      appkey,
    };
    const frame =
      name === "StartTranscription"
        ? {
            header,
            payload: {
              format: "pcm",
              sample_rate: 16000,
              enable_intermediate_result: true,
              enable_punctuation_prediction: true,
              enable_inverse_text_normalization: true,
              max_sentence_silence: 800,
            },
          }
        : { header };
    ws.send(JSON.stringify(frame));
  };

  const sendPcm = (pcm: Int16Array) => {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    if (!started || ws.readyState !== WebSocket.OPEN) {
      queue.push(bytes.slice());
      if (queue.length > 40) queue.shift();
      return;
    }
    ws.send(bytes);
  };

  processor.onaudioprocess = (ev) => {
    if (closed) return;
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
      return;
    }
    const input = ev.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16k(input, audioCtx.sampleRate);
    sendPcm(pcm);
  };

  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("听写连接超时"));
    }, 10000);

    ws.onopen = () => {
      if (!closed) command("StartTranscription");
    };

    ws.onerror = () => {
      window.clearTimeout(timer);
      onEvent?.({ type: "error", message: "听写连接失败" });
      reject(new Error("听写连接失败"));
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let event: NlsFrame;
      try {
        event = JSON.parse(ev.data) as NlsFrame;
      } catch {
        return;
      }
      const name = event.header?.name;
      const status = event.header?.status;
      if (
        name === "TaskFailed" ||
        (typeof status === "number" && status !== 20000000 && name !== "SentenceEnd")
      ) {
        const msg = event.header?.status_text || "听写失败";
        onEvent?.({ type: "error", message: msg });
        window.clearTimeout(timer);
        reject(new Error(msg));
        return;
      }
      if (name === "TranscriptionStarted") {
        started = true;
        for (const chunk of queue) {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
        }
        queue.length = 0;
        window.clearTimeout(timer);
        onEvent?.({ type: "ready" });
        resolve();
        return;
      }
      const result = event.payload?.result?.trim() || "";
      if (name === "TranscriptionResultChanged" && result) {
        partialText = result;
        onEvent?.({ type: "partial", text: result });
        return;
      }
      if (name === "SentenceEnd" && result) {
        finalText = finalText ? `${finalText}${result}` : result;
        partialText = "";
        onEvent?.({ type: "final", text: finalText });
      }
    };
  });

  try {
    await ready;
  } catch (e) {
    closed = true;
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    try {
      await audioCtx.close();
    } catch {
      /* ignore */
    }
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    throw e;
  }

  const stop = async (): Promise<string> => {
    if (closed) return finalText || partialText;
    closed = true;
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    try {
      await audioCtx.close();
    } catch {
      /* ignore */
    }
    if (ws.readyState === WebSocket.OPEN && started) {
      try {
        command("StopTranscription");
      } catch {
        /* ignore */
      }
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, 600);
        ws.addEventListener(
          "close",
          () => {
            window.clearTimeout(t);
            resolve();
          },
          { once: true }
        );
        try {
          ws.close();
        } catch {
          window.clearTimeout(t);
          resolve();
        }
      });
    } else {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    return (finalText || partialText).trim();
  };

  return { stop };
}
