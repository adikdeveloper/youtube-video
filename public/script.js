const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const socket = io.connect('http://localhost:3000');

const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
};

let localStream;
let peerConnection;
let mediaRecorder;
let recordedChunks = [];

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
        socket.emit('ready');
        startRecording();
    })
    .catch(error => console.error('Error accessing media devices.', error));

function startRecording() {
    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    mediaRecorder = new MediaRecorder(localStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
            sendChunkToServer(event.data);
        }
    };
    
    mediaRecorder.start(1000); // Har sekundda bir marta chunk yuborish
}

function sendChunkToServer(chunk) {
    const formData = new FormData();
    formData.append('video', chunk, 'chunk.webm');
    formData.append('userId', socket.id);
    
    fetch('/upload-chunk', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => console.log('Chunk yuklandi:', result))
    .catch(error => console.error('Chunk yuklashda xatolik:', error));
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function watchRecordedVideo() {
    const recordedVideo = document.getElementById('recordedVideo');
    recordedVideo.src = `/video/${socket.id}`;
    recordedVideo.play();
}

socket.on('offer', (id, description) => {
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.setRemoteDescription(description);
    peerConnection.addStream(localStream);

    peerConnection.createAnswer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => socket.emit('answer', id, peerConnection.localDescription));

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };
});

socket.on('answer', (description) => {
    peerConnection.setRemoteDescription(description);
});

socket.on('ready', (id) => {
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.addStream(localStream);

    peerConnection.createOffer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => socket.emit('offer', id, peerConnection.localDescription));

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };
});

socket.on('ice-candidate', (id, candidate) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('disconnectPeer', () => {
    stopRecording();
    if (peerConnection) {
        peerConnection.close();
    }
    watchRecordedVideo();
});