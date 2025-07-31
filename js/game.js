const socket = io('https://multiplayer-checkers.onrender.com');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');

// Always get assigned color and role from sessionStorage (set in room.js)
let myColor = sessionStorage.getItem('myAssignedColor');
let myRole = sessionStorage.getItem('myRole');
let mySocketId = null;

console.log('[game.js] Loaded. roomCode:', roomCode);
console.log('[game.js] myColor from sessionStorage:', myColor);
console.log('[game.js] myRole from sessionStorage:', myRole);

const boardSize = 8;
const boardDiv = document.getElementById('game-board');
const statusDiv = document.getElementById('game-status');
const printBtn = document.getElementById('print-btn');

// --- Move history panel ---
// Remove old moveHistoryList if present
let oldMoveHistoryList = document.getElementById('move-history');
if (oldMoveHistoryList && oldMoveHistoryList.tagName === 'UL') {
  oldMoveHistoryList.parentNode.removeChild(oldMoveHistoryList);
}

// Create styled move history panel if not present
let moveHistoryElem = document.getElementById('move-history');
if (!moveHistoryElem || moveHistoryElem.tagName === 'UL') {
  // Remove old UL if present
  if (moveHistoryElem && moveHistoryElem.tagName === 'UL') {
    moveHistoryElem.parentNode.removeChild(moveHistoryElem);
  }
  moveHistoryElem = document.createElement('div');
  moveHistoryElem.id = 'move-history';
  moveHistoryElem.style.width = '180px';
  moveHistoryElem.style.background = '#232323';
  moveHistoryElem.style.border = '1.5px solid #ffe082';
  moveHistoryElem.style.borderRadius = '10px';
  moveHistoryElem.style.boxShadow = '0 4px 16px #0007';
  moveHistoryElem.style.padding = '10px';
  moveHistoryElem.style.margin = '18px 0';
  moveHistoryElem.style.fontSize = '1em';
  moveHistoryElem.style.color = '#ffe082';
  moveHistoryElem.style.maxHeight = '384px';
  moveHistoryElem.style.overflowY = 'auto';
  moveHistoryElem.innerHTML = '<b>Move History</b><div id="move-history-list"></div>';
  // Insert after boardDiv
  if (boardDiv && boardDiv.parentNode) {
    boardDiv.parentNode.insertBefore(moveHistoryElem, boardDiv.nextSibling);
  }
}

// --- Move history panel logic ---
function renderMoveHistory() {
  if (!moveHistoryElem) {
    console.warn('[game.js] moveHistoryElem not found, skipping renderMoveHistory');
    return;
  }
  
  const list = moveHistoryElem.querySelector('#move-history-list');
  if (!list) {
    console.warn('[game.js] move-history-list not found, skipping renderMoveHistory');
    return;
  }
  
  list.innerHTML = '';
  let moves = moveHistory || [];
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.marginBottom = '2px';

    let moveNum = document.createElement('span');
    moveNum.textContent = (i / 2 + 1) + '.';
    moveNum.style.marginRight = '6px';
    moveNum.style.color = '#ffe082';

    // Convert move objects to notation
    let whiteMove = document.createElement('a');
    whiteMove.textContent = moves[i] ? moveToNotation(moves[i]) : '';
    whiteMove.style.cursor = 'pointer';
    whiteMove.style.color = '#fff';
    whiteMove.onclick = () => jumpToMove(i);

    let blackMove = document.createElement('a');
    blackMove.textContent = moves[i + 1] ? moveToNotation(moves[i + 1]) : '';
    blackMove.style.cursor = 'pointer';
    blackMove.style.color = '#fff';
    blackMove.onclick = () => jumpToMove(i + 1);

    row.appendChild(moveNum);
    row.appendChild(whiteMove);
    row.appendChild(document.createTextNode(' '));
    row.appendChild(blackMove);
    list.appendChild(row);
  }
}

// Helper to convert move object to notation
function moveToNotation(move) {
  if (!move) return '';
  // If move is already a string, return as is
  if (typeof move === 'string') return move;
  // If move is object: {from: {row, col}, to: {row, col}, ...}
  let from = move.from ? algebraic(move.from.row, move.from.col) : '';
  let to = move.to ? algebraic(move.to.row, move.to.col) : '';
  let promo = move.promotion ? '=' + move.promotion : '';
  return from + '-' + to + promo;
}

