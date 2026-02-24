"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScannerState = "idle" | "starting" | "scanning" | "paused" | "error";

interface UseBarcodeScanner {
  state: ScannerState;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startScanning: () => void;
  stopScanning: () => void;
  pauseScanning: () => void;
  resumeScanning: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

// ─── Pure helpers ────────────────────────────────────────────────────────────

function releaseMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function classifyCameraError(message: string): string {
  if (message.includes("NotAllowed") || message.includes("Permission")) {
    return "Accès à la caméra refusé. Autorisez l'accès dans les paramètres.";
  }
  if (message.includes("NotFound") || message.includes("DevicesNotFound")) {
    return "Aucune caméra détectée.";
  }
  if (message.includes("NotReadable") || message.includes("TrackStartError")) {
    return "La caméra est utilisée par une autre application.";
  }
  return message;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBarcodeScanner(
  onDetected: (barcode: string) => void,
): UseBarcodeScanner {
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  // Resources (survive pause/resume)
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<
    typeof import("barcode-detector").BarcodeDetector
  > | null>(null);

  // Loop control (reset on each pause/resume)
  const rafRef = useRef(0);
  const loopAbortRef = useRef<AbortController | null>(null);

  // Init lifecycle
  const initAbortRef = useRef<AbortController | null>(null);

  // Duplicate guard — skip same barcode still in front of camera
  const lastDetectedRef = useRef<string | null>(null);
  const lastDetectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── pauseLoop: stop rAF + abort loop controller ─────────────────────────

  const pauseLoop = useCallback(() => {
    loopAbortRef.current?.abort();
    loopAbortRef.current = null;

    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // ── teardown: pauseLoop + release stream + null detector ────────────────

  const teardown = useCallback(() => {
    initAbortRef.current?.abort();
    initAbortRef.current = null;

    pauseLoop();

    if (streamRef.current) {
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
    }

    detectorRef.current = null;

    // Clear duplicate guard
    lastDetectedRef.current = null;
    if (lastDetectedTimerRef.current) {
      clearTimeout(lastDetectedTimerRef.current);
      lastDetectedTimerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [pauseLoop]);

  // ── startDetectionLoop: launches the rAF detect loop ────────────────────

  const startDetectionLoop = useCallback(() => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (!detector || !video) return;

    const controller = new AbortController();
    loopAbortRef.current = controller;
    const { signal } = controller;

    const scan = async (): Promise<void> => {
      if (signal.aborted) return;

      try {
        const barcodes = await detector.detect(video);
        if (signal.aborted) return;

        const first = barcodes[0];
        if (first?.rawValue) {
          // Skip duplicate: same barcode still in front of camera → keep scanning
          if (lastDetectedRef.current === first.rawValue) {
            // fall through to schedule next frame
          } else {
            // New barcode — record it, auto-pause, notify consumer
            lastDetectedRef.current = first.rawValue;
            if (lastDetectedTimerRef.current)
              clearTimeout(lastDetectedTimerRef.current);
            lastDetectedTimerRef.current = setTimeout(() => {
              lastDetectedRef.current = null;
            }, 3000);

            pauseLoop();
            setState("paused");
            onDetectedRef.current(first.rawValue);
            return;
          }
        }
      } catch {
        // Detection failed for this frame — continue
      }

      if (!signal.aborted) {
        rafRef.current = requestAnimationFrame(() => void scan());
      }
    };

    rafRef.current = requestAnimationFrame(() => void scan());
  }, [pauseLoop]);

  // ── Public: stopScanning — full teardown ─────────────────────────────────

  const stopScanning = useCallback(() => {
    teardown();
    setState("idle");
    setError(null);
  }, [teardown]);

  // ── Public: pauseScanning — stop loop, keep resources ────────────────────

  const pauseScanning = useCallback(() => {
    pauseLoop();
    setState("paused");
  }, [pauseLoop]);

  // ── Public: startScanning — full init ────────────────────────────────────

  const startScanning = useCallback(async () => {
    teardown();
    setState("starting");
    setError(null);

    const controller = new AbortController();
    initAbortRef.current = controller;
    const { signal } = controller;

    try {
      // 1. Acquire camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (signal.aborted) {
        releaseMediaStream(stream);
        return;
      }

      streamRef.current = stream;

      // Listen for track ended (browser reclaims camera)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener(
          "ended",
          () => {
            if (streamRef.current === stream) {
              pauseLoop();
              streamRef.current = null;
              detectorRef.current = null;
              if (videoRef.current) videoRef.current.srcObject = null;
              setState("error");
              setError("La caméra a été interrompue. Réessayez.");
            }
          },
          { once: true },
        );
      }

      // 2. Bind stream to video element
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element not available");
      }

      video.srcObject = stream;
      await video.play();

      if (signal.aborted) return;

      // 3. Initialize detector (dynamic import — SSR-safe, lazy WASM load)
      const { BarcodeDetector } = await import("barcode-detector");

      if (signal.aborted) return;

      const detector = new BarcodeDetector({
        formats: [...BARCODE_FORMATS],
      });

      detectorRef.current = detector;

      setState("scanning");

      // 4. Start detection loop
      startDetectionLoop();
    } catch (err: unknown) {
      if (signal.aborted) return;

      teardown();
      setState("error");

      const raw =
        err instanceof Error ? err.message : "Impossible d'accéder à la caméra";

      setError(classifyCameraError(raw));
    }
  }, [teardown, startDetectionLoop, pauseLoop]);

  // ── Public: resumeScanning — reuse existing resources ────────────────────

  const resumeScanning = useCallback(() => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    const stream = streamRef.current;

    // Check if resources are still alive
    if (!detector || !video || !stream) {
      // Resources lost — fallback to full init
      void startScanning();
      return;
    }

    // Check tracks aren't ended (browser reclaimed camera)
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0 || tracks[0].readyState === "ended") {
      // Stream dead — full re-init
      void startScanning();
      return;
    }

    setState("scanning");
    startDetectionLoop();
  }, [startScanning, startDetectionLoop]);

  // ── Unmount safety net ─────────────────────────────────────────────────

  useEffect(() => teardown, [teardown]);

  return {
    state,
    error,
    videoRef,
    startScanning,
    stopScanning,
    pauseScanning,
    resumeScanning,
  };
}
