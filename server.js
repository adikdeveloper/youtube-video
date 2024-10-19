const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

const recordingsDir = './recordings';
if (!fs.existsSync(recordingsDir)){
    fs.mkdirSync(recordingsDir);
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const activeRecordings = new Map();

app.post('/upload-chunk', upload.single('video'), (req, res) => {
    if (req.file) {
        const userId = req.body.userId;
        if (!activeRecordings.has(userId)) {
            const filePath = path.join(recordingsDir, `${userId}_${Date.now()}.webm`);
            activeRecordings.set(userId, fs.createWriteStream(filePath));
        }
        
        const writeStream = activeRecordings.get(userId);
        writeStream.write(req.file.buffer);
        
        res.json({ message: 'Chunk qabul qilindi' });
    } else {
        res.status(400).json({ error: 'Chunk yuklanmadi' });
    }
});

app.get('/video/:userId', (req, res) => {
    const userId = req.params.userId;
    const filePath = path.join(recordingsDir, `${userId}_*.webm`);
    
    fs.readdir(recordingsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Video topilmadi' });
        }
        
        const videoFile = files.find(file => file.startsWith(userId));
        if (videoFile) {
            res.sendFile(path.join(recordingsDir, videoFile));
        } else {
            res.status(404).json({ error: 'Video topilmadi' });
        }
    });
});

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('offer', (id, description) => {
        socket.to(id).emit('offer', socket.id, description);
    });

    socket.on('answer', (id, description) => {
        socket.to(id).emit('answer', socket.id, description);
    });

    socket.on('ice-candidate', (id, candidate) => {
        socket.to(id).emit('ice-candidate', socket.id, candidate);
    });

    socket.on('ready', () => {
        const rooms = Object.keys(io.sockets.adapter.rooms);
        const randomRoom = rooms.find(room => room !== socket.id);

        if (randomRoom) {
            socket.join(randomRoom);
            socket.to(randomRoom).emit('ready', socket.id);
        } else {
            socket.join(socket.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        socket.broadcast.emit('disconnectPeer', socket.id);
    });
});

server.listen(3000, () => {
    console.log('HTTP server is running on port 3000');
});