"use client";

import { Check, Mic, MicOff, Minus, Plus, Send, Trash2, X } from "lucide-react";
import {
  useCallback,
  useOptimistic,
  useReducer,
  useRef,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralize } from "@/lib/utils";
import {
  addItemsWithAI,
  clearCheckedItems,
  removeItem,
  toggleItem,
  updateItemQuantity,
} from "./_actions";

type ListItem = {
  id: string;
  customName: string | null;
  quantity: number;
  unit: string;
  checked: boolean;
  productName: string | null;
  productIcon: string | null;
};

type InputState = {
  text: string;
  isAdding: boolean;
  isListening: boolean;
  error: string | null;
};

type InputAction =
  | { type: "SET_TEXT"; text: string }
  | { type: "START_ADDING" }
  | { type: "DONE_ADDING" }
  | { type: "SET_ERROR"; error: string }
  | { type: "START_LISTENING" }
  | { type: "STOP_LISTENING" }
  | { type: "CLEAR" };

function inputReducer(state: InputState, action: InputAction): InputState {
  switch (action.type) {
    case "SET_TEXT":
      return { ...state, text: action.text };
    case "START_ADDING":
      return { ...state, text: "", error: null, isAdding: true };
    case "DONE_ADDING":
      return { ...state, isAdding: false };
    case "SET_ERROR":
      return { ...state, isAdding: false, error: action.error };
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

function subscribeSpeech() {
  return () => {};
}

function getHasSpeechSupport() {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function GroceryList({ initialItems }: { initialItems: ListItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticItems, setOptimisticItems] = useOptimistic(initialItems);
  const [inputState, dispatch] = useReducer(inputReducer, {
    text: "",
    isAdding: false,
    isListening: false,
    error: null,
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const hasSpeechSupport = useSyncExternalStore(
    subscribeSpeech,
    getHasSpeechSupport,
    () => false,
  );

  const unchecked: ListItem[] = [];
  const checked: ListItem[] = [];
  for (const item of optimisticItems) {
    (item.checked ? checked : unchecked).push(item);
  }

  const submitText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    dispatch({ type: "START_ADDING" });
    try {
      await addItemsWithAI(text.trim());
    } catch {
      dispatch({
        type: "SET_ERROR",
        error: "Impossible d'ajouter les articles. Réessaie.",
      });
      return;
    }
    dispatch({ type: "DONE_ADDING" });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await submitText(inputState.text);
  }

  function toggleListening() {
    if (inputState.isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "fr-FR";
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
      dispatch({ type: "SET_TEXT", text: finalTranscript + interim });
    };

    recognition.onend = () => {
      dispatch({ type: "STOP_LISTENING" });
      if (finalTranscript.trim()) {
        submitText(finalTranscript);
      }
    };

    recognition.onerror = () => {
      dispatch({ type: "STOP_LISTENING" });
    };

    recognitionRef.current = recognition;
    recognition.start();
    dispatch({ type: "START_LISTENING" });
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
        <p className="text-sm text-muted-foreground animate-pulse">
          Ajout en cours...
        </p>
      )}

      {inputState.error && (
        <p className="text-sm text-destructive">{inputState.error}</p>
      )}

      {unchecked.length === 0 &&
        checked.length === 0 &&
        !inputState.isAdding && (
          <p className="py-12 text-center text-muted-foreground">
            Ta liste est vide. Dis-moi ce qu'il te faut !
          </p>
        )}

      {unchecked.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unchecked.map((item) => (
            <ItemRow
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
              onClick={handleClearChecked}
              disabled={isPending}
            >
              <Trash2 className="mr-1 size-3" />
              Vider
            </Button>
          </div>
          <ul className="flex flex-col gap-1 opacity-50">
            {checked.map((item) => (
              <ItemRow
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
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onQuantity,
  onRemove,
}: {
  item: ListItem;
  onToggle: () => void;
  onQuantity: (delta: number) => void;
  onRemove: () => void;
}) {
  const name = item.productName ?? item.customName ?? "???";

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={onToggle}
        className="flex size-5 shrink-0 items-center justify-center rounded border border-border transition-colors hover:border-foreground"
        aria-label={item.checked ? "Décocher" : "Cocher"}
      >
        {item.checked && <Check className="size-3" />}
      </button>

      <span className={`flex-1 text-sm ${item.checked ? "line-through" : ""}`}>
        {name}
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onQuantity(-1)}
          disabled={item.quantity <= 1}
          className="opacity-0 group-hover:opacity-100"
        >
          <Minus className="size-3" />
        </Button>
        <span className="min-w-6 text-center text-xs tabular-nums">
          {item.quantity}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onQuantity(1)}
          className="opacity-0 group-hover:opacity-100"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100"
      >
        <X className="size-3" />
      </Button>
    </li>
  );
}
