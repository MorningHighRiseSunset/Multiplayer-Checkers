const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerColor = null;

  socket.on('createRoom', (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {} };
    }
  });

  socket.on('joinRoom', (roomCode) => {
    currentRoom = roomCode;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {} };
    }
    rooms[roomCode].players[socket.id] = null;
    // Notify others
    socket.to(roomCode).emit('opponentJoined');
  });

  socket.on('pickColor', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].colors[socket.id] = color;
    playerColor = color;
    // Notify both players of color pick
    io.to(room).emit('colorPicked', { color, byMe: false });
    // If both picked, notify
    const pickedColors = Object.values(rooms[room].colors);
    if (pickedColors.length === 2 && pickedColors[0] !== pickedColors[1]) {
      io.to(room).emit('bothPicked');
    }
  });

  socket.on('playerReady', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].ready[socket.id] = true;
    socket.to(room).emit('opponentReady', { color });
    // If both ready, start game
    if (Object.keys(rooms[room].ready).length === 2) {
      // Decide who starts (red always starts)
      io.to(room).emit('bothReady');
      io.to(room).emit('startGame', { firstTurn: 'red' });
    }
  });

  socket.on('joinGame', ({ room, color }) => {
    currentRoom = room;
    playerColor = color;
    socket.join(room);
  });

  socket.on('move', ({ room, from, to, move }) => {
    socket.to(room).emit('opponentMove', { from, to, move });
  });

  socket.on('resetGame', ({ room }) => {
    io.to(room).emit('resetGame');
  });

  socket.on('leaveRoom', ({ room, color }) => {
    socket.leave(room);
    if (rooms[room]) {
      delete rooms[room].players[socket.id];
      delete rooms[room].ready[socket.id];
      delete rooms[room].colors[socket.id];
      socket.to(room).emit('opponentLeft');
      // Clean up if empty
      if (
        Object.keys(rooms[room].players).length === 0 &&
        Object.keys(rooms[room].ready).length === 0 &&
        Object.keys(rooms[room].colors).length === 0
      ) {
        delete rooms[room];
      }
    }
  });

  socket.on('leaveGame', ({ room, color }) => {
    socket.leave(room);
    socket.to(room).emit('opponentLeft');
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[socket.id];
      delete rooms[currentRoom].ready[socket.id];
      delete rooms[currentRoom].colors[socket.id];
      socket.to(currentRoom).emit('opponentLeft');
      // Clean up if empty
      if (
        Object.keys(rooms[currentRoom].players).length === 0 &&
        Object.keys(rooms[currentRoom].ready).length === 0 &&
        Object.keys(rooms[currentRoom].colors).length === 0
      ) {
        delete rooms[currentRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});