const params = new URLSearchParams(window.location.search);
const urlRoomCode = params.get('room');

// Check if this is a refresh (we've already loaded with this room code)
const loadedRoom = sessionStorage.getItem('loadedRoom');
const roomCode = (loadedRoom === urlRoomCode) ? null : urlRoomCode;

// Game state
let myColor = null;
let myRole = null;
let mySocketId = null;
let currentRoom = null;
let channel = null;

// AI mode flag
let isAIMode = false;
let aiColor = null;

console.log('[game.js] Loaded. roomCode:', roomCode);

// --- Join URL and AI button logic ---
const joinUrlDiv = document.getElementById('join-url');
const copyUrlBtn = document.getElementById('copy-url-btn');
const playAiBtn = document.getElementById('play-ai-btn');

// Display the join URL
if (joinUrlDiv) {
  const joinUrl = window.location.href;
  joinUrlDiv.textContent = joinUrl;
}

// Copy URL button
if (copyUrlBtn) {
  copyUrlBtn.onclick = () => {
    const joinUrl = window.location.href;
    navigator.clipboard.writeText(joinUrl).then(() => {
      copyUrlBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyUrlBtn.textContent = 'Copy URL';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy URL:', err);
      alert('Failed to copy URL');
    });
  };
}

// Play AI button
if (playAiBtn) {
  playAiBtn.onclick = () => {
    startAIMode();
  };
}

// API URL for Pusher events
const apiUrl = window.location.origin === 'http://localhost:3000'
  ? 'http://localhost:3001/api/game'
  : '/api/game';

console.log('[game.js] API URL:', apiUrl);

// Start AI mode
function startAIMode() {
  console.log('[game.js] Starting AI mode');
  isAIMode = true;
  aiColor = 'red'; // AI plays as red
  myColor = 'black'; // Player plays as black
  myRole = 'Player 1';
  
  // Initialize the board
  initBoard();
  
  // Set game state
  gameStarted = true;
  gameEnded = false;
  currentPlayer = 'black';
  isMyTurn = true;
  
  // Update UI
  updateStatus();
  
  console.log('[game.js] AI mode started. Player:', myColor, 'AI:', aiColor);
}

// --- Room Logic ---
// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Initialize room on load
function initializeRoom() {
  console.log('[game.js] initializeRoom called. roomCode:', roomCode);

  if (roomCode) {
    // Join existing room
    currentRoom = roomCode;
    sessionStorage.setItem('loadedRoom', roomCode);
    console.log('[game.js] Joining existing room:', currentRoom);
  } else {
    // Create new room
    currentRoom = generateRoomCode();
    console.log('[game.js] Created new room:', currentRoom);

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    window.history.replaceState({}, '', url);

    // Update join URL display
    if (joinUrlDiv) {
      joinUrlDiv.textContent = url.href;
    }
  }

  // Only subscribe if not already subscribed
  if (!channel) {
    // Subscribe to Pusher public channel (no auth needed)
    channel = pusher.subscribe(`game-${currentRoom}`);
    console.log('[game.js] Subscribed to Pusher channel:', `game-${currentRoom}`);

    // Listen for subscription succeeded
    channel.bind('pusher:subscription_succeeded', () => {
      console.log('[game.js] Subscription succeeded');
      mySocketId = pusher.connection.socket_id;
      console.log('[game.js] My socket ID:', mySocketId);

      // Notify server that I joined (with retry for cold starts)
      const joinWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const res = await fetch(`${apiUrl}/joined`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room: currentRoom, socketId: mySocketId })
            });
            const data = await res.json();
            console.log('[game.js] Joined response:', data);
            if (data.color) {
              myColor = data.color;
              sessionStorage.setItem('myAssignedColor', myColor);
            }
            if (data.role) {
              myRole = data.role;
              sessionStorage.setItem('myRole', myRole);
            }
            if (data.playerCount === 2) {
              statusDiv.textContent = 'Opponent joined - starting game...';
              // Start game locally if not already started
              setTimeout(() => {
                if (!gameStarted) {
                  startGameLocally();
                }
              }, 500);
            }
            return;
          } catch (err) {
            console.error('[game.js] Join error attempt', i + 1, ':', err);
            if (i < retries - 1) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
        console.error('[game.js] Failed to join after retries');
      };
      joinWithRetry();
    });
  }

  // Listen for start game
  channel.bind('startGame', (data) => {
    console.log('[game.js] startGame event received:', data);
    // Unsubscribe first to prevent duplicate handlers
    channel.unbind('startGame');
    handleStartGame(data);
  });

  // Listen for player joined
  channel.bind('playerJoined', (data) => {
    console.log('[game.js] playerJoined event received:', data);
    if (data.playerCount === 2) {
      statusDiv.textContent = 'Opponent joined - starting game...';
      // Start game locally since server stateless may lose track
      setTimeout(() => {
        if (!gameStarted) {
          startGameLocally();
        }
      }, 500);
    } else {
      statusDiv.textContent = `You are in the room (${data.playerCount}/2 players). Send URL to opponent.`;
    }
  });

  // Listen for sync board (moves)
  channel.bind('syncBoard', (data) => {
    console.log('[game.js] syncBoard event received');
    handleSyncBoard(data);
  });

  // Listen for opponent left
  channel.bind('opponentLeft', () => {
    console.log('[game.js] opponentLeft event received');
    const myPoints = countPieces(myColor);
    showEndGameScreen(`Opponent left. You win!`, myPoints);
  });

  // Listen for chat messages
  channel.bind('chatMessage', (data) => {
    console.log('[game.js] chatMessage received:', data);
    appendChatMessage(data.sender, data.msg);
  });
}



