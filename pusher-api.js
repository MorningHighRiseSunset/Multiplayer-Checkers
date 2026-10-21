const express = require('express');
const cors = require('cors');
const pusher = require('./pusher-server');

const app = express();

// CORS
app.use(cors({
  origin: ['https://multiplayer-checkers-five.vercel.app', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// Trigger game start
app.post('/api/game/start', (req, res) => {
  const { room, colorAssignments, firstTurn, board, moveHistory, roles } = req.body;
  pusher.trigger(`presence-${room}`, 'startGame', {
    colorAssignments,
    firstTurn,
    board,
    moveHistory,
    roles
  });
  console.log('[pusher-api] startGame triggered for room:', room);
  res.json({ success: true });
});

// Trigger move
app.post('/api/game/move', (req, res) => {
  const { room, from, to, move, lastMove, currentPlayer, moveHistory } = req.body;
  pusher.trigger(`presence-${room}`, 'syncBoard', {
    from,
    to,
    move,
    lastMove,
    currentPlayer,
    moveHistory
  });
  console.log('[pusher-api] move triggered for room:', room);
  res.json({ success: true });
});

// Trigger player joined
app.post('/api/game/joined', (req, res) => {
  const { room, role } = req.body;
  pusher.trigger(`presence-${room}`, 'playerJoined', { role });
  console.log('[pusher-api] playerJoined triggered for room:', room);
  res.json({ success: true });
});

// Trigger opponent left
app.post('/api/game/left', (req, res) => {
  const { room } = req.body;
  pusher.trigger(`presence-${room}`, 'opponentLeft', {});
  console.log('[pusher-api] opponentLeft triggered for room:', room);
  res.json({ success: true });
});

// Trigger chat message
app.post('/api/game/chat', (req, res) => {
  const { room, sender, msg } = req.body;
  pusher.trigger(`presence-${room}`, 'chatMessage', { sender, msg });
  console.log('[pusher-api] chatMessage triggered for room:', room);
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Pusher API server running on port ${PORT}`);
});
