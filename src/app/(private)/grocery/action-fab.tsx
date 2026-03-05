"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Camera, Loader2, Plus, ScanBarcode } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { streamingReceiptSchema } from "@/lib/grocery/receipt-schema";
import { cn, pluralize } from "@/lib/utils";
import { BarcodeScannerDrawer } from "./barcode-scanner";
import { ReceiptReviewDrawer } from "./receipt-review";

type ActionFabState = {
  isOpen: boolean;
  scannerOpen: boolean;
  reviewOpen: boolean;
  successMessage: string | null;
};

type ActionFabAction =
  | { type: "toggle_menu" }
  | { type: "close_menu" }
  | { type: "set_scanner_open"; open: boolean }
  | { type: "set_review_open"; open: boolean }
  | { type: "set_success"; message: string | null }
  | { type: "reset" };

const initialState: ActionFabState = {
  isOpen: false,
  scannerOpen: false,
  reviewOpen: false,
  successMessage: null,
};

function actionFabReducer(
  state: ActionFabState,
  action: ActionFabAction,
): ActionFabState {
  switch (action.type) {
    case "toggle_menu":
      return { ...state, isOpen: !state.isOpen };
    case "close_menu":
      return { ...state, isOpen: false };
    case "set_scanner_open":
      return { ...state, scannerOpen: action.open };
    case "set_review_open":
      return { ...state, reviewOpen: action.open };
    case "set_success":
      return { ...state, successMessage: action.message };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

export function ActionFAB() {
  const [state, dispatch] = useReducer(actionFabReducer, initialState);
  const { isOpen, scannerOpen, reviewOpen, successMessage } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError] = useState<string | null>(null);

  const { object, isLoading, submit, stop, error } = useObject({
    api: "/api/grocery/parse-receipt",
    schema: streamingReceiptSchema,
    onError() {
      setParseError("Erreur lors de l'analyse du ticket. Réessaie.");
    },
    onFinish({ object, error: validationError }) {
      if (validationError || !object?.items?.length) {
        setParseError(
          "Aucun produit détecté sur ce ticket. Vérifie la photo et réessaie.",
        );
      }
    },
  });

  // Stop stream on unmount to avoid orphaned requests
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), []);

  const isProcessing = isLoading;

  function handleFABClick() {
    if (isProcessing) return;
    dispatch({ type: "toggle_menu" });
  }

  function handleReceiptClick() {
    dispatch({ type: "close_menu" });
    inputRef.current?.click();
  }

  function handleBarcodeClick() {
    dispatch({ type: "close_menu" });
    dispatch({ type: "set_scanner_open", open: true });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      const mediaType = file.type || "image/jpeg";

      setParseError(null);
      dispatch({ type: "set_review_open", open: true });
      submit({ base64Data: base64, mediaType });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRetry() {
    dispatch({ type: "set_review_open", open: false });
    setParseError(null);
    inputRef.current?.click();
  }

  function handleReviewOpenChange(open: boolean) {
    if (!open && isLoading) stop();
    dispatch({ type: "set_review_open", open });
  }

  function handleCommitComplete(count: number) {
    dispatch({ type: "set_review_open", open: false });
    dispatch({
      type: "set_success",
      message: `${pluralize(count, "produit")} ajouté${count > 1 ? "s" : ""} au stock`,
    });
    setTimeout(() => dispatch({ type: "reset" }), 2000);
  }

  const errorMessage = error
    ? "Erreur lors de l'analyse du ticket"
    : parseError;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Backdrop */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity"
          onClick={() => dispatch({ type: "close_menu" })}
          aria-label="Fermer le menu d'actions"
        />
      )}

      {/* Mini FABs */}
      <div
        className={cn(
          "fixed bottom-22 right-6 z-50 flex flex-col gap-3 transition-all duration-200",
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={handleBarcodeClick}
          className="flex size-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Scanner un code-barres"
        >
          <ScanBarcode className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleReceiptClick}
          className="flex size-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Scanner un ticket"
        >
          <Camera className="size-5" />
        </button>
      </div>

      {/* Main FAB */}
      <Button
        size="icon-lg"
        onClick={handleFABClick}
        disabled={isProcessing}
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Actions"
        aria-expanded={state.isOpen}
      >
        {isProcessing ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <Plus
            className={cn(
              "size-6 transition-transform duration-200",
              isOpen && "rotate-45",
            )}
          />
        )}
      </Button>

      {/* Barcode scanner drawer */}
      <BarcodeScannerDrawer
        open={scannerOpen}
        onOpenChange={(open) => dispatch({ type: "set_scanner_open", open })}
      />

      {/* Unified review drawer — handles both streaming and review */}
      <ReceiptReviewDrawer
        open={reviewOpen}
        onOpenChange={handleReviewOpenChange}
        streamedObject={object}
        isStreaming={isLoading}
        error={errorMessage}
        onRetry={handleRetry}
        onCommitComplete={handleCommitComplete}
      />

      {/* Success toast */}
      {successMessage && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
              ✓
            </span>
            {successMessage}
          </div>
        </div>
      )}
    </>
  );
}
