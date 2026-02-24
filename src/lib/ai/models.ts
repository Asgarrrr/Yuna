import { devToolsMiddleware } from "@ai-sdk/devtools";
import { openai } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";

function wrapForDev(model: ReturnType<typeof openai>) {
  if (process.env.NODE_ENV === "development") {
    return wrapLanguageModel({ model, middleware: devToolsMiddleware() });
  }
  return model;
}

/** GPT-4o-mini — fast & cheap, good for text tasks */
export const chatModel = wrapForDev(openai("gpt-4o-mini"));

/** GPT-4o — vision-capable, used for receipt OCR */
export const visionModel = wrapForDev(openai("gpt-4o"));
