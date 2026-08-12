export type VoiceInputOptions = {
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike;
  0: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  [index: number]: SpeechRecognitionResultLike;
  0: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error?: unknown;
  message?: string;
}

export interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

export function mergeTranscript(
  currentInput: string,
  recognizedText: string,
  isManuallyEdited = false
): string {
  if (isManuallyEdited) {
    if (!currentInput) {
      return recognizedText;
    }
    // Preserves manual edits and appends incoming transcript instead of silently overwriting.
    return `${currentInput} ${recognizedText}`.trim();
  }
  return recognizedText;
}

export function startListening(
  onTranscript: (text: string) => void,
  options?: VoiceInputOptions
): { stop: () => void } {
  if (typeof window === "undefined") {
    return { stop: () => {} };
  }

  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

  const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    return { stop: () => {} };
  }

  const recognition = new SpeechRecognitionClass();
  let isActive = true;

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    if (!isActive) return;
    if (event.results && event.results[0] && event.results[0][0]) {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        onTranscript(transcript);
      }
    }
  };

  recognition.onend = () => {
    if (!isActive) return;
    if (options?.onEnd) {
      options.onEnd();
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
    if (!isActive) return;
    if (options?.onError) {
      options.onError(event);
    }
    if (options?.onEnd) {
      options.onEnd();
    }
  };

  recognition.start();

  return {
    stop: () => {
      isActive = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      if (recognition && typeof recognition.stop === "function") {
        recognition.stop();
      }
    },
  };
}
