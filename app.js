import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname));

const activeCodes = new Map(); 
const pairings = new Map();    

function generateUniqueCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (activeCodes.has(code));
  return code;
}

io.on('connection', (socket) => {
  const myCode = generateUniqueCode();
  activeCodes.set(myCode, socket.id);
  
  socket.on('client-ready', () => {
    socket.emit('your-code', myCode);
  });

  socket.on('submit-target-code', (targetCode) => {
    const targetSocketId = activeCodes.get(targetCode);

    if (!targetSocketId) {
      socket.emit('error-message', 'Code not found. Peer may be offline.');
      return;
    }

    if (targetSocketId === socket.id) {
      socket.emit('error-message', 'You cannot call yourself.');
      return;
    }

    pairings.set(socket.id, targetSocketId);
    pairings.set(targetSocketId, socket.id);

    io.to(socket.id).emit('start-call-initiation', { to: targetSocketId, initiator: true });
    io.to(targetSocketId).emit('start-call-initiation', { to: socket.id, initiator: false });
  });

  socket.on('send-chat-message', (data) => {
    io.to(data.to).emit('receive-chat-message', { text: data.text });
  });

  socket.on('offer', (data) => {
    io.to(data.to).emit('offer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('answer', (data) => {
    io.to(data.to).emit('answer', { sdp: data.sdp });
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', { candidate: data.candidate });
  });

  socket.on('hangup-signal', (data) => {
    io.to(data.to).emit('hangup-signal');
  });

  socket.on('disconnect', () => {
    const peerId = pairings.get(socket.id);
    if (peerId) {
      io.to(peerId).emit('hangup-signal');
      io.to(peerId).emit('receive-chat-message', { text: '[System Notification: Peer disconnected from server]' });
      pairings.delete(peerId);
    }
    activeCodes.delete(myCode);
    pairings.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running`));
