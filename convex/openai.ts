import { OpenAI } from "openai";
import { internalAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const overrideBaseUrl = "https://api.together.xyz/v1";
const overrideModelName = "cognitivecomputations/dolphin-2.5-mixtral-8x7b";

// How often to update the DB to stream the response back to the client
// Recommended is 200, but it is smoother at lower values
const chunkCacheSize = 25;

// const allowedBaseUrls = ["https://api.openai.com/v1", "https://api.together.xyz/v1"];
// const allowedModelNames = ["Snowflake/snowflake-arctic-instruct", "Qwen/Qwen2-72B-Instruct", "cognitivecomputations/dolphin-2.5-mixtral-8x7b"];


type ChatParams = {
  messages: Doc<"messages">[];
  messageId: Id<"messages">;
};
export const chat = internalAction({
  handler: async (ctx, { messages, messageId }: ChatParams) => {
    const apiKey = process.env.OPENAI_API_KEY!;
    const baseURL = overrideBaseUrl;
    const openai = new OpenAI({ baseURL, apiKey });

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
              author === "ChatGPT" ? ("assistant" as const) : ("user" as const),
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
            });
            partSize = 0;
          }
        }
      }
      // If full stream has not been flushed yet
      if (partSize > 0) {
        // Send a last update to the client
        await ctx.runMutation(internal.messages.update, {
          messageId,
          body,
        });
        partSize = 0;
      }
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        console.error(e.status);
        console.error(e.message);
        await ctx.runMutation(internal.messages.update, {
          messageId,
          body: "OpenAI call failed: " + e.message,
        });
        console.error(e);
      } else {
        throw e;
      }
    }
  },
});
