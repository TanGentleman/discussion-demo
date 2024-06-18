import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const messagesInContext = 10;

export const list = query({
  handler: async (ctx): Promise<Doc<"messages">[]> => {
    // Grab the most recent messages.
    const messages = await ctx.db.query("messages").order("desc").take(100);
    // Reverse the list so that it's in chronological order.
    return messages.reverse();
  },
});

export const send = mutation({
  args: { body: v.string(), author: v.string(), delay: v.optional(v.number())},
  handler: async (ctx, { body, author, delay }) => {
    const complete = true
    // Add user message to DB
    await ctx.db.insert("messages", { body, author, complete });

    // Check for AI invocation.
    if (body.indexOf("@gpt") !== -1) {
      // Fetch the latest n messages to send as context.
      // The default order is by creation time.
      const messages = await ctx.db.query("messages").order("desc").take(messagesInContext);
      // Reverse the list so that it's in chronological order.
      messages.reverse();
      // Insert a message with a placeholder body.
      const messageId = await ctx.db.insert("messages", {
        author: "TanAI",
        body: "...",
        complete: false
      });
      // use delay if provided, otherwise default to 0.
      const delayInMs = delay || 0;
      // Schedule an action that calls the LLM and updates the message.
      ctx.scheduler.runAfter(delayInMs, internal.openai.chat, { messages, messageId });
    }
  },
});

// Updates a message with a new body.
export const update = internalMutation({
  args: { messageId: v.id("messages"), body: v.string(), complete: v.boolean() },
  handler: async (ctx, { messageId, body, complete }) => {
    await ctx.db.patch(messageId, { body, complete });
  },
});

// Resets the table and populates with a single seed message
export const clearTable = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear all messages in the database.
    const messages = await ctx.db.query("messages").collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    // Replace the DB with a simple seed message.
    await ctx.db.insert("messages", {
      author: "Tan",
      body: "Hello! I'm Tan. Let's get this chatroom going! :D",
      complete: true
    });
  },
});

// Remove the last exchange in the database.
export const removeLast = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get the latest message exchange from the database.
    const messages  = await ctx.db.query("messages").order("desc").take(4);
    // assert that there are two messages in the DB.
    if(messages.length !== 4) {
      const body = "Sorry buddy, there aren't enough messages to do that! Try again :P";
      await ctx.db.patch(messages[0]._id, { body });
      return;
    };
    // Delete the messages.
    await ctx.db.delete(messages[0]._id);
    await ctx.db.delete(messages[1]._id);
    await ctx.db.delete(messages[2]._id);
    await ctx.db.delete(messages[3]._id);
  }
});

export const fixIncompletes = internalMutation({
  args: {},
  handler: async (ctx) => {
     // Filter messages that are incomplete.
    const filteredMessages = await ctx.db.query("messages")
    .filter((q) => q.eq(q.field("complete"), false))
    .collect()
    if (filteredMessages.length === 0) {
      return 0;
    }
    // const allMessages = await ctx.db.query("messages").collect();
    // Fix TanAI authored messages with a body starting with "OpenAI call failed"
    let count  = 0;
    let delay = 0;
    for(const message of filteredMessages) {
      if(message.body.startsWith("OpenAI call failed") && message.author === "TanAI") {
        const messageId = message._id;
        const specificMessageTime = message._creationTime
        const messages = await ctx.db
          .query("messages")
          .filter((q) => q.lt(q.field("_creationTime"), specificMessageTime)) // less than specificMessageTime
          .order("desc") // order by creation time in descending order
          .take(5) // take the first 5 rather than messagesInContext

        // Reverse the list so that it's in chronological order.
        messages.reverse();
        console.log(`Fixing ID: ${messageId}`);
        ctx.scheduler.runAfter(delay, internal.openai.chat, { messages, messageId });
        count++;
        if (count % 5 === 0) {
          // For rate limits (Currently 5 seconds every 5 queries, can find a sweeter spot if needed)
          delay += 5000;
        }
      }
     };
     // Return the number of fixed messages.
    return count;
   },
});
