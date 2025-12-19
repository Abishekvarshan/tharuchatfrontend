import React, { useState, useRef, useEffect } from 'react';
import './VideoCallOverlay.css';

function VideoCallOverlay({
  socket,
  onClose,
  initialFullscreen = true,
  isReceiver = false,
  isVisible = false
}) {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [isCalling, setIsCalling] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [primaryLocal, setPrimaryLocal] = useState(false);
  const [stream, setStream] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // Check if mobile
  const isMobile = window.innerWidth <= 768;

  // Set initial fullscreen based on mobile
  useEffect(() => {
    setIsFullscreen(isMobile);
  }, [isMobile]);

  // Helper function to create a properly configured peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      console.log('ICE candidate:', event.candidate);
      if (event.candidate && socket) {
        socket.emit('ice-candidate', { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('Remote stream received:', event.streams[0]);
      console.log('Remote video ref current:', remoteVideoRef.current);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log('Set remote video srcObject');
      } else {
        console.log('Remote video ref not ready or no stream');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    return pc;
  };

  // Auto-start call if receiver or caller
  useEffect(() => {
    if (!isCalling && localVideoRef.current && remoteVideoRef.current) {
      startCall(isReceiver);
    }
  }, []); // Only run once on mount

  // WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('webrtc-offer', async ({ sdp }) => {
      try {
        console.log('Received offer, processing...');

        // Set remote description (offer)
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('Set remote description');

        // Create and send answer
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('webrtc-answer', { sdp: answer });
        console.log('Sent answer');
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('webrtc-answer', async ({ sdp }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      try {
        if (peerConnectionRef.current)
          await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.error('Error adding ICE candidate', err);
      }
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('ice-candidate');
    };
  }, [socket, stream]);

  const startCall = async (isReceiver = false) => {
    if (!socket || isCalling) return;

    try {
      // Always get local media first for both caller and receiver
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      if (!peerConnectionRef.current) {
        createPeerConnection();
      }

      // Add tracks to peer connection for both
      mediaStream.getTracks().forEach((track) =>
        peerConnectionRef.current.addTrack(track, mediaStream)
      );

      // Only caller creates and sends offer
      if (!isReceiver) {
        socket.emit('incoming-call'); // notify receiver
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('webrtc-offer', { sdp: offer });
      }

      setIsCalling(true);
      setPrimaryLocal(false); // remote video starts as primary
    } catch (err) {
      console.error('Error accessing media devices', err);
      alert('Cannot access camera/microphone. Check permissions.');
    }
  };

  const endCall = () => {
    if (socket) {
      socket.emit('end-call');
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setIsCalling(false);
    setAudioEnabled(true);
    setVideoEnabled(true);
    onClose();
  };

  const toggleAudio = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    setAudioEnabled(!audioEnabled);
  };

  const toggleVideo = () => {
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    setVideoEnabled(!videoEnabled);
  };

  const swapVideos = () => setPrimaryLocal(!primaryLocal);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  return (
    <div className={`video-overlay ${isFullscreen ? 'fullscreen' : 'minimized'} ${!isVisible ? 'hidden' : ''}`}>
      <div className="video-controls">
        <button onClick={toggleFullscreen}>
          {isFullscreen ? '⬜' : '🔳'}
        </button>
        {isCalling && (
          <>
            <button onClick={toggleAudio}>{audioEnabled ? '🔇' : '🔊'}</button>
            <button onClick={toggleVideo}>{videoEnabled ? '📷' : '📹'}</button>
            <button onClick={endCall} className="end-call-btn">❌</button>
          </>
        )}
        {!isCalling && (
          <button onClick={onClose}>❌</button>
        )}
      </div>
      <div className="video-wrapper">
        <video
          ref={primaryLocal ? localVideoRef : remoteVideoRef}
          autoPlay
          muted={primaryLocal}
          className="video primary"
          onClick={swapVideos}
        />
        <video
          ref={primaryLocal ? remoteVideoRef : localVideoRef}
          autoPlay
          muted={!primaryLocal}
          className="video secondary"
          onClick={swapVideos}
        />
      </div>
    </div>
  );
}

export default VideoCallOverlay;
