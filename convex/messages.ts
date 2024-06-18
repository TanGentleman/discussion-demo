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
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    // Send our message.
    await ctx.db.insert("messages", { body, author });

    if (body.indexOf("@gpt") !== -1) {
      // Fetch the latest n messages to send as context.
      // The default order is by creation time.
      const messages = await ctx.db.query("messages").order("desc").take(messagesInContext);
      // Reverse the list so that it's in chronological order.
      messages.reverse();
      // Insert a message with a placeholder body.
      const messageId = await ctx.db.insert("messages", {
        author: "ChatGPT",
        body: "...",
      });
      // Schedule an action that calls ChatGPT and updates the message.
      ctx.scheduler.runAfter(0, internal.openai.chat, { messages, messageId });
    }
  },
});

// Updates a message with a new body.
export const update = internalMutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
    await ctx.db.patch(messageId, { body });
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
      body: "Hello! I'm Tan. Let's get this DB going! :D",
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
