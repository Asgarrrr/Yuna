"use client";

import { AlertCircle, Loader2, Package, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { addBarcodeToStock, lookupBarcode } from "./actions";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LookupResult {
  barcode: string;
  productName: string | null;
  brand: string | null;
  genericName: string | null;
  nutriscoreGrade: string | null;
  imageSmallUrl: string | null;
  existingProductId: string | null;
}

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  imageSmallUrl: string | null;
  lookup: LookupResult;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FLASH_DURATION = 600;

// ─── Component ───────────────────────────────────────────────────────────────

export function BarcodeScannerDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Track in-flight lookups to show a small counter
  const [pendingLookups, setPendingLookups] = useState(0);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDetected = useCallback((barcode: string) => {
    // Brief visual flash — then hook auto-resumes via the consumer below
    setFlash(true);

    // Lookup product in background, don't block scanning
    setPendingLookups((n) => n + 1);
    lookupBarcode(barcode)
      .then((result) => {
        setItems((prev) => {
          // Avoid adding exact same barcode twice
          if (prev.some((item) => item.barcode === barcode)) return prev;
          return [
            ...prev,
            {
              barcode,
              name: result.productName ?? `Produit ${barcode}`,
              brand: result.brand,
              imageSmallUrl: result.imageSmallUrl,
              lookup: result,
            },
          ];
        });
      })
      .catch(() => {
        setItems((prev) => {
          if (prev.some((item) => item.barcode === barcode)) return prev;
          return [
            ...prev,
            {
              barcode,
              name: `Produit ${barcode}`,
              brand: null,
              imageSmallUrl: null,
              lookup: {
                barcode,
                productName: null,
                brand: null,
                genericName: null,
                nutriscoreGrade: null,
                imageSmallUrl: null,
                existingProductId: null,
              },
            },
          ];
        });
      })
      .finally(() => {
        setPendingLookups((n) => Math.max(0, n - 1));
      });
  }, []);

  const {
    state,
    error,
    videoRef,
    startScanning,
    stopScanning,
    resumeScanning,
  } = useBarcodeScanner(handleDetected);

  // Flash: show ✓ briefly then auto-resume scanning
  useEffect(() => {
    if (!flash) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlash(false);
      resumeScanning();
    }, FLASH_DURATION);
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [flash, resumeScanning]);

  // Open/close lifecycle
  useEffect(() => {
    if (open) {
      setItems([]);
      setFlash(false);
      setSaving(false);
      setPendingLookups(0);
      startScanning();
    } else {
      stopScanning();
    }
  }, [open, startScanning, stopScanning]);

  function handleRemoveItem(barcode: string) {
    setItems((prev) => prev.filter((item) => item.barcode !== barcode));
  }

  function handleFinish(target: "stock" | "list") {
    if (items.length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    stopScanning();

    startTransition(async () => {
      try {
        await Promise.all(
          items.map((item) =>
            addBarcodeToStock({
              ...item.lookup,
              target,
            }),
          ),
        );
        onOpenChange(false);
      } catch {
        setSaving(false);
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Scanner des produits</DrawerTitle>
          <DrawerDescription>
            {items.length === 0
              ? "Scannez vos produits un par un"
              : `${items.length} produit${items.length > 1 ? "s" : ""} scanné${items.length > 1 ? "s" : ""}`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Camera — always mounted */}
          {!saving && (
            <div
              className={`relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg bg-black ring-2 transition-all duration-300 ${flash ? "ring-white ring-offset-2 ring-offset-background" : "ring-transparent"}`}
            >
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Scan guide overlay */}
              {state === "scanning" && !flash && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-16 w-48 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]" />
                </div>
              )}

              {/* Starting spinner */}
              {state === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-white" />
                </div>
              )}

              {/* Pending lookups indicator */}
              {pendingLookups > 0 && (
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                  <Loader2 className="size-3 animate-spin" />
                  {pendingLookups}
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Scanned products list */}
          {items.length > 0 && (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.barcode}
                  className="flex animate-in slide-in-from-left-2 fade-in duration-200 items-center gap-2.5 rounded-lg border px-3 py-2"
                >
                  {item.imageSmallUrl ? (
                    <Image
                      src={item.imageSmallUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                      <Package className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {item.name}
                    </span>
                    {item.brand && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.brand}
                      </span>
                    )}
                  </div>
                  {!saving && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.barcode)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {saving ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Ajout de {items.length} produit
              {items.length > 1 ? "s" : ""}…
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => handleFinish("stock")}
                    disabled={isPending || pendingLookups > 0}
                  >
                    <Package className="size-4" />
                    Tout ajouter au stock
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => handleFinish("list")}
                    disabled={isPending || pendingLookups > 0}
                  >
                    <ShoppingCart className="size-4" />À la liste
                  </Button>
                </div>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {items.length === 0 ? "Fermer" : "Annuler"}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
