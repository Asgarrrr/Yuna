import { useCallback, useRef, useSyncExternalStore } from "react";

function subscribeSpeech() {
  return () => {};
}

function getHasSpeechSupport() {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

type SpeechInputOptions = {
  lang?: string;
  onTranscript: (text: string) => void;
  onListeningChange: (isListening: boolean) => void;
  onFinalTranscript: (text: string) => void;
};

export function useSpeechInput({
  lang = "fr-FR",
  onTranscript,
  onListeningChange,
  onFinalTranscript,
}: SpeechInputOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);

  const hasSpeechSupport = useSyncExternalStore(
    subscribeSpeech,
    getHasSpeechSupport,
    () => false,
  );

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      recognitionRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim = transcript;
        }
      }
      onTranscript(finalTranscript + interim);
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      onListeningChange(false);
      if (finalTranscript.trim()) {
        onFinalTranscript(finalTranscript);
      }
    };

    recognition.onerror = () => {
      isListeningRef.current = false;
      onListeningChange(false);
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    recognition.start();
    onListeningChange(true);
  }, [lang, onTranscript, onListeningChange, onFinalTranscript]);

  return { hasSpeechSupport, toggleListening };
}
