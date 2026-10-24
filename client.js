const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://onrender.com';

const socket = io(BACKEND_URL);

const myCodeEl = document.getElementById('my-code');
const targetCodeInput = document.getElementById('target-code');
const connectBtn = document.getElementById('connect-btn');
const statusLog = document.getElementById('status-log');
const remoteAudio = document.getElementById('remote-audio');

const matchmakerUi = document.getElementById('matchmaker-ui');
const chatUi = document.getElementById('chat-ui');
const messageDisplay = document.getElementById('message-display');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let peerConnection;
let targetSocketId;
let localStream;

const config = { iceServers: [{ urls: 'stun:://google.com' }] };

function logStatus(message, isError = false) {
  statusLog.textContent = `> ${message}`;
  statusLog.style.borderColor = isError ? '#ff3333' : '#00ff66';
}

function appendMessage(text, type) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('msg', type);
  msgDiv.textContent = type === 'self' ? `[You]: ${text}` : `[Peer]: ${text}`;
  messageDisplay.appendChild(msgDiv);
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

socket.on('your-code', (code) => {
  myCodeEl.textContent = code;
  myCodeEl.classList.remove('loading-pulse');
  logStatus('Handshake signature configured. Share it with your peer.');
});

socket.on('error-message', (err) => logStatus(err, true));
socket.on('waiting-message', (msg) => logStatus(msg));

connectBtn.addEventListener('click', () => {
  const code = targetCodeInput.value.trim();
  if (code.length === 4) {
    logStatus('Hashing pair signatures...');
    socket.emit('submit-target-code', code);
  } else {
    logStatus('Invalid sequence length. Code must be 4 digits.', true);
  }
});


socket.on('start-call-initiation', async (data) => {
  targetSocketId = data.to;
  logStatus('Mutual match confirmed! Syncing text & audio engines...');
  

  matchmakerUi.style.display = 'none';
  chatUi.style.display = 'block';
  messageInput.focus();

  try {
    logStatus('Requesting mic access hardware...');
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    logStatus('Microphone linked. Injecting audio pipeline...');

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, to: targetSocketId });
      }
    };

    peerConnection.ontrack = (event) => {
      logStatus('Secure P2P audio pipeline linked! Chat & Call active.');
      if (event.streams && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      } else {
        remoteAudio.srcObject = new MediaStream([event.track]);
      }
    };

    if (data.initiator) {
      logStatus('Establishing encrypted secure channel handshake...');
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { sdp: offer, to: targetSocketId });
    }
  } catch (err) {
    logStatus(`Hardware block: ${err.name} - ${err.message}`, true);
    console.error('Audio engine track mismatch:', err);
  }
});


function transmitMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  appendMessage(text, 'self');
  socket.emit('send-chat-message', { text: text, to: targetSocketId });
  messageInput.value = '';
}

sendBtn.addEventListener('click', transmitMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') transmitMessage();
});

socket.on('receive-chat-message', (data) => {
  appendMessage(data.text, 'peer');
});


socket.on('offer', async (data) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { sdp: answer, to: targetSocketId });
});

socket.on('answer', async (data) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

socket.on('ice-candidate', async (data) => {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  } catch (e) {
    console.error('Error adding received ice candidate', e);
  }
});

socket.emit('client-ready');
