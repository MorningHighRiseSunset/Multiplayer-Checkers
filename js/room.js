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

console.log('[room.js] Loaded. roomCode:', roomCode);

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
    console.log('[room.js] Color picked:', myColorPick);
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    colorButtons.forEach(b => b.disabled = true);
    btn.classList.add('selected');
    statusDiv.textContent = `You picked ${myColorPick}`;
    readyBtn.disabled = false;
    // Save color pick in sessionStorage for redundancy
    sessionStorage.setItem('myColorPick', myColorPick);
  };
});

// Listen for color picked
socket.on('colorPicked', ({ color }) => {
  console.log('[room.js] colorPicked event:', color);
  statusDiv.textContent = `A player picked ${color}`;
});

// Listen for room state updates (for status dots)
socket.on('roomState', ({ roles, colors }) => {
  console.log('[room.js] roomState event:', { roles, colors });
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
  // Always check color pick before ready
  myColorPick = myColorPick || sessionStorage.getItem('myColorPick');
  if (!myColorPick) {
    statusDiv.textContent = "Pick a color first!";
    console.log('[room.js] Tried to ready without picking color');
    return;
  }
  // Save color pick again for redundancy
  sessionStorage.setItem('myColorPick', myColorPick);
  console.log('[room.js] Ready clicked. Emitting playerReady:', { room: roomCode, color: myColorPick });
  socket.emit('playerReady', { room: roomCode, color: myColorPick });
  readyBtn.disabled = true;
  statusDiv.textContent = "Waiting for other player...";
};

// Leave button
leaveBtn.onclick = () => {
  console.log('[room.js] Leave Room clicked');
  socket.emit('leaveRoom', { room: roomCode });
  sessionStorage.removeItem('myAssignedColor');
  sessionStorage.removeItem('myRole');
  sessionStorage.removeItem('startFirstTurn');
  sessionStorage.removeItem('myColorPick');
  window.location.href = 'lobby.html';
};

// Listen for both players ready and color assignments
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  console.log('[room.js] startGame event:', { colorAssignments, firstTurn, roles, mySocketId: socket.id });
  myAssignedColor = colorAssignments[socket.id];
  myRole = roles[socket.id];
  // Fallback: If not found, try to match by color pick
  if ((!myAssignedColor || !myRole) && colorAssignments) {
    for (const [id, color] of Object.entries(colorAssignments)) {
      if (color === myColorPick) {
        myAssignedColor = color;
        myRole = roles[id];
        break;
      }
    }
  }
  // Save to sessionStorage
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  console.log('[room.js] Assigned color:', myAssignedColor, 'Assigned role:', myRole);
  // Double-check before redirect
  if (myAssignedColor && myRole) {
    console.log('[room.js] Redirecting to game.html with room:', roomCode);
    window.location.href = `game.html?room=${roomCode}`;
  } else {
    statusDiv.textContent = "Error: Could not assign color/role. Please rejoin the room.";
    console.error('[room.js] ERROR: Could not assign color/role.', { colorAssignments, roles, myColorPick });
  }
});

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  console.log('[room.js] opponentReady event:', color);
  statusDiv.textContent = `Opponent is ready (${color})`;
});

// Listen for both players picked
socket.on('bothPicked', () => {
  console.log('[room.js] bothPicked event');
  statusDiv.textContent = "Both players picked colors. Click Ready!";
});

// Listen for both players ready
socket.on('bothReady', () => {
  console.log('[room.js] bothReady event');
  statusDiv.textContent = "Both players are ready. Waiting for server to start the game...";
  // Add a log in case startGame doesn't arrive soon
  setTimeout(() => {
    if (!sessionStorage.getItem('myAssignedColor') || !sessionStorage.getItem('myRole')) {
      console.warn('[room.js] Warning: Still waiting for startGame event after 3 seconds.');
      statusDiv.textContent = "Still waiting for server to start the game... If this takes too long, try reloading.";
    }
  }, 3000);
});

// Listen for player joined/left
socket.on('playerJoined', ({ role }) => {
  console.log('[room.js] playerJoined event:', role);
  statusDiv.textContent = `${role} joined the room.`;
});
socket.on('playerLeft', ({ role }) => {
  console.log('[room.js] playerLeft event:', role);
  statusDiv.textContent = `${role} left the room.`;
});

// Show error if both pick the same color
socket.on('roomStatus', ({ msg }) => {
  console.log('[room.js] roomStatus event:', msg);
  statusDiv.textContent = msg;
});

// On page load, join the room
console.log('[room.js] Emitting joinRoom:', roomCode);
socket.emit('joinRoom', roomCode);

// Handle socket reconnect (e.g. after network blip or tab reload)
socket.on('connect', () => {
  console.log('[room.js] Socket connected:', socket.id);
  // Optionally, re-emit color pick if we have it
  const storedColor = sessionStorage.getItem('myColorPick');
  if (storedColor && !myColorPick) {
    myColorPick = storedColor;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    console.log('[room.js] Re-emitted pickColor after reconnect:', myColorPick);
  }
});

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
      console.log('[room.js] Chat message sent:', msg);
    }
  });

  socket.on('chatMessage', ({ sender, msg }) => {
    appendChatMessage(sender, msg);
    console.log('[room.js] Chat message received:', sender, msg);
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Extra: log if the page is unloaded before redirecting
window.addEventListener('beforeunload', () => {
  if (!sessionStorage.getItem('myAssignedColor') || !sessionStorage.getItem('myRole')) {
    console.warn('[room.js] Unloading room page before startGame event. This may cause issues.');
  }
});