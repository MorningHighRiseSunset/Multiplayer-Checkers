// --- Lobby Logic with Socket.IO and Animated Background ---

// Add Socket.IO client (ensure <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script> is in your HTML)
const socket = io('https://multiplayer-checkers.onrender.com'); // Change to your deployed server URL

// Animated background: floating checkers and tiles
const bg = document.getElementById('floating-bg');
function randomBetween(a, b) { return a + Math.random() * (b - a); }

// Floating checkers
for (let i = 0; i < 12; i++) {
  const checker = document.createElement('div');
  checker.className = 'floating-checker ' + (Math.random() > 0.5 ? 'red' : 'black');
  const size = randomBetween(32, 54);
  checker.style.width = checker.style.height = size + 'px';
  checker.style.left = randomBetween(0, 95) + 'vw';
  checker.style.top = randomBetween(0, 90) + 'vh';
  checker.style.animationDuration = randomBetween(8, 18) + 's';
  checker.style.opacity = randomBetween(0.13, 0.22);
  checker.style.animationDelay = randomBetween(0, 8) + 's';
  bg.appendChild(checker);
}

// Floating tiles
for (let i = 0; i < 10; i++) {
  const tile = document.createElement('div');
  tile.className = 'floating-tile ' + (Math.random() > 0.5 ? 'dark' : 'light');
  tile.style.left = randomBetween(0, 96) + 'vw';
  tile.style.top = randomBetween(0, 92) + 'vh';
  tile.style.animationDuration = randomBetween(12, 22) + 's';
  tile.style.opacity = randomBetween(0.10, 0.18);
  tile.style.animationDelay = randomBetween(0, 10) + 's';
  bg.appendChild(tile);
}

// Lobby UI logic
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const shareLink = document.getElementById('share-link');
const lobbyStatus = document.getElementById('lobby-status');

function randomRoomCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Create Game
createBtn.onclick = () => {
  const code = randomRoomCode();
  socket.emit('createRoom', code);
  roomInput.value = code;
  lobbyStatus.textContent = 'Game created! Share the code with your friend.';
  setTimeout(() => {
    window.location.href = `room.html?room=${code}`;
  }, 1200);
};

// Join Game
joinBtn.onclick = () => {
  const code = roomInput.value.trim();
  if (!code) {
    lobbyStatus.textContent = 'Please enter a game code.';
    return;
  }
  // Optionally, notify server a player is joining
  socket.emit('joinRoom', code);
  window.location.href = `room.html?room=${code}`;
};