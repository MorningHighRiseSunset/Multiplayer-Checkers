const pusher = require('./pusher-server');

// Simple in-memory room tracking (for Vercel serverless, this resets on each cold start)
const rooms = {};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method, body } = req;
  const path = req.url;

  console.log('[pusher.js] Request:', method, path);

  try {
    if (method === 'POST' && (path === '/joined' || path === '/api/game/joined')) {
      const { room, socketId } = body;
      if (!rooms[room]) {
        rooms[room] = { players: [] };
      }
      // Deduplicate socket IDs
      if (!rooms[room].players.includes(socketId)) {
        rooms[room].players.push(socketId);
      }
      console.log('[pusher.js] Player joined room:', room, 'Player count:', rooms[room].players.length);

      // Notify other players
      pusher.trigger(`game-${room}`, 'playerJoined', { socketId, playerCount: rooms[room].players.length });

      // Auto-start if exactly 2 unique players
      if (rooms[room].players.length === 2) {
        console.log('[pusher.js] 2 players in room, starting game...');
        const colorAssignments = {};
        colorAssignments[rooms[room].players[0]] = 'black'; // Player 1 (host) gets black (starts first)
        colorAssignments[rooms[room].players[1]] = 'red';  // Player 2 gets red
        const firstTurn = 'black';
        const board = getInitialBoard();
        const moveHistory = [];
        const roles = {
          [rooms[room].players[0]]: 'Player 1',
          [rooms[room].players[1]]: 'Player 2'
        };

        // Store game state in room
        rooms[room].board = board;
        rooms[room].currentPlayer = firstTurn;
        rooms[room].moveHistory = moveHistory;
        rooms[room].colorAssignments = colorAssignments;
        rooms[room].roles = roles;

        pusher.trigger(`game-${room}`, 'startGame', {
          colorAssignments,
          firstTurn,
          board,
          moveHistory,
          roles
        });

        // Also return the color assignment in the join response
        return res.json({
          success: true,
          playerCount: rooms[room].players.length,
          color: colorAssignments[socketId],
          role: roles[socketId]
        });
      }

      return res.json({
        success: true,
        playerCount: rooms[room].players.length,
        color: rooms[room].colorAssignments ? rooms[room].colorAssignments[socketId] : null,
        role: rooms[room].roles ? rooms[room].roles[socketId] : null
      });
    }

    if (method === 'POST' && (path === '/start' || path === '/api/game/start')) {
      const { room, colorAssignments, firstTurn, board, moveHistory, roles } = body;
      pusher.trigger(`game-${room}`, 'startGame', {
        colorAssignments,
        firstTurn,
        board,
        moveHistory,
        roles
      });
      console.log('[pusher.js] startGame triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && (path === '/move' || path === '/api/game/move')) {
      const { room, from, to, move, lastMove, currentPlayer, moveHistory } = body;
      // Apply move on server board
      if (!rooms[room] || !rooms[room].board) {
        console.log('[pusher.js] Room or board not found, creating new board');
        rooms[room] = rooms[room] || {};
        rooms[room].board = getInitialBoard();
      }

      const board = rooms[room].board;
      const piece = board[from.row][from.col];
      board[to.row][to.col] = piece;
      board[from.row][from.col] = null;
      if (move.jump && move.jumped) {
        board[move.jumped.row][move.jumped.col] = null;
      }
      if (move.promotion) {
        piece.king = true;
      }

      // Update room state
      rooms[room].currentPlayer = currentPlayer;
      rooms[room].moveHistory = moveHistory;
      rooms[room].lastMove = lastMove;

      pusher.trigger(`game-${room}`, 'syncBoard', {
        board,
        currentPlayer,
        moveHistory,
        lastMove,
        from,
        to,
        move
      });
      console.log('[pusher.js] move triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && (path === '/left' || path === '/api/game/left')) {
      const { room, socketId } = body;
      if (rooms[room]) {
        rooms[room].players = rooms[room].players.filter(id => id !== socketId);
        console.log('[pusher.js] Player left room:', room, 'Player count:', rooms[room].players.length);
      }
      pusher.trigger(`game-${room}`, 'opponentLeft', {});
      console.log('[pusher.js] opponentLeft triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && (path === '/chat' || path === '/api/game/chat')) {
      const { room, sender, msg } = body;
      pusher.trigger(`game-${room}`, 'chatMessage', { sender, msg });
      console.log('[pusher.js] chatMessage triggered for room:', room);
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('[pusher.js] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function getInitialBoard() {
  const board = [];
  for (let row = 0; row < 8; row++) {
    let rowArr = [];
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) rowArr.push({ color: 'black', king: false });
        else if (row > 4) rowArr.push({ color: 'red', king: false });
        else rowArr.push(null);
      } else {
        rowArr.push(null);
      }
    }
    board.push(rowArr);
  }
  return board;
}
