"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ScannerState = "idle" | "starting" | "scanning" | "error";

interface UseBarcodeScanner {
  state: ScannerState;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startScanning: () => void;
  stopScanning: () => void;
}

export function useBarcodeScanner(
  onDetected: (barcode: string) => void,
): UseBarcodeScanner {
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const html5QrRef = useRef<{ Html5Qrcode: any } | null>(null);
  const html5InstanceRef = useRef<any>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (html5InstanceRef.current) {
      html5InstanceRef.current.stop().catch(() => {});
      html5InstanceRef.current.clear();
      html5InstanceRef.current = null;
    }
    detectorRef.current = null;
  }, []);

  const stopScanning = useCallback(() => {
    cleanup();
    setState("idle");
    setError(null);
  }, [cleanup]);

  const startScanning = useCallback(async () => {
    cleanup();
    setState("starting");
    setError(null);

    const hasNativeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

    try {
      if (hasNativeDetector) {
        // ── Native BarcodeDetector path ──
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detectorRef.current = new window.BarcodeDetector!({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
        });

        setState("scanning");

        const scan = async () => {
          if (!videoRef.current || !detectorRef.current) return;
          try {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (barcodes.length > 0) {
              onDetectedRef.current(barcodes[0].rawValue);
              return; // Stop scanning after detection
            }
          } catch {
            // Detection failed for this frame, continue
          }
          rafRef.current = requestAnimationFrame(scan);
        };

        rafRef.current = requestAnimationFrame(scan);
      } else {
        // ── html5-qrcode fallback ──
        const mod = html5QrRef.current ?? (await import("html5-qrcode"));
        html5QrRef.current = mod;

        // Create a temporary container for html5-qrcode
        const containerId = "barcode-scanner-container";
        let container = document.getElementById(containerId);
        if (!container) {
          container = document.createElement("div");
          container.id = containerId;
          container.style.display = "none";
          document.body.appendChild(container);
        }

        const html5Qr = new mod.Html5Qrcode(containerId);
        html5InstanceRef.current = html5Qr;

        setState("scanning");

        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            onDetectedRef.current(decodedText);
          },
          () => {
            // Ignore scan failures
          },
        );

        // Move the video element created by html5-qrcode into our video ref
        // This is needed for displaying the camera preview in our custom UI
        const html5Video = container.querySelector("video");
        if (html5Video && videoRef.current) {
          videoRef.current.srcObject = html5Video.srcObject;
          videoRef.current.play().catch(() => {});
        }
      }
    } catch (err) {
      cleanup();
      setState("error");
      const message =
        err instanceof Error ? err.message : "Impossible d'accéder à la caméra";
      setError(
        message.includes("NotAllowed") || message.includes("Permission")
          ? "Accès à la caméra refusé. Autorisez l'accès dans les paramètres."
          : message,
      );
    }
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { state, error, videoRef, startScanning, stopScanning };
}
