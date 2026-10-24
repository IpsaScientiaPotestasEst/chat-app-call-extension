const socket = io('https://chat-app-call-extension.onrender.com/');

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


const callBtn = document.getElementById('call-btn');
const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');

let peerConnection;
let targetSocketId;
let localStream;
let isMuted = false;

const config = {
  iceServers: [
    {
      urls: 'stun:://google.com'
    }
  ]
};

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


socket.on('start-call-initiation', (data) => {
  targetSocketId = data.to;
  logStatus('Secure terminal pipeline linked! Data node online.');
  
  matchmakerUi.style.display = 'none';
  chatUi.style.display = 'block';
  messageInput.focus();
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



async function initializeAudioCall() {
  logStatus('Requesting mic access hardware...');
  try {
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
      logStatus('Voice pipeline stream connected and active.');
    
      if (event.streams && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      } else {
        remoteAudio.srcObject = new MediaStream([event.track]);
      }
    };

 
    callBtn.style.display = 'none';
    muteBtn.style.display = 'block';
    hangupBtn.style.display = 'block';

  } catch (err) {
    
    logStatus(`Hardware block: ${err.message}`, true);
    console.error('Initialization Crash Log:', err);
  }
}

callBtn.addEventListener('click', async () => {
  logStatus('Initializing local media engines...');
  await initializeAudioCall();
  
  if (!peerConnection) {
    logStatus('Connection failed: Engine node not initialized.', true);
    return;
  }

  logStatus('Sending incoming call request to peer...');
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { sdp: offer, to: targetSocketId });
  } catch (offerErr) {
    logStatus(`Handshake generation failed: ${offerErr.message}`, true);
  }
});



muteBtn.addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  muteBtn.textContent = isMuted ? 'UNMUTE MIC' : 'MUTE MIC';
  muteBtn.style.background = isMuted ? '#ff9900' : '#ffcc00';
  logStatus(isMuted ? 'Microphone muted locally.' : 'Microphone transmission active.');
});


function terminateAudioCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  remoteAudio.srcObject = null;

  callBtn.style.display = 'block';
  muteBtn.style.display = 'none';
  hangupBtn.style.display = 'none';
  muteBtn.textContent = 'MUTE MIC';
  muteBtn.style.background = '#ffcc00';
  isMuted = false;
  
  logStatus('Audio node call disconnected. Text channel remains live.');
}

hangupBtn.addEventListener('click', () => {
  terminateAudioCall();
 
  socket.emit('send-chat-message', { text: '[System Notification: Voice call disconnected]', to: targetSocketId });
});



socket.on('offer', async (data) => {
  logStatus('Incoming connection request...');
  if (!peerConnection) await initializeAudioCall();
  
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
    console.error('Ice matching exception:', e);
  }
});

socket.emit('client-ready');
