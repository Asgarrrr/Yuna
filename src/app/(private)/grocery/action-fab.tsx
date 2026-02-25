"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Camera, Check, Loader2, Plus, ScanBarcode } from "lucide-react";
import { useMemo, useReducer, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { streamingReceiptSchema } from "@/lib/grocery/receipt-schema";
import { cn, pluralize } from "@/lib/utils";
import { commitReceiptItems } from "./actions";
import { BarcodeScannerDrawer } from "./barcode-scanner";

type ActionFabState = {
  isOpen: boolean;
  scannerOpen: boolean;
  receiptDrawerOpen: boolean;
  commitMessage: string | null;
  isCommitting: boolean;
};

type ActionFabAction =
  | { type: "toggle_menu" }
  | { type: "close_menu" }
  | { type: "set_scanner_open"; open: boolean }
  | { type: "set_receipt_open"; open: boolean }
  | { type: "set_commit_message"; message: string | null }
  | { type: "set_committing"; value: boolean };

const initialState: ActionFabState = {
  isOpen: false,
  scannerOpen: false,
  receiptDrawerOpen: false,
  commitMessage: null,
  isCommitting: false,
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
    case "set_receipt_open":
      return { ...state, receiptDrawerOpen: action.open };
    case "set_commit_message":
      return { ...state, commitMessage: action.message };
    case "set_committing":
      return { ...state, isCommitting: action.value };
    default:
      return state;
  }
}

export function ActionFAB() {
  const [state, dispatch] = useReducer(actionFabReducer, initialState);
  const {
    isOpen,
    scannerOpen,
    receiptDrawerOpen,
    commitMessage,
    isCommitting,
  } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  const { object, isLoading, submit, stop, error } = useObject({
    api: "/api/grocery/parse-receipt",
    schema: streamingReceiptSchema,
  });

  const isProcessing = isLoading || isCommitting;
  const streamedItems = object?.items ?? [];
  const storeName = object?.storeName;
  const streamDone = !isLoading && streamedItems.length > 0;

  // Compute stable keys for streamed items (avoids mutable Map during render)
  const streamedItemKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return streamedItems.map((item) => {
      const baseKey = [
        item?.humanName ?? "",
        item?.category ?? "",
        String(item?.quantity ?? ""),
        item?.unit ?? "",
        String(item?.totalPrice ?? ""),
        String(item?.unitPrice ?? ""),
      ].join("|");
      const occurrence = (counts.get(baseKey) ?? 0) + 1;
      counts.set(baseKey, occurrence);
      return `${baseKey}|${occurrence}`;
    });
  }, [streamedItems]);

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

      dispatch({ type: "set_receipt_open", open: true });
      submit({ base64Data: base64, mediaType });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCommit() {
    if (!streamedItems.length) return;
    dispatch({ type: "set_committing", value: true });

    try {
      const items = streamedItems
        .filter(
          (
            item,
          ): item is NonNullable<typeof item> & {
            humanName: string;
            category: string;
            quantity: number;
            unit: string;
          } =>
            !!item?.humanName &&
            !!item?.category &&
            item?.quantity != null &&
            !!item?.unit,
        )
        .map((item) => ({
          humanName: item.humanName,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice ?? null,
          totalPrice: item.totalPrice ?? null,
        }));

      const result = await commitReceiptItems(items, storeName ?? null);
      dispatch({
        type: "set_commit_message",
        message: `${pluralize(result.count, "produit")} ajouté${result.count > 1 ? "s" : ""} au stock`,
      });
      setTimeout(() => {
        dispatch({ type: "set_receipt_open", open: false });
        dispatch({ type: "set_commit_message", message: null });
      }, 2000);
    } catch {
      dispatch({
        type: "set_commit_message",
        message: "Erreur lors de la confirmation",
      });
      setTimeout(
        () => dispatch({ type: "set_commit_message", message: null }),
        3000,
      );
    } finally {
      dispatch({ type: "set_committing", value: false });
    }
  }

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
          title="Scanner un code-barres"
        >
          <ScanBarcode className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleReceiptClick}
          className="flex size-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Scanner un ticket de caisse"
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
        title="Actions"
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

      {/* Receipt streaming drawer */}
      <Drawer
        open={receiptDrawerOpen}
        onOpenChange={(open) => {
          if (!open && isLoading) stop();
          dispatch({ type: "set_receipt_open", open });
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {commitMessage
                ? commitMessage
                : isLoading && streamedItems.length === 0
                  ? "Lecture du ticket..."
                  : isLoading
                    ? `Extraction en cours... (${streamedItems.length} produits)`
                    : `${pluralize(streamedItems.length, "produit")} trouvé${streamedItems.length > 1 ? "s" : ""}`}
            </DrawerTitle>
            <DrawerDescription>
              {storeName && `${storeName}`}
              {!storeName &&
                isLoading &&
                streamedItems.length === 0 &&
                "Analyse de l'image..."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-4 pb-2">
            {streamedItems.length === 0 && isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                Erreur lors de l'analyse du ticket
              </div>
            )}

            {streamedItems.map((item, index) => (
              <div
                key={streamedItemKeys[index]}
                className="flex animate-in items-center justify-between rounded-md px-2 py-1.5 text-sm fade-in slide-in-from-bottom-2"
              >
                <span className="truncate font-medium">
                  {item?.humanName ?? "..."}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item?.totalPrice != null
                    ? `${item.totalPrice.toFixed(2)} €`
                    : item?.unitPrice != null
                      ? `${item.unitPrice.toFixed(2)} €`
                      : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t p-4">
            {commitMessage ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                <Check className="size-4" />
                {commitMessage}
              </div>
            ) : (
              <Button
                onClick={handleCommit}
                disabled={!streamDone || isCommitting}
                className="w-full gap-2"
              >
                {isCommitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Confirmer ({pluralize(streamedItems.length, "article")})
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