// Algebraic notation for checkers (A1-H8, bottom left is A1)
function algebraic(row, col) {
  // Red always at bottom, so row 7 is 1, row 0 is 8
  const file = String.fromCharCode('A'.charCodeAt(0) + col);
  const rank = (8 - row);
  return file + rank;
}

function jumpToMove(idx) {
  // Not implemented: would require server to send FENs or board states for each move.
  alert('Jump to move not implemented in this version.');
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
  socket.emit('leaveGame', { room: roomCode, color: myColor });
  window.location.href = 'lobby.html';
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
  // Join the game room and re-register color and role with server
  socket.emit('joinGame', { room: roomCode, color: myColor, role: myRole });
  console.log('[game.js] Emitted joinGame:', { room: roomCode, color: myColor, role: myRole });
});

// Listen for startGame with color assignment and first turn
socket.on('startGame', ({ colorAssignments, firstTurn, board: serverBoard, moveHistory: serverHistory, roles, lastMove: serverLastMove }) => {
  console.log('[game.js] startGame event received:', { colorAssignments, firstTurn, roles });
  // Assign my color if server sends it (should match sessionStorage)
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
  boardDiv.style.gridTemplate = `repeat(${boardSize}, 50px) / repeat(${boardSize}, 50px)`;

  // Always render red at the bottom, black at the top
  for (let displayRow = 0; displayRow < boardSize; displayRow++) {
    let row = boardSize - 1 - displayRow; // flip so red is always at the bottom
    for (let col = 0; col < boardSize; col++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((row + col) % 2 === 1 ? 'dark' : 'light');
      square.dataset.row = row;
      square.dataset.col = col;
      square.style.width = '50px';
      square.style.height = '50px';

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
        // Send this jump to server
        sendMoveToServer(from, to, move);
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
        // If not a jump, send the move to server (for normal moves)
        sendMoveToServer(from, to, move);
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
      renderBoard();
      highlightLastMove();
      updateStatus();
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
    room: roomCode,
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
  statusDiv.innerHTML = `
    <div style="font-size:1.5em;color:#ffd700;margin:18px 0 10px 0;">${message}</div>
    <div style="font-size:1.1em;color:#fff;">Your points: <b>${points}</b></div>
    <button id="leave-btn-final" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#7a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;">Back to Lobby</button>
  `;
  const leaveBtnFinal = document.getElementById('leave-btn-final');
  if (leaveBtnFinal) {
    leaveBtnFinal.onclick = () => {
      window.location.href = 'lobby.html';
    };
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
  if (!myColor) {
    statusDiv.textContent = "Spectator mode";
    return;
  }
  if (!gameStarted) {
    statusDiv.textContent = "Waiting for both players to be ready...";
    console.log('[game.js] Status: Waiting for both players to be ready...');
    return;
  }
  if (isMyTurn) {
    statusDiv.textContent = `Your turn (${myColor})`;
    console.log('[game.js] Status: Your turn', myColor);
  } else {
    statusDiv.textContent = `Opponent's turn (${currentPlayer})`;
    console.log('[game.js] Status: Opponent\'s turn', currentPlayer);
  }
}

// Leave game if window/tab closed
window.addEventListener('beforeunload', () => {
  console.log('[game.js] beforeunload: leaving game');
  socket.emit('leaveGame', { room: roomCode, color: myColor });
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
      socket.emit('chatMessage', { room: roomCode, msg });
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

// --- Video Chat Functionality ---
let videoChat = null; // Main video chat state
let localStream = null;
let remoteStream = null;
let mediaRecorder = null;
let videoChunks = [];
let isVideoEnabled = true;
let isAudioEnabled = true;
let videoInterval = null;

// Video chat elements
const videoChatToggleBtn = document.getElementById('video-chat-toggle-btn');
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localPlaceholder = document.getElementById('local-placeholder');
const remotePlaceholder = document.getElementById('remote-placeholder');
const videoStatus = document.getElementById('video-status');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const leaveVideoBtn = document.getElementById('leave-video-btn');
const minimizeBtn = document.getElementById('minimize-btn');

// Initialize video chat button event listeners
function initializeVideoChatButtons() {
  // Main toggle button
  videoChatToggleBtn.addEventListener('click', toggleVideoChat);
  
  // Control buttons
  toggleVideoBtn.addEventListener('click', toggleVideo);
  toggleAudioBtn.addEventListener('click', toggleAudio);
  leaveVideoBtn.addEventListener('click', leaveVideoChat);
  minimizeBtn.addEventListener('click', toggleMinimize);
}

// Main video chat toggle function
async function toggleVideoChat() {
  if (videoChat === null) {
    // Start video chat
    await startVideoChat();
  } else {
    // Stop video chat
    stopVideoChat();
  }
}

// Start video chat
async function startVideoChat() {
  console.log('[game.js] Starting video chat');
  
  try {
    // Initialize media stream
    await initializeVideoChat();
    
    // Update UI state
    videoChat = true;
    videoChatToggleBtn.classList.add('active');
    videoChatToggleBtn.textContent = '🔴';
    videoChatToggleBtn.title = 'Stop Video Chat';
    videoContainer.style.display = 'block';
    
    // Show placeholders
    showLocalPlaceholder();
    showRemotePlaceholder();
    
    videoStatus.textContent = 'Video chat ready - waiting for opponent...';
    
  } catch (error) {
    console.error('[game.js] Failed to start video chat:', error);
    videoStatus.textContent = 'Failed to start video chat';
    videoChat = null;
  }
}

// Stop video chat
function stopVideoChat() {
  console.log('[game.js] Stopping video chat');
  
  // Cleanup media
  cleanupVideoChat();
  
  // Update UI state
  videoChat = null;
  videoChatToggleBtn.classList.remove('active');
  videoChatToggleBtn.textContent = '📹';
  videoChatToggleBtn.title = 'Start Video Chat';
  videoContainer.style.display = 'none';
  
  // Notify server
  socket.emit('video-disabled', { room: roomCode });
}

// Initialize video chat media
async function initializeVideoChat() {
  console.log('[game.js] initializeVideoChat called');
  
  try {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not supported');
    }

    // Request camera and microphone access
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 120, max: 240 },
        height: { ideal: 90, max: 180 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // Display local video
    localVideo.srcObject = localStream;
    console.log('[game.js] Set localVideo.srcObject to stream');
    
    // Ensure video plays
    localVideo.onloadedmetadata = () => {
      console.log('[game.js] Local video metadata loaded');
      localVideo.play().catch(e => console.error('[game.js] Error playing local video:', e));
    };
    
    console.log('[game.js] Video chat initialized successfully');
    console.log('[game.js] Local stream tracks:', localStream.getTracks().map(t => t.kind));
    
    // Notify server that video is ready
    socket.emit('video-ready', { room: roomCode });
    
    // Start streaming
    startVideoStream();
    
  } catch (error) {
    console.error('[game.js] Error accessing media devices:', error);
    if (error.name === 'NotAllowedError') {
      videoStatus.textContent = 'Camera/microphone access denied - check permissions';
    } else if (error.name === 'NotFoundError') {
      videoStatus.textContent = 'No camera/microphone found';
    } else {
      videoStatus.textContent = 'Video chat not available';
    }
    throw error;
  }
}

// Start video streaming
function startVideoStream() {
  if (!localStream) return;
  
  try {
    // Create MediaRecorder
    mediaRecorder = new MediaRecorder(localStream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 100000 // Low bitrate for small video
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        // Send video data to opponent
        socket.emit('video-data', {
          room: roomCode,
          data: event.data
        });
      }
    };
    
    mediaRecorder.start(100); // Send data every 100ms
    console.log('[game.js] Video streaming started');
    
  } catch (error) {
    console.error('[game.js] Error starting video stream:', error);
    videoStatus.textContent = 'Video streaming failed';
  }
}

// Stop video streaming
function stopVideoStream() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
  
  console.log('[game.js] Video streaming stopped');
}

// Cleanup video chat
function cleanupVideoChat() {
  // Stop streaming
  stopVideoStream();
  
  // Stop all camera/microphone tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log('[game.js] Stopped track:', track.kind);
    });
    localStream = null;
  }
  
  // Clear videos
  if (localVideo.srcObject) {
    localVideo.srcObject = null;
  }
  if (remoteVideo.src) {
    URL.revokeObjectURL(remoteVideo.src);
    remoteVideo.src = '';
  }
  
  // Show placeholders
  showLocalPlaceholder();
  showRemotePlaceholder();
  
  console.log('[game.js] Video chat cleaned up');
}

