const socket = io('https://multiplayer-checkers.onrender.com');

const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const lobbyStatus = document.getElementById('lobby-status');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeSpan = document.getElementById('room-code');

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

if (createBtn) {
  createBtn.onclick = () => {
    const code = randomRoomCode();
    socket.emit('createRoom', code);
    // Show the code for sharing
    if (roomCodeSpan && roomCodeDisplay) {
      roomCodeSpan.textContent = code;
      roomCodeDisplay.style.display = 'block';
    }
    if (lobbyStatus) lobbyStatus.textContent = 'Game created! Share the code with your friend.';
    // Go to room after a short delay
    setTimeout(() => {
      window.location.href = `room.html?room=${code}`;
    }, 1200);
  };
}

if (joinBtn) {
  joinBtn.onclick = () => {
    const code = roomInput.value.trim().toUpperCase();
    if (!code) {
      if (lobbyStatus) lobbyStatus.textContent = 'Please enter a room code.';
      return;
    }
    if (lobbyStatus) lobbyStatus.textContent = 'Joining game...';
    setTimeout(() => {
      window.location.href = `room.html?room=${code}`;
    }, 800);
  };
}