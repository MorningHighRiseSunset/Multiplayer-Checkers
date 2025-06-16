const socket = io('https://multiplayer-checkers.onrender.com');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');

let myColorPick = null;
let myAssignedColor = null;
let myRole = null;

const colorButtons = document.querySelectorAll('.color-btn');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('room-status');
const roomCodeDiv = document.getElementById('room-code');

// Show only the room code, copyable
if (roomCodeDiv && roomCode) {
  roomCodeDiv.innerHTML = `
    <span style="color:#ffd700;font-weight:bold;">Room code:</span>
    <input type="text" value="${roomCode}" readonly style="width:120px;margin-left:8px;background:#222;color:#ffd700;border:1px solid #ffd700;border-radius:5px;padding:3px 6px;font-size:1em;text-align:center;">
  `;
}

// Pick color
colorButtons.forEach(btn => {
  btn.onclick = () => {
    myColorPick = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    colorButtons.forEach(b => b.disabled = true);
    btn.classList.add('selected');
    statusDiv.textContent = `You picked ${myColorPick}`;
    readyBtn.disabled = false;
  };
});

// Listen for color picked
socket.on('colorPicked', ({ color }) => {
  statusDiv.textContent = `A player picked ${color}`;
});

// Listen for room state updates (for status dots)
socket.on('roomState', ({ roles, colors }) => {
  // Reset dots
  const dot1 = document.getElementById('dot-player1');
  const dot2 = document.getElementById('dot-player2');
  if (dot1) dot1.classList.remove('active');
  if (dot2) dot2.classList.remove('active');
  for (const [sockId, role] of Object.entries(roles)) {
    if (role === 'Player 1' && dot1) dot1.classList.add('active');
    if (role === 'Player 2' && dot2) dot2.classList.add('active');
  }
});

// Ready button
readyBtn.onclick = () => {
  if (!myColorPick) {
    statusDiv.textContent = "Pick a color first!";
    return;
  }
  socket.emit('playerReady', { room: roomCode, color: myColorPick });
  readyBtn.disabled = true;
  statusDiv.textContent = "Waiting for other player...";
};

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode });
  sessionStorage.removeItem('myAssignedColor');
  sessionStorage.removeItem('myRole');
  sessionStorage.removeItem('startFirstTurn');
  window.location.href = 'lobby.html';
};

// Listen for both players ready and color assignments
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  myAssignedColor = colorAssignments[socket.id];
  myRole = roles[socket.id];
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  window.location.href = `game.html?room=${roomCode}`;
});

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  statusDiv.textContent = `Opponent is ready (${color})`;
});

// Listen for both players picked
socket.on('bothPicked', () => {
  statusDiv.textContent = "Both players picked colors. Click Ready!";
});

// Listen for both players ready
socket.on('bothReady', () => {
  statusDiv.textContent = "Both players are ready. Starting game...";
});

// Listen for player joined/left
socket.on('playerJoined', ({ role }) => {
  statusDiv.textContent = `${role} joined the room.`;
});
socket.on('playerLeft', ({ role }) => {
  statusDiv.textContent = `${role} left the room.`;
});

// Show error if both pick the same color
socket.on('roomStatus', ({ msg }) => {
  statusDiv.textContent = msg;
});

// On page load, join the room
socket.emit('joinRoom', roomCode);

// --- Chat box logic ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatForm && chatInput && chatMessages) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      const senderLabel = myRole ? myRole : "You";
      appendChatMessage(senderLabel, msg);
      socket.emit('chatMessage', { room: roomCode, msg });
      chatInput.value = '';
    }
  });

  socket.on('chatMessage', ({ sender, msg }) => {
    appendChatMessage(sender, msg);
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}