// Toggle video (camera on/off)
function toggleVideo() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled;
    videoTrack.enabled = isVideoEnabled;
    
    // Update button
    toggleVideoBtn.textContent = isVideoEnabled ? '🔴' : '📹';
    toggleVideoBtn.title = isVideoEnabled ? 'Turn off camera' : 'Turn on camera';
    
    if (isVideoEnabled) {
      toggleVideoBtn.classList.remove('muted');
      hideLocalPlaceholder();
    } else {
      toggleVideoBtn.classList.add('muted');
      showLocalPlaceholder();
    }
    
    console.log('[game.js] Video toggled:', isVideoEnabled);
  }
}

// Toggle audio (microphone on/off)
function toggleAudio() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled;
    audioTrack.enabled = isAudioEnabled;
    
    // Update button
    toggleAudioBtn.textContent = isAudioEnabled ? '🔊' : '🔇';
    toggleAudioBtn.title = isAudioEnabled ? 'Mute microphone' : 'Unmute microphone';
    
    if (isAudioEnabled) {
      toggleAudioBtn.classList.remove('muted');
    } else {
      toggleAudioBtn.classList.add('muted');
    }
    
    console.log('[game.js] Audio toggled:', isAudioEnabled);
  }
}

// Leave video chat
function leaveVideoChat() {
  console.log('[game.js] Leaving video chat');
  stopVideoChat();
}

