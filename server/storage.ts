typescript
import { users, messages, type User, type InsertUser, type Message, type InsertMessage } from "../shared/schema.js";
import { db } from "./db.js";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  getOnlineUsers(): Promise<User[]>;
  
  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getMessages(limit?: number): Promise<Message[]>;
  getMessageCount(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        isOnline: true,
        lastSeen: new Date()
      })
      .returning();
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    await db
      .update(users)
      .set({ 
        isOnline, 
        lastSeen: new Date() 
      })
      .where(eq(users.id, id));
  }

  async getOnlineUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.isOnline, true));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values({
        content: insertMessage.content,
        senderId: insertMessage.senderId,
        senderName: insertMessage.senderName,
        type: insertMessage.type ?? 'message'
      })
      .returning();
    return message;
  }

  async getMessages(limit: number = 100): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .orderBy(messages.timestamp)
      .limit(limit);
  }

  async getMessageCount(): Promise<number> {
    const result = await db
      .select({ count: messages.id })
      .from(messages);
    return result.length;
  }
}

export const storage = new DatabaseStorage();