// Handle start game
function handleStartGame({ colorAssignments, firstTurn, board: serverBoard, moveHistory: serverHistory, roles, lastMove: serverLastMove }) {
  console.log('[game.js] handleStartGame:', { colorAssignments, firstTurn, roles });

  // Assign my color from server
  if (colorAssignments && mySocketId in colorAssignments) {
    myColor = colorAssignments[mySocketId];
    sessionStorage.setItem('myAssignedColor', myColor);
    console.log('[game.js] Assigned myColor from server:', myColor);
  }
  if (roles && roles[mySocketId]) {
    myRole = roles[mySocketId];
    sessionStorage.setItem('myRole', myRole);
    console.log('[game.js] Assigned myRole from server:', myRole);
  } else {
    // Fallback if roles not provided
    myRole = myColor === 'red' ? 'Player 1' : 'Player 2';
    sessionStorage.setItem('myRole', myRole);
    console.log('[game.js] Fallback myRole:', myRole);
  }

  currentPlayer = firstTurn || 'black';
  isMyTurn = (myColor === currentPlayer);
  gameStarted = true;
  gameEnded = false;

  if (serverBoard) board = JSON.parse(JSON.stringify(serverBoard));
  if (serverHistory) moveHistory = [...serverHistory];
  if (serverLastMove) lastMove = serverLastMove;
  else lastMove = null;

  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  checkGameOver();
}

// Handle sync board
function handleSyncBoard({ board: serverBoard, currentPlayer: serverCurrent, moveHistory: serverHistory, lastMove: serverLastMove, color, role, from, to, move }) {
  console.log('[game.js] handleSyncBoard event received:', { from, to, move, serverCurrent });

  // Use server board as source of truth
  if (serverBoard) {
    board = serverBoard;
  }

  if (serverCurrent) currentPlayer = serverCurrent;
  if (serverHistory) moveHistory = [...serverHistory];
  if (serverLastMove) lastMove = serverLastMove;
  if (color) {
    myColor = color;
    sessionStorage.setItem('myAssignedColor', myColor);
  }
  if (role) {
    myRole = role;
    sessionStorage.setItem('myRole', myRole);
  }

  selected = null;
  validMoves = [];
  gameStarted = true;
  isMyTurn = (myColor === currentPlayer);
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  checkGameOver();
}

// --- Move history panel ---
let moveHistoryElem = document.getElementById('move-history');
const boardSize = 8;
const boardDiv = document.getElementById('game-board');
const statusDiv = document.getElementById('game-status');
const printBtn = document.getElementById('print-btn');

// --- Move history panel logic ---
function renderMoveHistory() {
  if (!moveHistoryElem) {
    console.warn('[game.js] moveHistoryElem not found, skipping renderMoveHistory');
    return;
  }
  
  moveHistoryElem.innerHTML = '';
  let moves = moveHistory || [];
  for (let i = 0; i < moves.length; i++) {
    const li = document.createElement('li');
    li.textContent = moves[i];
    moveHistoryElem.appendChild(li);
  }
}

// --- Add Leave Game button ---
let leaveBtn = document.getElementById('leave-btn');
if (!leaveBtn) {
  leaveBtn = document.createElement('button');
  leaveBtn.id = 'leave-btn';
  leaveBtn.textContent = 'Leave Game';
  printBtn.parentNode.appendChild(leaveBtn);
}

leaveBtn.onclick = () => {
  console.log('[game.js] Leave Game clicked');
  fetch(`${apiUrl}/left`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: currentRoom || roomCode, socketId: mySocketId })
  });
  window.location.href = '/';
};

// --- Chat elements ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let board = [];
let currentPlayer = 'black'; // Black goes first by default
let selected = null;
let validMoves = [];
let moveHistory = [];
let isMyTurn = false;
let gameStarted = false;
let gameEnded = false;

// Animation and highlight state
let lastMove = null; // {from: {row,col}, to: {row,col}}

// Restore initial board and move history if coming from lobby
const startBoard = sessionStorage.getItem('startBoard');
const startMoveHistory = sessionStorage.getItem('startMoveHistory');
const startFirstTurn = sessionStorage.getItem('startFirstTurn');

// Get my socket id after connecting
pusher.connection.bind('connected', () => {
  mySocketId = pusher.connection.socket_id;
  console.log('[game.js] Pusher connected. socket.id:', mySocketId);
});

// Handle connection errors
pusher.connection.bind('error', (error) => {
  console.error('[game.js] Pusher connection error:', error);
  statusDiv.textContent = 'Connection error. Please refresh the page.';
});

pusher.connection.bind('disconnected', () => {
  console.log('[game.js] Pusher disconnected');
  statusDiv.textContent = 'Disconnected from server.';
});



