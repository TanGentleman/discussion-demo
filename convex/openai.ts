import { OpenAI } from "openai";
import { internalAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

import secretConfig from "./secretConfig";

const overrideBaseUrl = secretConfig.baseURL || "https://api.openai.com/v1";
const overrideModelName = secretConfig.modelName || "gpt-3.5-turbo";

// How often to update the DB to stream the response back to the client
// Recommended is 200 at scale, but leave at 1 for smooth local testing
const chunkCacheSize = 1;

// EXPERIMENTAL MAGIC COMMANDS
const experimentalMode = true;
const magicStrings = ["*RESET*", "*DEL*", "*FIX*"];

type ChatParams = {
  messages: Doc<"messages">[];
  messageId: Id<"messages">;
};
export const chat = internalAction({
  handler: async (ctx, { messages, messageId }: ChatParams) => {
    if (messages.length === 0) {
      throw new Error("No messages found!");
    }
    // WARNING: This prioritizes the secretConfig API key over the environment variable!
    const apiKey = secretConfig.apiKey || process.env.OPENAI_API_KEY;
    const baseURL = overrideBaseUrl;
    const openai = new OpenAI({ baseURL, apiKey });

    if (experimentalMode) {
      const currMessage = messages[messages.length - 1].body;
      // If the message includes a magic string, handle it
      for (const magicString of magicStrings) {
        if (currMessage.endsWith(magicString)) {
          if (magicString === "*RESET*") {
            // call internal.clearTable
            await ctx.runMutation(internal.messages.clearTable);
            return;
          }
          if (magicString === "*DEL*") {
            // call internal.deleteTable
            await ctx.runMutation(internal.messages.removeLast);
            return;
          }
          // Add more magic strings here
          if (magicString === "*FIX*") {
            // call internal.fixTable
            await ctx.runMutation(internal.messages.fixIncompletes);
            await ctx.runMutation(internal.messages.update, {
              messageId,
              body: "Fixing up any table errors!",
              complete: true
            });
            return;
          }
        throw new Error(`Magic string ${magicString} not implemented yet`);
        }
      }
    }
    try {
      const stream = await openai.chat.completions.create({
        // model: "gpt-3.5-turbo", // "gpt-4" also works, but is so slow!
        // Changed June 11 2024: Added TogetherAI as a provider
        model: overrideModelName,
        max_tokens: 1000,
        temperature: 0.3,
        stream: true,
        messages: [
          {
            role: "system",
            content: "You are a terse bot in a group chat responding to q's. Respond naturally.",
          },
          ...messages.map(({ body, author }) => ({
            role:
              author === "TanAI" ? ("assistant" as const) : ("user" as const),
            content: body,
          })),
        ],
      });
      let body = "";
      let partSize = 0;
      for await (const part of stream) {
        if (part.choices[0].delta?.content) {
          const partContent = part.choices[0].delta.content;
          body += partContent;
          partSize += partContent.length;
          if (partSize > chunkCacheSize) {
            // Send an update to the client
            await ctx.runMutation(internal.messages.update, {
              messageId,
              body,
              complete: false,
            });
            partSize = 0;
          }
        }
      }
      // Update with finalized body and set complete to true
      await ctx.runMutation(internal.messages.update, {
        messageId,
        body,
        complete: true,
      });
      partSize = 0; 
      // partSize should always be zero to ensure stream has been flushed into DB
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        console.error(e.status);
        console.error(e.message);
        await ctx.runMutation(internal.messages.update, {
          messageId,
          body: "OpenAI call failed: " + e.message,
          complete: false
        });
        console.error(e);
      } else {
        throw e;
      }
    }
  },
});
