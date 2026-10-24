const socket = io(window.location.origin);

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

function logStatus(message, isError = false) {
  if (statusLog) {
    statusLog.textContent = `> ${message}`;
    statusLog.style.borderColor = isError ? '#ff3333' : '#00ff66';
  }
}

function appendMessage(text, type) {
  if (messageDisplay) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', type);
    msgDiv.textContent = type === 'self' ? `[You]: ${text}` : `[Peer]: ${text}`;
    messageDisplay.appendChild(msgDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
  }
}

socket.on('your-code', (code) => {
  if (myCodeEl) {
    myCodeEl.textContent = code;
    myCodeEl.classList.remove('loading-pulse');
  }
  logStatus('Handshake signature configured. Share it with your peer.');
});

socket.on('error-message', (err) => logStatus(err, true));
socket.on('waiting-message', (msg) => logStatus(msg));

if (connectBtn) {
  connectBtn.addEventListener('click', () => {
    const code = targetCodeInput ? targetCodeInput.value.trim() : '';
    if (code.length === 4) {
      logStatus('Hashing pair signatures...');
      socket.emit('submit-target-code', code);
    } else {
      logStatus('Invalid sequence length. Code must be 4 digits.', true);
    }
  });
}

socket.on('start-call-initiation', async (data) => {
  targetSocketId = data.to;
  logStatus('Secure terminal pipeline linked! Data node online.');
  
  if (matchmakerUi) matchmakerUi.style.display = 'none';
  if (chatUi) chatUi.style.display = 'block';
  
  if (callBtn) { callBtn.style.display = 'block'; callBtn.disabled = true; }
  if (muteBtn) { muteBtn.style.display = 'block'; muteBtn.disabled = false; }
  if (hangupBtn) { hangupBtn.style.display = 'block'; hangupBtn.disabled = false; }

  if (messageInput) messageInput.focus();

  if (data.initiator) {
    logStatus('Waking voice architecture modules...');
    try {
      await initializeAudioCall();
      logStatus('Broadcasting session offer handshake across network...');
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { sdp: offer, to: targetSocketId });
    } catch (err) {
      logStatus(`Auto-call initiation failed: ${err.message}`, true);
    }
  }
});

function transmitMessage() {
  if (!messageInput) return;
  const text = messageInput.value.trim();
  if (!text) return;

  appendMessage(text, 'self');
  socket.emit('send-chat-message', { text: text, to: targetSocketId });
  messageInput.value = '';
}

if (sendBtn) sendBtn.addEventListener('click', transmitMessage);
if (messageInput) {
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') transmitMessage();
  });
}

socket.on('receive-chat-message', (data) => {
  appendMessage(data.text, 'peer');
});

async function initializeAudioCall() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    logStatus("Security block: Application requires HTTPS connection.", true);
    throw new Error("MediaDevices API unavailable outside secure context (HTTPS).");
  }

  logStatus('Starting local media hardware request...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    logStatus('Microphone linked. Injecting pipeline...');

    peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && targetSocketId) {
        socket.emit('ice-candidate', { candidate: event.candidate, to: targetSocketId });
      }
    };

    peerConnection.ontrack = (event) => {
      logStatus('Voice pipeline stream connected and active.');
      if (remoteAudio) {
        if (event.streams && event.streams[0]) {
          remoteAudio.srcObject = event.streams[0];
        } else {
          remoteAudio.srcObject = new MediaStream([event.track]);
        }
        remoteAudio.muted = false;
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            logStatus("Click anywhere on the page to unmute incoming audio.");
            document.body.addEventListener('click', () => {
              remoteAudio.play();
            }, { once: true });
          });
        }
      }
    };

  } catch (err) {
    logStatus(`Hardware block: ${err.message}`, true);
    console.error('WebRTC Hardware Allocation Failure:', err);
    throw err;
  }
}

if (callBtn) {
  callBtn.addEventListener('click', async () => {
    logStatus('Waking voice architecture modules manually...');
    try {
      await initializeAudioCall();
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { sdp: offer, to: targetSocketId });
    } catch (offerErr) {
      logStatus(`Offer mapping failure: ${offerErr.message}`, true);
    }
  });
}

if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    muteBtn.textContent = isMuted ? 'UNMUTE MIC' : 'MUTE MIC';
    muteBtn.style.background = isMuted ? '#ff9900' : '#ffcc00';
    logStatus(isMuted ? 'Microphone muted locally.' : 'Microphone transmission active.');
  });
}

function terminateAudioCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (remoteAudio) remoteAudio.srcObject = null;
  
  if (callBtn) callBtn.disabled = false;
  if (muteBtn) {
    muteBtn.disabled = true;
    muteBtn.textContent = 'MUTE MIC';
    muteBtn.style.background = '#ffcc00';
  }
  if (hangupBtn) hangupBtn.disabled = true;
  isMuted = false;
  
  logStatus('Audio node call disconnected. Text channel remains live.');
}

if (hangupBtn) {
  hangupBtn.addEventListener('click', () => {
    terminateAudioCall();
    socket.emit('hangup-signal', { to: targetSocketId });
    socket.emit('send-chat-message', { text: '[System Notification: Voice call disconnected]', to: targetSocketId });
  });
}

socket.on('hangup-signal', () => {
  terminateAudioCall();
});

socket.on('offer', async (data) => {
  logStatus('Incoming call handshake detected. Connecting...');
  if (data.from) targetSocketId = data.from;

  try {
    if (!peerConnection) await initializeAudioCall();
    
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', { sdp: answer, to: targetSocketId });
    }
  } catch (err) {
    logStatus(`Inbound call resolution failed: ${err.message}`, true);
  }
});

socket.on('answer', async (data) => {
  if (!peerConnection) return;
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } catch (err) {
    logStatus(`Answer handshake rejection: ${err.message}`, true);
  }
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