// Initialize board with pieces
function initBoard() {
  console.log('[game.js] initBoard called');
  board = [];
  for (let row = 0; row < boardSize; row++) {
    let rowArr = [];
    for (let col = 0; col < boardSize; col++) {
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
  currentPlayer = 'black';
  selected = null;
  validMoves = [];
  moveHistory = [];
  lastMove = null;
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
}

// If coming from lobby, use the board and move history from sessionStorage
if (startBoard) {
  console.log('[game.js] startBoard found in sessionStorage');
  board = JSON.parse(startBoard);
  moveHistory = startMoveHistory ? JSON.parse(startMoveHistory) : [];
  currentPlayer = startFirstTurn || 'black';
  gameStarted = true;
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  sessionStorage.removeItem('startBoard');
  sessionStorage.removeItem('startMoveHistory');
  sessionStorage.removeItem('startFirstTurn');
  myRole = sessionStorage.getItem('myRole') || null;
}

// --- Animation helpers ---
function getSquareElement(row, col) {
  return boardDiv.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
}
function getPieceElement(row, col) {
  const sq = getSquareElement(row, col);
  return sq ? sq.querySelector('.piece') : null;
}

// Animate a move from (fromRow,fromCol) to (toRow,toCol)
function animateMove(from, to, callback) {
  const fromSq = getSquareElement(from.row, from.col);
  const toSq = getSquareElement(to.row, to.col);
  if (!fromSq || !toSq) { callback && callback(); return; }
  const piece = fromSq.querySelector('.piece');
  if (!piece) { callback && callback(); return; }

  // Get boardDiv's position for absolute offset
  const fromRect = fromSq.getBoundingClientRect();
  const toRect = toSq.getBoundingClientRect();

  // Clone the piece for animation
  const animPiece = piece.cloneNode(true);
  animPiece.classList.add('moving');
  animPiece.style.position = 'fixed';
  animPiece.style.left = fromRect.left + 'px';
  animPiece.style.top = fromRect.top + 'px';
  animPiece.style.width = fromRect.width + 'px';
  animPiece.style.height = fromRect.height + 'px';
  animPiece.style.pointerEvents = 'none';
  animPiece.style.zIndex = 1000;
  // Add smooth transition
  animPiece.style.transition = 'transform 1.2s cubic-bezier(0.22, 0.61, 0.36, 1)';
  document.body.appendChild(animPiece);

  // Hide original piece during animation
  piece.style.visibility = 'hidden';

  // Animate to destination
  requestAnimationFrame(() => {
    animPiece.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`;
  });

  setTimeout(() => {
    document.body.removeChild(animPiece);
    piece.style.visibility = '';
    callback && callback();
  }, 1200); // Increased duration for smoother animation
}

// --- Highlight last moved checker ---
function highlightLastMove() {
  // Remove old highlights
  boardDiv.querySelectorAll('.last-move').forEach(el => el.classList.remove('last-move'));
  if (lastMove && lastMove.to) {
    const sq = getSquareElement(lastMove.to.row, lastMove.to.col);
    if (sq) sq.classList.add('last-move');
  }
}

// Render the board (red always on bottom, black always on top)
function renderBoard() {
  boardDiv.innerHTML = '';
  boardDiv.style.display = 'grid';
  boardDiv.style.gridTemplate = `repeat(${boardSize}, 1fr) / repeat(${boardSize}, 1fr)`;

  // Always render red at the bottom, black at the top
  for (let displayRow = 0; displayRow < boardSize; displayRow++) {
    let row = boardSize - 1 - displayRow; // flip so red is always at the bottom
    for (let col = 0; col < boardSize; col++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((row + col) % 2 === 1 ? 'dark' : 'light');
      square.dataset.row = row;
      square.dataset.col = col;

      // Highlight last move
      if (lastMove && lastMove.to && lastMove.to.row === row && lastMove.to.col === col) {
        square.classList.add('last-move');
      }

      if (selected && selected.row === row && selected.col === col) {
        square.classList.add('selected');
      }
      if (validMoves.some(m => m.row === row && m.col === col)) {
        square.classList.add('valid-move');
      }

      const piece = board[row][col];
      if (piece) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'piece ' + piece.color + (piece.king ? ' king' : '');
        square.appendChild(pieceDiv);
      }

      square.addEventListener('click', onSquareClick);
      // Add touch support for mobile
      square.addEventListener('touchend', function(e) {
        e.preventDefault(); // Prevents simulated mouse events
        onSquareClick({ currentTarget: square });
      }, { passive: false });

      boardDiv.appendChild(square);
    }
  }
}

// --- Auto double-jump logic with animation and server sync ---
function performMoveWithAnimation(from, to, move, callback) {
  animateMove(from, to, () => {
    doMove(from, to, move);
    renderBoard();
    highlightLastMove();
    setTimeout(() => {
      const piece = board[to.row][to.col];
      if (move && move.jump && piece) {
        // Send this jump to server only if not in AI mode
        if (!isAIMode) {
          sendMoveToServer(from, to, move);
        }
        const jumps = getValidMoves(to.row, to.col, true);
        if (jumps.length > 0) {
          const nextJump = jumps[0];
          lastMove = { from: { ...to }, to: { row: nextJump.row, col: nextJump.col } };
          performMoveWithAnimation(
            { row: to.row, col: to.col },
            { row: nextJump.row, col: nextJump.col },
            nextJump,
            callback
          );
          return;
        }
      } else {
        // If not a jump, send the move to server only if not in AI mode
        if (!isAIMode) {
          sendMoveToServer(from, to, move);
        }
      }
      callback && callback();
    }, 100);
  });
}

// Actually update the board for a move (no animation)
function doMove(from, to, move) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;
  // King me
  if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === boardSize - 1)) {
    piece.king = true;
  }
  // Remove jumped piece
  if (move && move.jump && move.jumped) {
    board[move.jumped.row][move.jumped.col] = null;
  }
}

// Get valid moves for a piece
function getValidMoves(row, col, onlyJumps = false) {
  const piece = board[row][col];
  if (!piece) return [];
  const directions = [];
  if (piece.color === 'red' || piece.king) directions.push([-1, -1], [-1, 1]);
  if (piece.color === 'black' || piece.king) directions.push([1, -1], [1, 1]);
  let moves = [], jumps = [];
  for (const [dr, dc] of directions) {
    const [r1, c1] = [row + dr, col + dc];
    const [r2, c2] = [row + dr * 2, col + dc * 2];
    if (isInBounds(r1, c1) && !board[r1][c1] && !onlyJumps)
      moves.push({ row: r1, col: c1, jump: false });
    if (isInBounds(r2, c2) && board[r1][c1] && board[r1][c1].color !== piece.color && !board[r2][c2])
      jumps.push({ row: r2, col: c2, jump: true, jumped: { row: r1, col: c1 } });
  }
  return jumps.length > 0 ? jumps : moves;
}

function isInBounds(row, col) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

function hasAnyJumps(color) {
  for (let row = 0; row < boardSize; row++)
    for (let col = 0; col < boardSize; col++)
      if (board[row][col] && board[row][col].color === color && getValidMoves(row, col, true).length > 0)
        return true;
  return false;
}

// Handle square click
function onSquareClick(e) {
  if (!isMyTurn || !gameStarted || gameEnded) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  const piece = board[row][col];

  console.log('[game.js] Square clicked:', { row, col, piece, myColor, currentPlayer, isMyTurn, gameStarted, gameEnded });

  // Only allow selecting your own color and only if it's your turn
  if (piece && piece.color === myColor && piece.color === currentPlayer) {
    selected = { row, col };
    validMoves = getValidMoves(row, col, hasAnyJumps(currentPlayer));
    console.log('[game.js] Selected piece, valid moves:', validMoves);
    renderBoard();
    highlightLastMove();
    return;
  }

  if (selected && validMoves.some(m => m.row === row && m.col === col)) {
    const move = validMoves.find(m => m.row === row && m.col === col);
    console.log('[game.js] Moving to valid square:', move);
    isMyTurn = false;
    lastMove = { from: { ...selected }, to: { row, col } };
    performMoveWithAnimation(selected, { row, col }, move, () => {
      // Switch turns
      currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
      renderBoard();
      highlightLastMove();
      updateStatus();
      checkGameOver();

      // If in AI mode, trigger AI move after player
      if (isAIMode && !gameEnded) {
        setTimeout(() => {
          makeAIMove();
        }, 1000);
      }
    });
    selected = null;
    validMoves = [];
    return;
  }

  selected = null;
  validMoves = [];
  renderBoard();
  highlightLastMove();
}

// Send move to server, let server update board and broadcast to both players
function sendMoveToServer(from, to, move) {
  console.log('[game.js] Sending move to server:', { from, to, move });

  // In AI mode, apply move locally immediately (no server sync)
  if (isAIMode) {
    const piece = board[from.row][from.col];
    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;
    let becameKing = false;
    if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === 7)) {
      if (!piece.king) {
        piece.king = true;
        becameKing = true;
      }
    }
    if (move.jump) {
      const { row: jr, col: jc } = move.jumped;
      board[jr][jc] = null;
    }
    moveHistory.push(
      `${capitalize(currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${move.jump ? ' (jump)' : ''}${becameKing ? ' (king)' : ''}`
    );
    currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
    isMyTurn = false;
    updateStatus();
    return;
  }

  // In multiplayer mode, send to server - server is source of truth
  const lastMove = { from, to };

  // Convert move to server format
  const serverMove = {
    from,
    to,
    jump: move.jump,
    jumped: move.jump ? move.jumped : null,
    promotion: false // Server will determine promotion
  };

  const nextPlayer = currentPlayer === 'red' ? 'black' : 'red';

  fetch(`${apiUrl}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: currentRoom || roomCode,
      from,
      to,
      move: serverMove,
      lastMove,
      currentPlayer: nextPlayer,
      moveHistory
    })
  });

  // Show "sending..." state, will update when syncBoard arrives
  statusDiv.textContent = 'Sending move...';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isGameOver() {
  // Game over if the other player has no pieces or no moves
  const other = currentPlayer === 'red' ? 'black' : 'red';
  let hasPiece = false, hasMove = false;
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (board[row][col] && board[row][col].color === other) {
        hasPiece = true;
        if (getValidMoves(row, col).length > 0) hasMove = true;
      }
    }
  }
  return !hasPiece || !hasMove;
}

function checkGameOver() {
  if (gameEnded) return;
  if (isGameOver()) {
    let winner = currentPlayer === 'red' ? 'Black' : 'Red';
    const winnerColor = winner.toLowerCase();
    const points = countPieces(winnerColor);
    showEndGameScreen(`${winner} wins!`, points);
    gameEnded = true;
    console.log('[game.js] Game over:', winner, 'wins');
  }
}

function countPieces(color) {
  let count = 0;
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (board[row][col] && board[row][col].color === color) count++;
    }
  }
  return count;
}

