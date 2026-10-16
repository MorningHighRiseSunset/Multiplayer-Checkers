const socket = io('https://multiplayer-checkers.onrender.com', {
  transports: ['websocket', 'polling']
});

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');

// Game state
let myColor = null;
let myRole = null;
let mySocketId = null;
let currentRoom = null;

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
  if (roomCode) {
    // Join existing room
    currentRoom = roomCode;
    socket.emit('joinRoom', currentRoom);
    console.log('[game.js] Joining existing room:', currentRoom);
  } else {
    // Create new room
    currentRoom = generateRoomCode();
    socket.emit('createRoom', currentRoom);
    socket.emit('joinRoom', currentRoom);
    
    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    window.history.replaceState({}, '', url);
    
    // Update join URL display
    if (joinUrlDiv) {
      joinUrlDiv.textContent = url.href;
    }
    
    console.log('[game.js] Created new room:', currentRoom);
  }
}

// Handle start game
socket.on('startGame', ({ colorAssignments, firstTurn, board: serverBoard, moveHistory: serverHistory, roles, lastMove: serverLastMove }) => {
  console.log('[game.js] startGame event received:', { colorAssignments, firstTurn, roles });
  
  // Assign my color from server
  if (colorAssignments && socket.id in colorAssignments) {
    myColor = colorAssignments[socket.id];
    sessionStorage.setItem('myAssignedColor', myColor);
    console.log('[game.js] Assigned myColor from server:', myColor);
  }
  if (roles && roles[socket.id]) {
    myRole = roles[socket.id];
    sessionStorage.setItem('myRole', myRole);
    console.log('[game.js] Assigned myRole from server:', myRole);
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
});

// Handle player joined
socket.on('playerJoined', ({ role }) => {
  console.log('[game.js] playerJoined:', role);
  statusDiv.textContent = `${role} joined - starting game...`;
});

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
  socket.emit('leaveGame', { room: currentRoom || roomCode, color: myColor });
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
socket.on('connect', () => {
  mySocketId = socket.id;
  console.log('[game.js] Connected to server. socket.id:', mySocketId);
  
  // Initialize room
  initializeRoom();
});

// --- Updated syncBoard to animate opponent's moves step-by-step ---
socket.on('syncBoard', ({ board: serverBoard, currentPlayer: serverCurrent, moveHistory: serverHistory, lastMove: serverLastMove, color, role }) => {
  console.log('[game.js] syncBoard event received');
  // If this is not my move, animate the opponent's move
  const isOpponentMove = (myColor !== currentPlayer);
  if (serverLastMove && isOpponentMove) {
    animateMove(serverLastMove.from, serverLastMove.to, () => {
      if (serverBoard) board = JSON.parse(JSON.stringify(serverBoard));
      if (serverCurrent) currentPlayer = serverCurrent;
      if (serverHistory) moveHistory = [...serverHistory];
      lastMove = serverLastMove;
      selected = null;
      validMoves = [];
      gameStarted = true;
      isMyTurn = (myColor === currentPlayer);
      renderBoard();
      renderMoveHistory();
      highlightLastMove();
      updateStatus();
      checkGameOver();
    });
  } else {
    if (serverBoard) board = JSON.parse(JSON.stringify(serverBoard));
    if (serverCurrent) currentPlayer = serverCurrent;
    if (serverHistory) moveHistory = [...serverHistory];
    if (serverLastMove) lastMove = serverLastMove;
    else lastMove = null;
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
});

// Listen for opponent leaving
socket.on('opponentLeft', () => {
  console.log('[game.js] opponentLeft event received');
  // Calculate points for the player who stayed
  const myPoints = countPieces(myColor);
  showEndGameScreen(`Opponent left. You win!`, myPoints);
});

// Listen for game reset
socket.on('resetGame', () => {
  console.log('[game.js] resetGame event received');
  initBoard();
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

  // Only allow selecting your own color and only if it's your turn
  if (piece && piece.color === myColor && piece.color === currentPlayer) {
    selected = { row, col };
    validMoves = getValidMoves(row, col, hasAnyJumps(currentPlayer));
    renderBoard();
    highlightLastMove();
    return;
  }

  if (selected && validMoves.some(m => m.row === row && m.col === col)) {
    const move = validMoves.find(m => m.row === row && m.col === col);
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
  socket.emit('move', {
    room: currentRoom || roomCode,
    from,
    to,
    move
  });
  isMyTurn = false;
  updateStatus();
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
    statusDiv.textContent = "Waiting for opponent to join...";
    console.log('[game.js] Status: Waiting for opponent to join...');
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

// Leave game if window/tab closed
window.addEventListener('beforeunload', () => {
  console.log('[game.js] beforeunload: leaving game');
  socket.emit('leaveGame', { room: currentRoom || roomCode, color: myColor });
});

// --- Chat box logic ---
if (chatForm && chatInput && chatMessages) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      // Use myRole if available, else fallback to "You"
      const senderLabel = myRole ? myRole : "You";
      appendChatMessage(senderLabel, msg);
      socket.emit('chatMessage', { room: currentRoom || roomCode, msg });
      chatInput.value = '';
      console.log('[game.js] Chat message sent:', msg);
    }
  });

  socket.on('chatMessage', ({ sender, msg }) => {
    appendChatMessage(sender, msg);
    console.log('[game.js] Chat message received:', sender, msg);
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

// --- AI Logic ---
function makeAIMove() {
  if (!isAIMode || gameEnded || currentPlayer !== aiColor) {
    console.log('[game.js] AI move check failed:', { isAIMode, gameEnded, currentPlayer, aiColor });
    return;
  }

  console.log('[game.js] AI making move');

  // Get all possible moves for AI
  let allMoves = [];
  let allJumps = [];

  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      const piece = board[row][col];
      if (piece && piece.color === aiColor) {
        const moves = getValidMoves(row, col, false);
        const jumps = getValidMoves(row, col, true);

        moves.forEach(move => {
          allMoves.push({
            from: { row, col },
            to: { row: move.row, col: move.col },
            move: move
          });
        });

        jumps.forEach(move => {
          allJumps.push({
            from: { row, col },
            to: { row: move.row, col: move.col },
            move: move
          });
        });
      }
    }
  }

  // Prefer jumps if available
  const movesToConsider = allJumps.length > 0 ? allJumps : allMoves;

  if (movesToConsider.length === 0) {
    console.log('[game.js] AI has no moves');
    return;
  }

  // Use smart AI instead of random move
  const bestMove = getBestMove(movesToConsider, board, aiColor, myColor);

  console.log('[game.js] AI selected move:', bestMove);

  // Execute the move
  lastMove = { from: bestMove.from, to: bestMove.to };
  performMoveWithAnimation(bestMove.from, bestMove.to, bestMove.move, () => {
    currentPlayer = 'black'; // Switch to player's turn
    isMyTurn = true;
    renderBoard();
    highlightLastMove();
    updateStatus();
    checkGameOver();
  });
}

// Smart AI: Evaluate moves and choose the best one
function getBestMove(moves, currentBoard, aiColor, playerColor) {
  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const score = evaluateMove(move, currentBoard, aiColor, playerColor);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// Evaluate a single move's strategic value
function evaluateMove(move, board, aiColor, playerColor) {
  let score = 0;
  const { from, to, move: moveData } = move;

  // HEAVILY penalize moves that result in immediate capture
  if (canBeCapturedAt(to.row, to.col, board, playerColor)) {
    score -= 200; // Massive penalty for suicidal moves
    console.log('[AI] Move is suicidal - can be captured at destination');
    return score; // Return immediately, this move is terrible
  }

  // Prioritize jumps (capturing pieces)
  if (moveData.jumps && moveData.jumps.length > 0) {
    score += 100 * moveData.jumps.length;
  }

  // Prefer getting kings
  if (moveData.promotion) {
    score += 50;
  }

  // Control the center (positions 3,4 in rows and cols)
  const centerBonus = (3 - Math.abs(3 - to.row)) + (3 - Math.abs(3 - to.col));
  score += centerBonus * 2;

  // Avoid moving to edge positions (more vulnerable)
  if (to.col === 0 || to.col === 7) {
    score -= 5;
  }

  // Prefer advancing pieces (for non-kings)
  const piece = board[from.row][from.col];
  if (piece && !piece.king) {
    if (aiColor === 'red') {
      // Red moves "up" (decreasing row numbers)
      score += (from.row - to.row) * 3;
    } else {
      // Black moves "down" (increasing row numbers)
      score += (to.row - from.row) * 3;
    }
  }

  // Keep back row pieces protected initially
  if (from.row === 0 || from.row === 7) {
    score -= 3;
  }

  // Add some randomness to make AI less predictable
  score += Math.random() * 5;

  return score;
}

// Evaluate how safe a position is from opponent attacks
function evaluatePositionSafety(row, col, board, opponentColor) {
  let safetyScore = 0;

  // Check if this position can be immediately captured
  const opponentMoves = getAdjacentOpponentMoves(row, col, board, opponentColor);
  if (opponentMoves.length > 0) {
    safetyScore -= 20 * opponentMoves.length; // Penalize dangerous positions
  } else {
    safetyScore += 10; // Reward safe positions
  }

  // Check if this position can attack opponent pieces
  const attackMoves = getAttackMovesFromPosition(row, col, board, opponentColor);
  if (attackMoves.length > 0) {
    safetyScore += 15 * attackMoves.length; // Reward attacking positions
  }

  return safetyScore;
}

// Get opponent moves that could capture a piece at given position
function getAdjacentOpponentMoves(row, col, board, opponentColor) {
  const opponentMoves = [];
  const directions = opponentColor === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];

  for (const [dr, dc] of directions) {
    const attackRow = row + dr;
    const attackCol = col + dc;

    if (isValidPosition(attackRow, attackCol)) {
      const piece = board[attackRow][attackCol];
      if (piece && piece.color === opponentColor) {
        // Check if this opponent piece can jump to our position
        const jumpRow = row - dr;
        const jumpCol = col - dc;
        if (isValidPosition(jumpRow, jumpCol) && !board[jumpRow][jumpCol]) {
          opponentMoves.push({ from: { row: attackRow, col: attackCol }, to: { row: jumpRow, col: jumpCol } });
        }
      }
    }
  }

  return opponentMoves;
}

// Get attack moves from a given position
function getAttackMovesFromPosition(row, col, board, opponentColor) {
  const attackMoves = [];
  const piece = board[row][col];
  if (!piece) return attackMoves;

  const directions = piece.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
    (piece.color === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);

  for (const [dr, dc] of directions) {
    const jumpRow = row + dr * 2;
    const jumpCol = col + dc * 2;
    const midRow = row + dr;
    const midCol = col + dc;

    if (isValidPosition(jumpRow, jumpCol) && isValidPosition(midRow, midCol)) {
      const midPiece = board[midRow][midCol];
      if (midPiece && midPiece.color === opponentColor && !board[jumpRow][jumpCol]) {
        attackMoves.push({ from: { row, col }, to: { row: jumpRow, col: jumpCol } });
      }
    }
  }

  return attackMoves;
}

// Check if position is valid on the board
function isValidPosition(row, col) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

// Check if a piece at given position can be captured by opponent
function canBeCapturedAt(row, col, board, opponentColor) {
  const opponentDirections = opponentColor === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  
  for (const [dr, dc] of opponentDirections) {
    const attackRow = row + dr;
    const attackCol = col + dc;
    const jumpRow = row - dr;
    const jumpCol = col - dc;
    
    if (isValidPosition(attackRow, attackCol) && isValidPosition(jumpRow, jumpCol)) {
      const attacker = board[attackRow][attackCol];
      const landingSpot = board[jumpRow][jumpCol];
      
      if (attacker && attacker.color === opponentColor && !landingSpot) {
        return true; // This piece can be captured
      }
    }
  }
  
  return false; // Safe from immediate capture
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
