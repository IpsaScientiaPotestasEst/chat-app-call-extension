const socket = io('https://chat-app-call-extension.onrender.com');


const myCodeEl = document.getElementById('my-code');
const targetCodeInput = document.getElementById('target-code');
const connectBtn = document.getElementById('connect-btn');
const statusLog = document.getElementById('status-log');
const remoteAudio = document.getElementById('remote-audio');

let peerConnection;
let targetSocketId;
let localStream;

const config = { iceServers: [{ urls: 'stun:://google.com' }] };

function logStatus(message, isError = false) {
  statusLog.textContent = `> ${message}`;
  statusLog.style.borderColor = isError ? '#ff3333' : '#00ff66';
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
  logStatus('Mutual match confirmed! Initializing audio engine...');
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    peerConnection = new RTCPeerConnection(config);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, to: targetSocketId });
      }
    };

    peerConnection.ontrack = (event) => {
      logStatus('Secure P2P pipeline linked! Audio streaming.');
      remoteAudio.srcObject = event.streams[0];
    };

  
    if (data.initiator) {
      logStatus('Establishing encrypted channel handshake...');
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { sdp: offer, to: targetSocketId });
    }
  } catch (err) {
    logStatus(`Hardware error: ${err.message}`, true);
  }
});

socket.on('offer', async (data) => {
  if (!peerConnection) return;
  logStatus('Processing incoming digital handshake...');
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