function showEndGameScreen(message, points) {
  gameEnded = true;
  const buttonHtml = isAIMode
    ? `<button id="play-again-btn" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#2e7a3c;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:10px;">Play Again</button>
       <button id="leave-btn-final" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#7a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;">New Game</button>`
    : `<button id="leave-btn-final" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#7a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;">New Game</button>`;
  
  statusDiv.innerHTML = `
    <div style="font-size:1.5em;color:#ffd700;margin:18px 0 10px 0;">${message}</div>
    <div style="font-size:1.1em;color:#fff;">Your points: <b>${points}</b></div>
    ${buttonHtml}
  `;
  
  const leaveBtnFinal = document.getElementById('leave-btn-final');
  if (leaveBtnFinal) {
    leaveBtnFinal.onclick = () => {
      window.location.href = '/';
    };
  }
  
  if (isAIMode) {
    const playAgainBtn = document.getElementById('play-again-btn');
    if (playAgainBtn) {
      playAgainBtn.onclick = () => {
        gameEnded = false;
        startAIMode();
      };
    }
  }
  
  console.log('[game.js] showEndGameScreen:', message, points);
}

// Print button (prints move history)
printBtn.onclick = () => {
  let movesHtml = '<h2>Checkers Move History</h2><ol>';
  moveHistory.forEach(m => {
    movesHtml += `<li>${m}</li>`;
  });
  movesHtml += '</ol>';
  const printWindow = window.open('', '', 'width=600,height=800');
  printWindow.document.write(`
    <html>
      <head>
        <title>Checkers Move History</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h2 { color: #a67c38; }
          ol { font-size: 1.1em; }
        </style>
      </head>
      <body>
        ${movesHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
};

function updateStatus() {
  if (gameEnded) return;
  if (!gameStarted) {
    statusDiv.textContent = "Share the URL above with your opponent to start playing";
    console.log('[game.js] Status: Share URL with opponent');
    return;
  }
  if (isAIMode) {
    if (currentPlayer === myColor) {
      statusDiv.textContent = `Your turn (${myColor})`;
      console.log('[game.js] Status: Your turn', myColor);
    } else {
      statusDiv.textContent = `AI's turn (${aiColor})`;
      console.log('[game.js] Status: AI\'s turn', aiColor);
    }
  } else {
    if (isMyTurn) {
      statusDiv.textContent = `Your turn (${myColor})`;
      console.log('[game.js] Status: Your turn', myColor);
    } else {
      statusDiv.textContent = `Opponent's turn (${currentPlayer})`;
      console.log('[game.js] Status: Opponent\'s turn', currentPlayer);
    }
  }
}

