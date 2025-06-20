import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for defchar.online
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

// Memory storage
const messages = [];
const onlineUsers = new Map();

// API endpoints
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(messages.slice(-limit));
});

app.get('/api/users/online', (req, res) => {
  res.json(Array.from(onlineUsers.values()));
});

app.get('/api/stats', (req, res) => {
  res.json({
    todayMessageCount: messages.length,
    onlineUserCount: onlineUsers.size,
    serverStatus: 'online'
  });
});

const httpServer = createServer(app);

// WebSocket setup
const wss = new WebSocketServer({ 
  server: httpServer, 
  path: '/ws'
});

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'join':
          if (msg.username) {
            ws.userId = Date.now();
            ws.username = msg.username;
            
            onlineUsers.set(ws.userId, {
              id: ws.userId,
              username: msg.username,
              joinedAt: new Date().toISOString()
            });
            
            const joinMsg = {
              id: Date.now(),
              content: `${msg.username} joined the chat`,
              senderName: msg.username,
              timestamp: new Date().toISOString(),
              type: 'system'
            };
            
            messages.push(joinMsg);
            
            broadcast({
              type: 'system',
              message: joinMsg,
              onlineUsers: Array.from(onlineUsers.values())
            });
          }
          break;
          
        case 'message':
          if (msg.content && ws.username) {
            const newMsg = {
              id: Date.now(),
              content: msg.content,
              senderName: ws.username,
              timestamp: new Date().toISOString(),
              type: 'message'
            };
            
            messages.push(newMsg);
            
            broadcast({
              type: 'message',
              message: newMsg
            });
          }
          break;
          
        case 'typing':
          if (ws.username) {
            broadcastToOthers(ws, {
              type: 'typing',
              username: ws.username,
              isTyping: true
            });
          }
          break;
          
        case 'stop_typing':
          if (ws.username) {
            broadcastToOthers(ws, {
              type: 'typing',
              username: ws.username,
              isTyping: false
            });
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    
    if (ws.userId && ws.username) {
      onlineUsers.delete(ws.userId);
      
      const leaveMsg = {
        id: Date.now(),
        content: `${ws.username} left the chat`,
        senderName: ws.username,
        timestamp: new Date().toISOString(),
        type: 'system'
      };
      
      messages.push(leaveMsg);
      
      broadcast({
        type: 'system',
        message: leaveMsg,
        onlineUsers: Array.from(onlineUsers.values())
      });
    }
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastToOthers(sender, data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== sender) {
      client.send(message);
    }
  });
}

const port = process.env.PORT || 8080;
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`DefChar Chat Server running on port ${port}`);
});
