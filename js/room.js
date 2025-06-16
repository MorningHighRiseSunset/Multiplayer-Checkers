// --- Multiplayer Room Logic with Socket.IO ---

// Add Socket.IO client (ensure <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script> is in your HTML)
const socket = io('https://multiplayer-checkers.onrender.com'); // Change to your deployed server URL

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room') || 'UNKNOWN';

document.getElementById('room-code').textContent = `Room Code: ${roomCode}`;

const pickBtns = document.querySelectorAll('.pick-btn');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomStatus = document.getElementById('room-status');
const playerStatus = {
  red: document.querySelector('#player-red .status'),
  black: document.querySelector('#player-black .status')
};

let myColor = null;
let opponentColor = null;
let iAmReady = false;
let opponentReady = false;

// Join the room
socket.emit('joinRoom', roomCode);

// Handle color pick
pickBtns.forEach(btn => {
  btn.onclick = () => {
    myColor = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColor });
    pickBtns.forEach(b => b.disabled = true);
    btn.textContent = "You";
    playerStatus[myColor].textContent = "You picked this!";
    roomStatus.textContent = "Waiting for opponent to join and pick...";
  };
});

// Listen for color pick updates
socket.on('colorPicked', ({ color, byMe }) => {
  if (byMe) return; // Already handled above
  opponentColor = color;
  pickBtns.forEach(b => {
    if (b.dataset.color === color) {
      b.disabled = true;
      playerStatus[color].textContent = "Opponent picked this!";
      b.textContent = "Opponent";
    }
  });
  // Enable ready if you picked and opponent picked
  if (myColor && opponentColor && myColor !== opponentColor) {
    readyBtn.disabled = false;
    roomStatus.textContent = "Both players picked! Click Ready when ready.";
  }
});

// Listen for both colors picked (for the player who picks second)
socket.on('bothPicked', () => {
  if (myColor && opponentColor && myColor !== opponentColor) {
    readyBtn.disabled = false;
    roomStatus.textContent = "Both players picked! Click Ready when ready.";
  }
});

// Ready logic
readyBtn.onclick = () => {
  iAmReady = true;
  readyBtn.disabled = true;
  socket.emit('playerReady', { room: roomCode, color: myColor });
  roomStatus.textContent = "Waiting for opponent to be ready...";
};

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  opponentReady = true;
  playerStatus[color].textContent = "Opponent is ready!";
  if (iAmReady) {
    roomStatus.textContent = "Both players ready! Starting game...";
    setTimeout(() => {
      window.location.href = `game.html?room=${roomCode}&color=${myColor}`;
    }, 1200);
  }
});

// Listen for both ready (for the player who is second to be ready)
socket.on('bothReady', () => {
  roomStatus.textContent = "Both players ready! Starting game...";
  setTimeout(() => {
    window.location.href = `game.html?room=${roomCode}&color=${myColor}`;
  }, 1200);
});

// Listen for opponent leaving
socket.on('opponentLeft', () => {
  alert('Opponent left the room.');
  window.location.href = 'lobby.html';
});

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode, color: myColor });
  window.location.href = "lobby.html";
};

// On disconnect, clean up
window.addEventListener('beforeunload', () => {
  socket.emit('leaveRoom', { room: roomCode, color: myColor });
});