// Start game locally (used when server stateless loses track)
function startGameLocally() {
  console.log('[game.js] Starting game locally');
  // Only assign if server didn't assign
  if (!myColor) {
    if (!myRole) {
      myRole = 'Player 1';
    }
    const isFirstPlayer = myRole === 'Player 1';
    myColor = isFirstPlayer ? 'black' : 'red';
    sessionStorage.setItem('myAssignedColor', myColor);
    sessionStorage.setItem('myRole', myRole);
  }
  currentPlayer = 'black';
  initBoard();
  moveHistory = [];
  gameStarted = true;
  isMyTurn = (myColor === currentPlayer);
  selected = null;
  validMoves = [];
  renderBoard();
  renderMoveHistory();
  updateStatus();
}

// Leave game if window/tab closed
window.addEventListener('beforeunload', () => {
  console.log('[game.js] beforeunload: leaving game');
  fetch(`${apiUrl}/left`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: currentRoom || roomCode, socketId: mySocketId })
  });
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Chat box logic ---
if (chatForm && chatInput && chatMessages) {
  // Add feedback message on page load
  const feedbackDiv = document.createElement('div');
  feedbackDiv.style.padding = '8px';
  feedbackDiv.style.background = '#2a2a2a';
  feedbackDiv.style.borderRadius = '4px';
  feedbackDiv.style.marginBottom = '8px';
  feedbackDiv.style.fontSize = '0.9em';
  feedbackDiv.style.color = '#ffffff';
  feedbackDiv.style.border = '1px solid #444';
  feedbackDiv.innerHTML = 'Please send comments/feedback to: <a href="mailto:maurice13stu@gmail.com" style="color: #66b3ff; text-decoration: underline;">maurice13stu@gmail.com</a>';
  chatMessages.appendChild(feedbackDiv);

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      // Use myRole if available, else fallback to "You"
      const senderLabel = myRole ? myRole : "You";
      appendChatMessage(senderLabel, msg);
      fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentRoom || roomCode, sender: senderLabel, msg })
      });
      chatInput.value = '';
      console.log('[game.js] Chat message sent:', msg);
    }
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Initialize game if not coming from lobby
if (!startBoard) {
  console.log('[game.js] No startBoard in sessionStorage, calling initBoard');
  initBoard();
}

// Initialize Pusher room on page load
if (!startBoard) {
  initializeRoom();
}

// --- AI Logic - Unbeatable Minimax AI ---
const AI_SIZE = 8;
const AI_MAX_DEPTH = 8;
const AI_QUIESCE_DEPTH = 6;

// Convert our board format to AI format (0=empty, 1=red man, 2=red king, -1=black man, -2=black king)
function convertBoardToAIFormat(board) {
  const aiBoard = [];
  for (let r = 0; r < AI_SIZE; r++) {
    const row = [];
    for (let c = 0; c < AI_SIZE; c++) {
      const piece = board[r][c];
      if (!piece) {
        row.push(0);
      } else if (piece.color === 'red') {
        row.push(piece.king ? 2 : 1);
      } else {
        row.push(piece.king ? -2 : -1);
      }
    }
    aiBoard.push(row);
  }
  return aiBoard;
}

// AI Helper functions
const aiAbs = Math.abs;
const aiSign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const aiInBounds = (r, c) => r >= 0 && r < AI_SIZE && c >= 0 && c < AI_SIZE;
const aiIsDark = (r, c) => (r + c) % 2 === 1;

function aiDirsFor(piece) {
  if (aiAbs(piece) === 2) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  if (piece === 1) return [[-1,-1],[-1,1]];
  return [[1,-1],[1,1]];
}