// Toggle minimize
function toggleMinimize() {
  const isMinimized = videoContainer.classList.contains('minimized');
  
  if (isMinimized) {
    videoContainer.classList.remove('minimized');
    minimizeBtn.textContent = '−';
    minimizeBtn.title = 'Minimize';
  } else {
    videoContainer.classList.add('minimized');
    minimizeBtn.textContent = '+';
    minimizeBtn.title = 'Expand';
  }
}

// Show local placeholder
function showLocalPlaceholder() {
  localPlaceholder.style.display = 'flex';
  localVideo.style.display = 'none';
}

// Hide local placeholder
function hideLocalPlaceholder() {
  localPlaceholder.style.display = 'none';
  localVideo.style.display = 'block';
}

// Show remote placeholder
function showRemotePlaceholder() {
  remotePlaceholder.style.display = 'flex';
  remoteVideo.style.display = 'none';
}

// Hide remote placeholder
function hideRemotePlaceholder() {
  remotePlaceholder.style.display = 'none';
  remoteVideo.style.display = 'block';
}

// Handle incoming video data
socket.on('video-data', ({ data, fromId }) => {
  if (fromId === socket.id) return; // Don't display our own video
  
  try {
    // Create blob from video data
    const blob = new Blob([data], { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(blob);
    
    // Display remote video
    remoteVideo.src = videoUrl;
    remoteVideo.onloadedmetadata = () => {
      remoteVideo.play().catch(e => console.error('[game.js] Error playing remote video:', e));
      hideRemotePlaceholder();
    };
    
    // Clean up old URL
    remoteVideo.onended = () => {
      URL.revokeObjectURL(videoUrl);
    };
    
    videoStatus.textContent = 'Video chat connected!';
    
  } catch (error) {
    console.error('[game.js] Error handling video data:', error);
  }
});

// Handle opponent turning off their camera
socket.on('video-disabled', ({ playerId }) => {
  console.log('[game.js] Opponent disabled video:', playerId);
  videoStatus.textContent = 'Opponent left video chat';
  
  // Clear remote video and show placeholder
  if (remoteVideo.src) {
    URL.revokeObjectURL(remoteVideo.src);
    remoteVideo.src = '';
  }
  showRemotePlaceholder();
});

// Handle opponent video ready
socket.on('opponent-video-ready', ({ playerId }) => {
  console.log('[game.js] Opponent video ready:', playerId);
  videoStatus.textContent = 'Opponent joined video chat';
  
  if (videoChat && localStream) {
    startVideoStream();
  }
});

// Initialize video chat buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeVideoChatButtons();
});

// Initialize video chat when game starts (optional auto-start)
socket.on('startGame', (data) => {
  console.log('[game.js] Game started, video chat ready');
  console.log('[game.js] startGame data:', data);
  
  // Video chat is now available but not auto-started
  // Users can click the floating button to start
});