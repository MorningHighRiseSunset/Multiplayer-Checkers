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

// Helper: Validate room code format
function isValidRoomCode(code) {
  return /^[A-Z2-9]{6,10}$/.test(code);
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
    if (!isValidRoomCode(code)) {
      if (lobbyStatus) lobbyStatus.textContent = 'Invalid room code format.';
      return;
    }
    lobbyStatus.textContent = 'Checking room...';

    // Try to connect to the room and check if it exists before redirecting
    socket.emit('joinRoom', code);

    // Listen for room state or error just once
    const handleRoomState = (state) => {
      if (state && state.roles && Object.keys(state.roles).length > 0) {
        lobbyStatus.textContent = 'Joining game...';
        setTimeout(() => {
          window.location.href = `room.html?room=${code}`;
        }, 600);
      } else {
        lobbyStatus.textContent = 'Room not found or not available.';
      }
      socket.off('roomState', handleRoomState);
      socket.off('roomStatus', handleRoomStatus);
    };

    const handleRoomStatus = ({ msg }) => {
      lobbyStatus.textContent = msg || 'Room not found or not available.';
      socket.off('roomState', handleRoomState);
      socket.off('roomStatus', handleRoomStatus);
    };

    socket.once('roomState', handleRoomState);
    socket.once('roomStatus', handleRoomStatus);

    // Timeout fallback in case no response
    setTimeout(() => {
      lobbyStatus.textContent = 'Room not found or not available.';
      socket.off('roomState', handleRoomState);
      socket.off('roomStatus', handleRoomStatus);
    }, 2500);
  };
}