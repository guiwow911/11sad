const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  // 创建房间并生成 6 位短代码
  socket.on('create-room', (callback) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    rooms[roomId] = { host: socket.id, guest: null };
    callback({ success: true, roomId });
  });

  // 加入房间
  socket.on('join-room', (roomId, callback) => {
    const targetRoom = (roomId || '').toUpperCase();
    if (rooms[targetRoom]) {
      if (!rooms[targetRoom].guest) {
        socket.join(targetRoom);
        rooms[targetRoom].guest = socket.id;
        callback({ success: true });
        socket.to(targetRoom).emit('player-joined', socket.id);
      } else {
        callback({ success: false, message: '房间已满' });
      }
    } else {
      callback({ success: false, message: '房间号不存在' });
    }
  });

  // 转发对战数据流（位移、射击、受击、重生）
  socket.on('signal', ({ roomId, data }) => {
    if (roomId) {
      socket.to(roomId).emit('signal', { sender: socket.id, data });
    }
  });

  // 断线清理
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