// AI Move Generation
function aiGetCapturesFrom(b, startR, startC, piece) {
  const results = [];
  function search(r, c, captured, path) {
    for (const [dr, dc] of aiDirsFor(piece)) {
      const mr = r + dr, mc = c + dc;
      const lr = r + 2 * dr, lc = c + 2 * dc;
      if (!aiInBounds(lr, lc) || !aiIsDark(lr, lc) || b[lr][lc] !== 0) continue;
      const mid = b[mr][mc];
      if (aiSign(mid) !== -aiSign(piece)) continue;
      if (captured.some(p => p.r === mr && p.c === mc)) continue;

      const savedFrom = b[r][c], savedMid = b[mr][mc];
      b[r][c] = 0;
      b[mr][mc] = 0;
      b[lr][lc] = piece;

      const newCap = captured.concat({ r: mr, c: mc });
      const newPath = path.concat({ r: lr, c: lc });
      const before = results.length;
      search(lr, lc, newCap, newPath);
      if (results.length === before) {
        results.push({
          from: { r: startR, c: startC },
          to: { r: lr, c: lc },
          captures: newCap,
          path: newPath
        });
      }

      b[r][c] = savedFrom;
      b[mr][mc] = savedMid;
      b[lr][lc] = 0;
    }
  }
  search(startR, startC, [], []);
  return results;
}

function aiGenerateMoves(b, side, onlyFrom = null) {
  const simple = [];
  const jumps = [];

  for (let r = 0; r < AI_SIZE; r++) {
    for (let c = 0; c < AI_SIZE; c++) {
      if (aiSign(b[r][c]) !== side) continue;
      if (onlyFrom && (r !== onlyFrom.r || c !== onlyFrom.c)) continue;
      const piece = b[r][c];

      jumps.push(...aiGetCapturesFrom(b, r, c, piece));

      for (const [dr, dc] of aiDirsFor(piece)) {
        const nr = r + dr, nc = c + dc;
        if (aiInBounds(nr, nc) && b[nr][nc] === 0 && aiIsDark(nr, nc)) {
          simple.push({
            from: { r, c },
            to: { r: nr, c: nc },
            captures: [],
            path: [{ r: nr, c: nc }]
          });
        }
      }
    }
  }
  return jumps.length > 0 ? jumps : simple;
}

function aiApplyMove(b, move) {
  const nb = b.map(row => row.slice());
  const piece = nb[move.from.r][move.from.c];
  nb[move.from.r][move.from.c] = 0;
  for (const cap of move.captures) nb[cap.r][cap.c] = 0;

  let final = piece;
  if (aiAbs(piece) === 1) {
    if (piece === 1 && move.to.r === 0) final = 2;
    if (piece === -1 && move.to.r === 7) final = -2;
  }
  nb[move.to.r][move.to.c] = final;
  return nb;
}

function aiCanContinueAfter(move, originalPiece) {
  if (aiAbs(originalPiece) === 2) return true;
  if (originalPiece === 1 && move.to.r === 0) return false;
  if (originalPiece === -1 && move.to.r === 7) return false;
  return true;
}

// AI Evaluation
function aiEvaluate(b) {
  let score = 0;
  let redMen = 0, redKings = 0, blackMen = 0, blackKings = 0;

  const manPST = [
    [0,0,0,0,0,0,0,0],
    [25,25,25,25,25,25,25,25],
    [16,16,18,18,18,18,16,16],
    [10,10,12,14,14,12,10,10],
    [6,6,8,10,10,8,6,6],
    [3,3,4,5,5,4,3,3],
    [1,1,1,2,2,1,1,1],
    [0,0,0,0,0,0,0,0]
  ];
  const kingPST = [
    [0,0,2,2,2,2,0,0],
    [0,5,8,8,8,8,5,0],
    [2,8,12,12,12,12,8,2],
    [2,8,12,14,14,12,8,2],
    [2,8,12,14,14,12,8,2],
    [2,8,12,12,12,12,8,2],
    [0,5,8,8,8,8,5,0],
    [0,0,2,2,2,2,0,0]
  ];

  for (let r = 0; r < AI_SIZE; r++) {
    for (let c = 0; c < AI_SIZE; c++) {
      const p = b[r][c];
      if (p === 0) continue;
      const isRed = p > 0;
      const isKing = aiAbs(p) === 2;

      let val = isKing ? 450 : 100;

      if (isKing) {
        val += kingPST[r][c];
      } else {
        const pst = isRed ? manPST[r][c] : manPST[7 - r][c];
        val += pst;
      }

      if (c === 0 || c === 7) val -= 4;

      if (isRed) {
        score += val;
        if (isKing) redKings++; else redMen++;
      } else {
        score -= val;
        if (isKing) blackKings++; else blackMen++;
      }
    }
  }

  const redMob = aiGenerateMoves(b, 1).length;
  const blackMob = aiGenerateMoves(b, -1).length;
  score += (redMob - blackMob) * 3;

  score += (redKings - blackKings) * 30;

  if (redMen + redKings === 0) return -100000;
  if (blackMen + blackKings === 0) return 100000;
  if (redMob === 0) return -99999;
  if (blackMob === 0) return 99999;

  return score;
}

