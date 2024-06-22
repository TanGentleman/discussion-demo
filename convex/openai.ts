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
const checkForMagicStrings = false;
const magicStrings = ["*RESET*", "*DEL*", "*FIX*"];


type ChatParams = {
  contextMessages: Doc<"messages">[];
  messageId: Id<"messages">;
};

import { Langfuse } from "langfuse";

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://us.cloud.langfuse.com"
});

export const chat = internalAction({
  handler: async (ctx, { contextMessages, messageId }: ChatParams) => {
    const trace = langfuse.trace({
      name: "tan-talk",
      userId: "messages.ts",
    });
    trace.event({
      name: "chat",
      metadata: {
        id: messageId,
      },
    });
    // Remove all incomplete messages from the context
    contextMessages = contextMessages.filter((m) => m.complete);
    if (contextMessages.length === 0) {
      throw new Error("No messages found!");
    }
    // WARNING: This prioritizes the secretConfig API key over the environment variable!
    const apiKey = secretConfig.apiKey || process.env.OPENAI_API_KEY;
    const baseURL = overrideBaseUrl;
    const openai = new OpenAI({ baseURL, apiKey });

    if (checkForMagicStrings) {
      const currMessage = contextMessages[contextMessages.length - 1].body;
      // If the message ends in a magic string, handle it
      for (const magicString of magicStrings) {
        if (currMessage.endsWith(magicString)) {
          if (magicString === "*RESET*") {
            // call internal.clearTable
            await ctx.runMutation(internal.messages.clearTable);
            trace.event({
              name: "clearTable",
              metadata: {
                message: currMessage
              }
            });
            await langfuse.shutdownAsync();
            return;
          }
          if (magicString === "*DEL*") {
            // if want to schedule, have to get message IDS first
            const context = contextMessages[contextMessages.length - 1]
            if (!context) {
              throw new Error("No context found!");
            }
            const contextTime = context._creationTime;
            const ids = await ctx.runQuery(internal.messages.getContextMessages, {refTime: contextTime});
            ids.push(messageId);
            // append the AI messageID to the ids
            await ctx.runMutation(internal.messages.removeLast, {ids});

            trace.event({
              name: "removeLast",
              metadata: {
                message: currMessage
              }
            });
            await langfuse.shutdownAsync();
            return;
          }
          // Add more magic strings here
          if (magicString === "*FIX*") {
            // call internal.fixTable
            await ctx.runMutation(internal.messages.fixIncompletes);
            await ctx.runMutation(internal.messages.update, {
              messageId,
              body: "Your table shall be full once more!",
              complete: true
            });
            trace.event({
              name: "fixTable",
              metadata: {
                message: currMessage
              }
            });
            await langfuse.shutdownAsync();
            return;
          }
        throw new Error(`Magic string ${magicString} not implemented yet`);
        }
      }
    }
    // trace.update({ input: { context: contextMessages } });
    const generation = trace.generation({
      name: "Chat completion",
      model: overrideModelName,
      input: { context: contextMessages },
    });
    try {
      let body = "";
      let partSize = 0;
      const stream = await openai.chat.completions.create({
        model: overrideModelName,
        max_tokens: 1000,
        temperature: 0.3,
        stream: true,
        messages: [
          {
            role: "system",
            content: "You are a terse bot in a group chat responding to q's. Respond naturally.",
          },
          ...contextMessages.map(({ body, author }) => ({
            role:
              author === "TanAI" ? ("assistant" as const) : ("user" as const),
            content: body,
          })),
        ],
      });
      
      let mutationCount = 0;
      // Stream the response back to the client
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
            mutationCount++;
            partSize = 0;
          }
        }
      }
      generation.end({
        output: body,
      });
      trace.update({
        input: contextMessages[contextMessages.length - 1].body,
        output: body,
      });
      // Send an update to the client
      // Update with finalized body and set complete to true
      await ctx.runMutation(internal.messages.update, {
        messageId,
        body,
        complete: true,
      });
      mutationCount++;
      partSize = 0;
      // partSize should always be zero to ensure stream has been flushed into DB
      await langfuse.shutdownAsync();
      
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
