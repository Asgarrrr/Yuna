"use client";

import { AlertCircle, Check, Loader2, Package, ShoppingCart } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { addBarcodeToStock, lookupBarcode } from "./actions";

type ScanPhase = "scanning" | "found" | "adding" | "done";

interface LookupResult {
  barcode: string;
  productName: string | null;
  brand: string | null;
  genericName: string | null;
  nutriscoreGrade: string | null;
  imageSmallUrl: string | null;
  existingProductId: string | null;
}

const nutriscoreColors: Record<string, string> = {
  a: "bg-green-600",
  b: "bg-lime-500",
  c: "bg-yellow-400",
  d: "bg-orange-500",
  e: "bg-red-600",
};

export function BarcodeScannerDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<ScanPhase>("scanning");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const handleDetected = useCallback(
    (barcode: string) => {
      stopRef.current();
      setPhase("found");

      startTransition(async () => {
        try {
          const result = await lookupBarcode(barcode);
          setLookupResult(result);
        } catch {
          setLookupResult({
            barcode,
            productName: null,
            brand: null,
            genericName: null,
            nutriscoreGrade: null,
            imageSmallUrl: null,
            existingProductId: null,
          });
        }
      });
    },
    [],
  );

  const { state, error, videoRef, startScanning, stopScanning } =
    useBarcodeScanner(handleDetected);

  // Keep the ref in sync so handleDetected can call stopScanning without circular deps
  stopRef.current = stopScanning;

  useEffect(() => {
    if (open) {
      setPhase("scanning");
      setLookupResult(null);
      setMessage(null);
      startScanning();
    } else {
      stopScanning();
    }
  }, [open, startScanning, stopScanning]);

  function handleAddToStock() {
    if (!lookupResult) return;
    setPhase("adding");

    startTransition(async () => {
      try {
        await addBarcodeToStock({
          barcode: lookupResult.barcode,
          productName: lookupResult.productName,
          brand: lookupResult.brand,
          genericName: lookupResult.genericName,
          nutriscoreGrade: lookupResult.nutriscoreGrade,
          imageSmallUrl: lookupResult.imageSmallUrl,
          existingProductId: lookupResult.existingProductId,
          target: "stock",
        });
        setPhase("done");
        setMessage("Ajouté au stock");
        setTimeout(() => onOpenChange(false), 1200);
      } catch {
        setMessage("Erreur lors de l'ajout");
        setPhase("found");
      }
    });
  }

  function handleAddToList() {
    if (!lookupResult) return;
    setPhase("adding");

    startTransition(async () => {
      try {
        await addBarcodeToStock({
          barcode: lookupResult.barcode,
          productName: lookupResult.productName,
          brand: lookupResult.brand,
          genericName: lookupResult.genericName,
          nutriscoreGrade: lookupResult.nutriscoreGrade,
          imageSmallUrl: lookupResult.imageSmallUrl,
          existingProductId: lookupResult.existingProductId,
          target: "list",
        });
        setPhase("done");
        setMessage("Ajouté à la liste");
        setTimeout(() => onOpenChange(false), 1200);
      } catch {
        setMessage("Erreur lors de l'ajout");
        setPhase("found");
      }
    });
  }

  function handleRescan() {
    setPhase("scanning");
    setLookupResult(null);
    setMessage(null);
    startScanning();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Scanner un code-barres</DrawerTitle>
          <DrawerDescription>
            {phase === "scanning" && "Placez le code-barres devant la caméra"}
            {phase === "found" && (lookupResult ? "Produit détecté" : "Recherche...")}
            {phase === "adding" && "Ajout en cours..."}
            {phase === "done" && message}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Camera / scan area */}
          {phase === "scanning" && (
            <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {/* Scan overlay */}
              {state === "scanning" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-16 w-48 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]" />
                </div>
              )}
              {state === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-white" />
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

          {/* Product preview */}
          {(phase === "found" || phase === "adding" || phase === "done") && (
            <div className="flex flex-col gap-3">
              {isPending && !lookupResult && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {lookupResult && (
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  {lookupResult.imageSmallUrl ? (
                    <Image
                      src={lookupResult.imageSmallUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="size-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Package className="size-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {lookupResult.productName ?? "Produit inconnu"}
                    </span>
                    {lookupResult.brand && (
                      <span className="text-xs text-muted-foreground">
                        {lookupResult.brand}
                      </span>
                    )}
                    {lookupResult.genericName && (
                      <span className="text-xs text-muted-foreground">
                        {lookupResult.genericName}
                      </span>
                    )}
                    {lookupResult.nutriscoreGrade && (
                      <div className="mt-1 flex gap-0.5">
                        {(["a", "b", "c", "d", "e"] as const).map((grade) => (
                          <span
                            key={grade}
                            className={cn(
                              "flex size-5 items-center justify-center rounded text-[9px] font-bold",
                              grade === lookupResult.nutriscoreGrade
                                ? `${nutriscoreColors[grade]} text-white scale-110`
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {grade.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {lookupResult.barcode}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              {phase === "found" && lookupResult && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleAddToStock}
                    disabled={isPending}
                  >
                    <Package className="size-4" />
                    Ajouter au stock
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleAddToList}
                    disabled={isPending}
                  >
                    <ShoppingCart className="size-4" />
                    Ajouter à la liste
                  </Button>
                </div>
              )}

              {phase === "adding" && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {phase === "done" && (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-green-600">
                  <Check className="size-4" />
                  {message}
                </div>
              )}

              {(phase === "found" || phase === "done") && (
                <Button variant="ghost" size="sm" onClick={handleRescan}>
                  Scanner un autre produit
                </Button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