// AI Quiescence
function aiQuiescence(b, alpha, beta, maximizing, qDepth) {
  const standPat = aiEvaluate(b);

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  if (qDepth <= 0) return standPat;

  const side = maximizing ? 1 : -1;
  const moves = aiGenerateMoves(b, side).filter(m => m.captures.length > 0);
  moves.sort((a, b) => b.captures.length - a.captures.length);

  for (const m of moves) {
    const nb = aiApplyMove(b, m);
    const score = aiQuiescence(nb, alpha, beta, !maximizing, qDepth - 1);
    if (maximizing) {
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    } else {
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
  }
  return maximizing ? alpha : beta;
}

// AI Minimax
function aiMinimax(b, depth, alpha, beta, maximizing) {
  if (depth === 0) {
    return aiQuiescence(b, alpha, beta, maximizing, AI_QUIESCE_DEPTH);
  }

  const side = maximizing ? 1 : -1;
  let moves = aiGenerateMoves(b, side);
  if (moves.length === 0) {
    return maximizing ? -100000 + depth : 100000 - depth;
  }

  moves.sort((a, b) => {
    const ca = a.captures.length, cb = b.captures.length;
    if (ca !== cb) return cb - ca;
    return 0;
  });

  if (maximizing) {
    let maxEval = -Infinity;
    for (const m of moves) {
      const nb = aiApplyMove(b, m);
      const ev = aiMinimax(nb, depth - 1, alpha, beta, false);
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      const nb = aiApplyMove(b, m);
      const ev = aiMinimax(nb, depth - 1, alpha, beta, true);
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// AI Get Best Move (Iterative Deepening)
function aiGetBestMove(b, aiSide) {
  const moves = aiGenerateMoves(b, aiSide);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  moves.sort((a, b) => b.captures.length - a.captures.length);

  let bestMove = moves[0];
  let bestScore = aiSide === 1 ? -Infinity : Infinity;

  for (let d = 1; d <= AI_MAX_DEPTH; d++) {
    let currentBest = null;
    let currentScore = aiSide === 1 ? -Infinity : Infinity;

    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    moves.sort((a, b) => b.captures.length - a.captures.length);

    for (const m of moves) {
      const nb = aiApplyMove(b, m);
      const score = aiMinimax(nb, d - 1, -Infinity, Infinity, aiSide === -1);
      if (aiSide === 1) {
        if (score > currentScore) {
          currentScore = score;
          currentBest = m;
        }
      } else {
        if (score < currentScore) {
          currentScore = score;
          currentBest = m;
        }
      }
    }

    if (currentBest) {
      bestMove = currentBest;
      bestScore = currentScore;
    }

    if (aiSide === 1 && bestScore >= 90000) break;
    if (aiSide === -1 && bestScore <= -90000) break;
  }
  return bestMove;
}

// Convert AI move format to our format
function convertAIMoveToOurFormat(aiMove) {
  if (!aiMove) return null;
  
  return {
    from: { row: aiMove.from.r, col: aiMove.from.c },
    to: { row: aiMove.to.r, col: aiMove.to.c },
    jump: aiMove.captures.length > 0,
    jumps: aiMove.captures.map(cap => ({ row: cap.r, col: cap.c })),
    promotion: aiMove.to.r === 0 || aiMove.to.r === 7
  };
}

// Execute AI move
function executeAIMove(move) {
  const { from, to, jump, jumps, promotion } = move;
  
  console.log('[AI] Executing move:', move);
  
  // Move the piece
  board[to.row][to.col] = board[from.row][from.col];
  board[from.row][from.col] = null;
  
  // Handle jumps - remove captured pieces
  if (jump && jumps && jumps.length > 0) {
    console.log('[AI] Capturing pieces:', jumps);
    for (const jumpPos of jumps) {
      console.log('[AI] Removing piece at:', jumpPos);
      board[jumpPos.row][jumpPos.col] = null;
    }
  }
  
  // Handle promotion
  if (promotion) {
    const piece = board[to.row][to.col];
    if (piece && !piece.king) {
      if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === 7)) {
        piece.king = true;
        console.log('[AI] Piece promoted to king');
      }
    }
  }
  
  // Update move history
  moveHistory.push(
    `${capitalize(currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${jump ? ' (jump)' : ''}${promotion ? ' (king)' : ''}`
  );
  
  // Switch turns
  currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
  isMyTurn = true;
  
  // Update UI
  lastMove = { from, to };
  renderBoard();
  highlightLastMove();
  updateStatus();
  checkGameOver();
}

// Main AI move function
function makeAIMove() {
  if (!isAIMode || gameEnded || currentPlayer !== aiColor) {
    console.log('[game.js] AI move check failed:', { isAIMode, gameEnded, currentPlayer, aiColor });
    return;
  }

  console.log('[game.js] AI making move with unbeatable minimax AI');

  // Convert our board to AI format
  const aiBoard = convertBoardToAIFormat(board);
  
  // Determine AI side: red = 1, black = -1
  const aiSide = aiColor === 'red' ? 1 : -1;
  
  // Get best move from AI
  const aiMove = aiGetBestMove(aiBoard, aiSide);
  
  if (!aiMove) {
    console.log('[game.js] AI has no moves');
    checkGameOver();
    return;
  }

  // Convert AI move to our format
  const ourMove = convertAIMoveToOurFormat(aiMove);
  
  if (!ourMove) {
    console.log('[game.js] Failed to convert AI move');
    return;
  }

  console.log('[game.js] AI selected move:', ourMove);

  // Execute the move
  executeAIMove(ourMove);
}

// --- Video Chat Functionality (PeerJS) ---
let peer = null;
let localStream = null;
let currentCall = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

// Video chat elements
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localPlaceholder = document.getElementById('local-placeholder');
const remotePlaceholder = document.getElementById('remote-placeholder');
const videoStatus = document.getElementById('video-status');
const startVideoBtn = document.getElementById('start-video-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const leaveVideoBtn = document.getElementById('leave-video-btn');

// Get peer ID from URL or generate new one
const urlParams = new URLSearchParams(window.location.search);
const remotePeerId = urlParams.get('peer');

// Initialize video chat button event listeners
function initializeVideoChatButtons() {
  startVideoBtn.addEventListener('click', startVideoChat);
  toggleVideoBtn.addEventListener('click', toggleVideo);
  toggleAudioBtn.addEventListener('click', toggleAudio);
  leaveVideoBtn.addEventListener('click', stopVideoChat);
}

// Start video chat with PeerJS
async function startVideoChat() {
  console.log('[game.js] Starting video chat with PeerJS');
  
  try {
    // Initialize PeerJS
    peer = new Peer();
    
    peer.on('open', (id) => {
      console.log('[game.js] My peer ID:', id);
      videoStatus.textContent = 'Video chat ready - share your URL with opponent';
      
      // Update URL with peer ID
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('peer', id);
      window.history.replaceState({}, '', currentUrl);
      
      // Update join URL display
      const joinUrlDiv = document.getElementById('join-url');
      if (joinUrlDiv) {
        joinUrlDiv.textContent = currentUrl.href;
      }
      
      // Show control buttons
      startVideoBtn.style.display = 'none';
      toggleVideoBtn.style.display = 'inline-block';
      toggleAudioBtn.style.display = 'inline-block';
      leaveVideoBtn.style.display = 'inline-block';
      
      // If remote peer ID in URL, connect to them
      if (remotePeerId && remotePeerId !== id) {
        connectToPeer(remotePeerId);
      }
    });
    
    peer.on('call', (call) => {
      console.log('[game.js] Incoming call from:', call.peer);
      answerCall(call);
    });
    
    peer.on('error', (err) => {
      console.error('[game.js] PeerJS error:', err);
      videoStatus.textContent = 'Video chat error: ' + err.type;
    });
    
    // Get local media stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: true
    });
    
    localVideo.srcObject = localStream;
    localVideo.play();
    
    hideLocalPlaceholder();
    showRemotePlaceholder();
    
  } catch (error) {
    console.error('[game.js] Failed to start video chat:', error);
    videoStatus.textContent = 'Failed to start video chat: ' + error.message;
    if (peer) {
      peer.destroy();
      peer = null;
    }
  }
}

// Connect to remote peer
function connectToPeer(peerId) {
  console.log('[game.js] Connecting to peer:', peerId);
  videoStatus.textContent = 'Connecting to opponent...';
  
  const call = peer.call(peerId, localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[game.js] Received remote stream');
    remoteVideo.srcObject = remoteStream;
    remoteVideo.play();
    hideRemotePlaceholder();
    videoStatus.textContent = 'Video chat connected!';
  });
  
  call.on('close', () => {
    console.log('[game.js] Call ended');
    videoStatus.textContent = 'Opponent disconnected';
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Answer incoming call
function answerCall(call) {
  videoStatus.textContent = 'Incoming call...';
  
  call.answer(localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[game.js] Call answered, received stream');
    remoteVideo.srcObject = remoteStream;
    remoteVideo.play();
    hideRemotePlaceholder();
    videoStatus.textContent = 'Video chat connected!';
  });
  
  call.on('close', () => {
    console.log('[game.js] Call ended');
    videoStatus.textContent = 'Opponent disconnected';
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Stop video chat
function stopVideoChat() {
  console.log('[game.js] Stopping video chat');
  
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  
  if (peer) {
    peer.destroy();
    peer = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (localVideo.srcObject) {
    localVideo.srcObject = null;
  }
  
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject = null;
  }
  
  // Update UI
  startVideoBtn.style.display = 'inline-block';
  toggleVideoBtn.style.display = 'none';
  toggleAudioBtn.style.display = 'none';
  leaveVideoBtn.style.display = 'none';
  videoStatus.textContent = 'Click Start to begin video chat';
  
  showLocalPlaceholder();
  showRemotePlaceholder();
}

// Toggle video
function toggleVideo() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled;
    videoTrack.enabled = isVideoEnabled;
    
    toggleVideoBtn.textContent = isVideoEnabled ? '🔴' : '📹';
    toggleVideoBtn.title = isVideoEnabled ? 'Turn off camera' : 'Turn on camera';
    
    if (isVideoEnabled) {
      toggleVideoBtn.classList.remove('muted');
      hideLocalPlaceholder();
    } else {
      toggleVideoBtn.classList.add('muted');
      showLocalPlaceholder();
    }
  }
}

// Toggle audio
function toggleAudio() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled;
    audioTrack.enabled = isAudioEnabled;
    
    toggleAudioBtn.textContent = isAudioEnabled ? '🔊' : '🔇';
    toggleAudioBtn.title = isAudioEnabled ? 'Mute microphone' : 'Unmute microphone';
    
    if (isAudioEnabled) {
      toggleAudioBtn.classList.remove('muted');
    } else {
      toggleAudioBtn.classList.add('muted');
    }
  }
}

// Leave video chat
function leaveVideoChat() {
  stopVideoChat();
}

function showLocalPlaceholder() {
  localPlaceholder.style.display = 'flex';
  localVideo.style.display = 'none';
}

function hideLocalPlaceholder() {
  localPlaceholder.style.display = 'none';
  localVideo.style.display = 'block';
}

function showRemotePlaceholder() {
  remotePlaceholder.style.display = 'flex';
  remoteVideo.style.display = 'none';
}

function hideRemotePlaceholder() {
  remotePlaceholder.style.display = 'none';
  remoteVideo.style.display = 'block';
}

// Initialize video chat buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeVideoChatButtons();
});
