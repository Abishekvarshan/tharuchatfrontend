import React, { useState, useRef, useEffect } from 'react';
import './VideoCallOverlay.css';

function VideoCallOverlay({
  socket,
  onClose,
  initialFullscreen = true,
  isReceiver = false
}) {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [isCalling, setIsCalling] = useState(false);
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

  // Auto-start call if receiver or caller
  useEffect(() => {
    if (!isCalling) {
      startCall(isReceiver);
    }
  }, []);

  // WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('webrtc-offer', async ({ sdp }) => {
      if (!peerConnectionRef.current) {
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('ice-candidate', { candidate: event.candidate });
          }
        };

        pc.ontrack = (event) => {
          console.log('Received remote stream');
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit('webrtc-answer', { sdp: answer });
    });

    socket.on('webrtc-answer', async ({ sdp }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
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
  }, [socket]);

  const startCall = async (isReceiver = false) => {
    if (!socket || isCalling) return;

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      if (!peerConnectionRef.current) {
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('ice-candidate', { candidate: event.candidate });
          }
        };

        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };
      }

      mediaStream.getTracks().forEach((track) =>
        peerConnectionRef.current.addTrack(track, mediaStream)
      );

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
    <div className={`video-overlay ${isFullscreen ? 'fullscreen' : 'minimized'}`}>
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
