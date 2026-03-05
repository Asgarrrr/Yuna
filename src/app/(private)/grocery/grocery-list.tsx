"use client";

import { Camera, Mic, MicOff, Plus, ScanBarcode, Send, ShoppingCart, Trash2 } from "lucide-react";
import {
  useCallback,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeechInput } from "@/hooks/use-speech-input";
import type { ListItem, Suggestion } from "@/lib/grocery/types";
import { ListItemRow } from "./list-item-row";
import { pluralize } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addItemsWithAI,
  addSuggestionToList,
  clearCheckedItems,
  removeItem,
  toggleItem,
  updateItemQuantity,
} from "./actions";

type InputState = {
  text: string;
  isAdding: boolean;
  isListening: boolean;
  error: string | null;
  message: string | null;
};

type InputAction =
  | { type: "SET_TEXT"; text: string }
  | { type: "START_ADDING" }
  | { type: "DONE_ADDING"; message?: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "START_LISTENING" }
  | { type: "STOP_LISTENING" }
  | { type: "CLEAR" };

function inputReducer(state: InputState, action: InputAction): InputState {
  switch (action.type) {
    case "SET_TEXT":
      return { ...state, text: action.text };
    case "START_ADDING":
      return { ...state, text: "", error: null, message: null, isAdding: true };
    case "DONE_ADDING":
      return { ...state, isAdding: false, message: action.message ?? null };
    case "SET_ERROR":
      return { ...state, isAdding: false, message: null, error: action.error };
    case "START_LISTENING":
      return { ...state, text: "", isListening: true };
    case "STOP_LISTENING":
      return { ...state, isListening: false };
    case "CLEAR":
      return { ...state, text: "", error: null };
    default:
      return state;
  }
}

export function GroceryList({
  initialItems,
  suggestions: initialSuggestions,
}: {
  initialItems: ListItem[];
  suggestions: Suggestion[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [optimisticItems, setOptimisticItems] = useOptimistic(initialItems);
  const [inputState, dispatch] = useReducer(inputReducer, {
    text: "",
    isAdding: false,
    isListening: false,
    error: null,
    message: null,
  });
  const [suggestions, setOptimisticSuggestions] =
    useOptimistic(initialSuggestions);

  const unchecked: ListItem[] = [];
  const checked: ListItem[] = [];
  for (const item of optimisticItems) {
    (item.checked ? checked : unchecked).push(item);
  }

  const submitText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    dispatch({ type: "START_ADDING" });
    try {
      const result = await addItemsWithAI(text.trim());
      if ("error" in result) {
        dispatch({
          type: "SET_ERROR",
          error: "Impossible d'ajouter les articles. Réessaie.",
        });
        return;
      }
      dispatch({ type: "DONE_ADDING", message: result.message });
    } catch {
      dispatch({
        type: "SET_ERROR",
        error: "Impossible d'ajouter les articles. Réessaie.",
      });
    }
    inputRef.current?.focus();
  }, []);

  const { hasSpeechSupport, toggleListening } = useSpeechInput({
    onTranscript: (text) => dispatch({ type: "SET_TEXT", text }),
    onListeningChange: (listening) =>
      dispatch({ type: listening ? "START_LISTENING" : "STOP_LISTENING" }),
    onFinalTranscript: submitText,
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await submitText(inputState.text);
  }

  function handleToggle(item: ListItem) {
    startTransition(async () => {
      setOptimisticItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
      );
      await toggleItem(item.id);
    });
  }

  function handleQuantity(item: ListItem, delta: number) {
    const newQty = item.quantity + delta;
    if (newQty < 1) return;

    startTransition(async () => {
      setOptimisticItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i)),
      );
      await updateItemQuantity(item.id, newQty);
    });
  }

  function handleRemove(item: ListItem) {
    startTransition(async () => {
      setOptimisticItems((prev) => prev.filter((i) => i.id !== item.id));
      await removeItem(item.id);
    });
  }

  function handleAddSuggestion(s: Suggestion) {
    startTransition(async () => {
      setOptimisticSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      await addSuggestionToList(s.id);
    });
  }

  function handleClearChecked() {
    startTransition(async () => {
      setOptimisticItems((prev) => prev.filter((i) => !i.checked));
      await clearCheckedItems();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          ref={inputRef}
          value={inputState.text}
          onChange={(e) => dispatch({ type: "SET_TEXT", text: e.target.value })}
          placeholder={
            inputState.isListening
              ? "Je t'écoute..."
              : "Ajouter des articles..."
          }
          disabled={inputState.isAdding}
          className="flex-1"
        />
        {hasSpeechSupport && (
          <Button
            type="button"
            size="icon"
            variant={inputState.isListening ? "default" : "outline"}
            onClick={toggleListening}
            disabled={inputState.isAdding}
            aria-label={inputState.isListening ? "Arrêter l'écoute" : "Dicter"}
          >
            {inputState.isListening ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>
        )}
        <Button
          type="submit"
          size="icon"
          disabled={inputState.isAdding || !inputState.text.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>

      {inputState.isAdding && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
          <span className="inline-block size-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
          L'assistant analyse ta demande...
        </div>
      )}

      {inputState.message && (
        <p className="text-sm text-muted-foreground">{inputState.message}</p>
      )}

      {inputState.error && (
        <p className="text-sm text-destructive">{inputState.error}</p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              size="sm"
              onClick={() => handleAddSuggestion(s)}
              className="h-7 gap-1 text-xs"
            >
              <Plus className="size-3" />
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {unchecked.length === 0 &&
        checked.length === 0 &&
        !inputState.isAdding && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <ShoppingCart className="size-10 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Ta liste est vide</p>
              <p className="text-sm text-muted-foreground">
                Dis-moi ce qu'il te faut !
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Send className="size-3" /> Texte
              </span>
              <span className="flex items-center gap-1">
                <Mic className="size-3" /> Voix
              </span>
              <span className="flex items-center gap-1">
                <ScanBarcode className="size-3" /> Code-barres
              </span>
              <span className="flex items-center gap-1">
                <Camera className="size-3" /> Ticket
              </span>
            </div>
          </div>
        )}

      {unchecked.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unchecked.map((item) => (
            <ListItemRow
              key={item.id}
              item={item}
              onToggle={() => handleToggle(item)}
              onQuantity={(d) => handleQuantity(item, d)}
              onRemove={() => handleRemove(item)}
            />
          ))}
        </ul>
      )}

      {checked.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {pluralize(checked.length, "article")} coché
              {checked.length > 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearDialog(true)}
              disabled={isPending}
            >
              <Trash2 className="mr-1 size-3" />
              Vider
            </Button>
          </div>
          <ul className="flex flex-col gap-1 opacity-50">
            {checked.map((item) => (
              <ListItemRow
                key={item.id}
                item={item}
                onToggle={() => handleToggle(item)}
                onQuantity={(d) => handleQuantity(item, d)}
                onRemove={() => handleRemove(item)}
              />
            ))}
          </ul>
        </div>
      )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer les articles cochés ?</DialogTitle>
            <DialogDescription>
              {checked.length} {checked.length > 1 ? "articles cochés seront supprimés" : "article coché sera supprimé"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setShowClearDialog(false);
                handleClearChecked();
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
