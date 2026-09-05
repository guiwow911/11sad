const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 彻底放行所有跨域，并启用 websocket + polling 双传输机制
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// 让服务器直接托管当前目录的静态文件（包括 index.html）
app.use(express.static(__dirname));

// 根路由直接返回 index.html，杜绝 "Cannot GET /" 报错
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 健康检查路由
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const rooms = {};

io.on('connection', (socket) => {
  // 创建房间并生成 6 位房间码
  socket.on('create-room', (callback) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    rooms[roomId] = { host: socket.id, guest: null };
    if (typeof callback === 'function') {
      callback({ success: true, roomId });
    }
  });

  // 加入房间
  socket.on('join-room', (roomId, callback) => {
    const targetRoom = (roomId || '').toUpperCase();
    if (rooms[targetRoom]) {
      if (!rooms[targetRoom].guest) {
        socket.join(targetRoom);
        rooms[targetRoom].guest = socket.id;
        if (typeof callback === 'function') {
          callback({ success: true });
        }
        socket.to(targetRoom).emit('player-joined', socket.id);
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, message: '房间已满' });
        }
      }
    } else {
      if (typeof callback === 'function') {
        callback({ success: false, message: '房间号不存在' });
      }
    }
  });

  // 实时转发玩家状态与战斗数据
  socket.on('signal', ({ roomId, data }) => {
    if (roomId) {
      socket.to(roomId).emit('signal', { sender: socket.id, data });
    }
  });

  // 玩家离线清理
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].host === socket.id || rooms[roomId].guest === socket.id) {
        socket.to(roomId).emit('peer-disconnected');
        delete rooms[roomId];
        break;
      }
    }
  });
});

// 动态绑定云端端口，必须监听 server 而不能监听 app
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
