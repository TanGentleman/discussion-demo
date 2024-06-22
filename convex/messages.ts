import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { query, internalQuery} from "./_generated/server";
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

export const listN = query({
  args: { lastN: v.optional(v.number()) },
  handler: async (ctx, { lastN = 5}): Promise<Doc<"messages">[]> => {
    // Grab the last N messages.
    const messages = await ctx.db.query("messages").order("desc").take(lastN);
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
    if (author !== "TanAI" && body.indexOf("@gpt") !== -1) {
      // check for magic strings
      const magicStrings = ["*RESET*", "*DEL*", "*FIX*"];
      for (const magicString of magicStrings) {
        if (body.endsWith(magicString)) {
          if (magicString === "*RESET*") {
            // call internal.clearTable
            await ctx.scheduler.runAfter(0, internal.messages.clearTable);
            return;
          }
          if (magicString === "*DEL*") {
            // if want to schedule, have to get message IDS first
            await ctx.scheduler.runAfter(0, internal.messages.removeLastN, {});
            return;
          }
          // Add more magic strings here
          if (magicString === "*FIX*") {
            // call internal.fixTable
            await ctx.scheduler.runAfter(0, internal.messages.fixIncompletes);
            const fixResponseString = "All those responses will be patched up!";
            await ctx.db.insert("messages", {
              author: "TanAI",
              body: fixResponseString,
              complete: true
            });
            return;
          }
        }
      }
      const contextMessages = await ctx.db.query("messages").order("desc").take(messagesInContext);
      // Reverse the list so that it's in chronological order.
      contextMessages.reverse();
      const contextId = await ctx.db.insert("messages", {
        author: "TanAI",
        body: "...",
        complete: false
      });
      // use delay if provided, otherwise default to 0.
      const delayInMs = delay || 0;
      // Schedule an action that calls the LLM and updates the message.
      ctx.scheduler.runAfter(delayInMs, internal.openai.chat, { contextMessages: contextMessages, messageId: contextId });
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

export const clearTableNew = mutation({
  args: {insertSeed: v.optional(v.boolean())},
  handler: async (ctx, {insertSeed = false}) => {
    // Clear all messages in the database.
    const messages = await ctx.db.query("messages").collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    // Replace the DB with a simple seed message.
    if (insertSeed) {
      await ctx.db.insert("messages", {
        author: "Tan",
        body: "Hello! I'm Tan. Let's get this chatroom going! :D",
        complete: true
      });
    }
  },
});

// This defaults to removing the last 4 messages
export const removeLast = internalMutation({
  args: {ids: v.optional(v.array(v.id("messages")))},
  handler: async (ctx, {ids}) => {
    // if no ids given
    if (ids === undefined) {
      const newMessages = await ctx.db.query("messages").order("desc").take(4);
      // reverse order
      newMessages.reverse();
      // Delete the messages.
      ids = newMessages.map(message => message._id);
    }
    if (ids.length !== 4) {
      const errorText = `Sorry buddy, ${ids.length} is not enough! I delete in batches of 4! Try again :P`;
       await ctx.db.patch(ids[ids.length-1], { body: errorText, complete: true });
       return;
    }
    // Delete the messages.
    for (const id of ids) {
      await ctx.db.delete(id);
    }
  }
});

// 
export const removeLastN = internalMutation({
  args: {lastN: v.optional(v.number())},
  handler: async (ctx, {lastN = 3}) => {
    if (!(0 <= lastN && lastN < 100)) {
      throw new Error("lastN must be between 0 and 100");
    }
    const newMessages = await ctx.db.query("messages").order("desc").take(lastN);
    const ids = newMessages.map(message => message._id);
    // Delete the messages.
    for (const id of ids) {
      await ctx.db.delete(id);
    }
  }
});


export const getContextMessages = internalQuery({
  args: { refTime: v.number() },
  handler: async (ctx, {refTime}) => {
    const contextMessages = await ctx.db
      .query("messages")
      .withIndex("by_creation_time", (q) =>
        q.lte("_creationTime", refTime))
      .order("desc")
      .take(3);
    
    // // return array of ids
    const ids = contextMessages.map(m => m._id)
    // return ids
    return ids;
  }
});

export const scanIncompletes = mutation({
  args: {},
  handler: async (ctx) => {
    // Filter messages that are incomplete.
    const incompleteMessages = await ctx.db.query("messages")
    .filter((q) => q.eq(q.field("complete"), false))
    .collect()
    if (incompleteMessages.length === 0) {
      return 0;
    }
    // const allMessages = await ctx.db.query("messages").collect();
    // Fix TanAI authored messages with a body starting with "OpenAI call failed"
    let count  = 0;
    for (const message of incompleteMessages) {
      if (
        (message.body === '...' ||
        message.body.startsWith("OpenAI call failed")) && message.author === "TanAI"
      ) {
        const newBody = "OpenAI call failed. The next *FIX* invocation will patch it!";
        await ctx.db.patch(message._id, { body: newBody, complete: false });
        count++;
      }
      else {
        const errorText = "*Scan marked this with an incomplete flag!*";
        // fix this if else logic
        const newBody = message.author === "TanAI" ? `OpenAI call failed.\n${errorText}\n${message.body}` : message.body + "\n\n" + errorText;
        await ctx.db.patch(message._id, { body: newBody, complete: false });
        count++;
      }
    }
    
    return count;
  },
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
    // This will use the last 5 messages
    // Fix TanAI authored messages with a body starting with "OpenAI call failed"
    let count  = 0;
    let delay = 0;
    for(const message of filteredMessages) {
      if(message.body.startsWith("OpenAI call failed") && message.author === "TanAI") {
        const messageId = message._id;
        const specificMessageTime = message._creationTime
        const contextMessages = await ctx.db
          .query("messages")
          .filter((q) => q.lt(q.field("_creationTime"), specificMessageTime)) // less than specificMessageTime
          .order("desc") // order by creation time in descending order
          .take(5) // take the first 5 rather than messagesInContext

        // Reverse the list so that it's in chronological order.
        contextMessages.reverse();
        console.log(`Fixing ID: ${messageId}`);
        ctx.scheduler.runAfter(delay, internal.openai.chat, { contextMessages, messageId });
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
