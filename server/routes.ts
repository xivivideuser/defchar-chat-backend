import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage.js";

interface WSClient extends WebSocket {
  userId?: number;
  username?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: 'message' | 'join' | 'typing' | 'stop_typing' | 'user_list_request';
  content?: string;
  username?: string;
  userId?: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for defchar.online
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://defchar.online');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // API Routes
  app.get('/api/messages', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const messages = await storage.getMessages(limit);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/users/online', async (req, res) => {
    try {
      const onlineUsers = await storage.getOnlineUsers();
      res.json(onlineUsers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch online users' });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const messageCount = await storage.getMessageCount();
      const onlineUsers = await storage.getOnlineUsers();
      res.json({
        todayMessageCount: messageCount,
        onlineUserCount: onlineUsers.length,
        serverStatus: 'online'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  const httpServer = createServer(app);

  // WebSocket Server
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });

  const clients = new Set<WSClient>();
  const typingUsers = new Set<string>();

  // Heartbeat to detect broken connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WSClient) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', (ws: WSClient) => {
    ws.isAlive = true;
    clients.add(ws);
    
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join':
            if (message.username) {
              let user = await storage.getUserByUsername(message.username);
              if (!user) {
                user = await storage.createUser({
                  username: message.username,
                  password: 'temp'
                });
              } else {
                await storage.updateUserOnlineStatus(user.id, true);
              }
              
              ws.userId = user.id;
              ws.username = user.username;
              
              const joinMessage = await storage.createMessage({
                content: `${user.username} joined the chat`,
                senderId: user.id,
                senderName: user.username,
                type: 'join'
              });
              
              const joinData = JSON.stringify({
                type: 'system',
                message: joinMessage,
                onlineUsers: await storage.getOnlineUsers()
              });
              
              clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(joinData);
                }
              });
            }
            break;
            
          case 'message':
            if (message.content && ws.userId && ws.username) {
              const newMessage = await storage.createMessage({
                content: message.content,
                senderId: ws.userId,
                senderName: ws.username,
                type: 'message'
              });
              
              const messageData = JSON.stringify({
                type: 'message',
                message: newMessage
              });
              
              clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(messageData);
                }
              });
            }
            break;
            
          case 'typing':
            if (ws.username) {
              typingUsers.add(ws.username);
              
              const typingData = JSON.stringify({
                type: 'typing',
                username: ws.username,
                isTyping: true
              });
              
              clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client !== ws) {
                  client.send(typingData);
                }
              });
            }
            break;
            
          case 'stop_typing':
            if (ws.username) {
              typingUsers.delete(ws.username);
              
              const stopTypingData = JSON.stringify({
                type: 'typing',
                username: ws.username,
                isTyping: false
              });
              
              clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client !== ws) {
                  client.send(stopTypingData);
                }
              });
            }
            break;
            
          case 'user_list_request':
            const onlineUsers = await storage.getOnlineUsers();
            ws.send(JSON.stringify({
              type: 'user_list',
              users: onlineUsers
            }));
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      clients.delete(ws);
      
      if (ws.userId && ws.username) {
        await storage.updateUserOnlineStatus(ws.userId, false);
        typingUsers.delete(ws.username);
        
        const leaveMessage = await storage.createMessage({
          content: `${ws.username} left the chat`,
          senderId: ws.userId,
          senderName: ws.username,
          type: 'leave'
        });
        
        const leaveData = JSON.stringify({
          type: 'system',
          message: leaveMessage,
          onlineUsers: await storage.getOnlineUsers()
        });
        
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(leaveData);
          }
        });
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return httpServer;
}
