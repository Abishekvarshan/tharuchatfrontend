import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  child,
  get,
  onChildAdded,
  onValue,
  push,
  ref as databaseRef,
  remove,
  set,
  update,
} from 'firebase/database';
import { realtimeDb } from '../firebase';
import './VideoCallOverlay.css';

const getTurnIceServer = () => {
  const urls = process.env.REACT_APP_TURN_URLS;
  if (!urls) return null;

  return {
    urls: urls.split(',').map((url) => url.trim()).filter(Boolean),
    username: process.env.REACT_APP_TURN_USERNAME || undefined,
    credential: process.env.REACT_APP_TURN_CREDENTIAL || undefined,
  };
};

const getPeerConfiguration = () => {
  const turnServer = getTurnIceServer();

  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      ...(turnServer ? [turnServer] : []),
    ],
  };
};

const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

function VideoCallOverlay({
  activeCall,
  currentUser,
  onClose,
  initialFullscreen = true,
  isVisible = false,
}) {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [callId, setCallId] = useState(null);
  const [callStatus, setCallStatus] = useState('idle');
  const [permissionError, setPermissionError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [localVideoPosition, setLocalVideoPosition] = useState({ right: 18, bottom: 118 });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const cleanupCallbacksRef = useRef([]);
  const startedRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const pendingCandidatesRef = useRef([]);
  const controlsTimeoutRef = useRef(null);
  const localVideoDragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialRight: 18, initialBottom: 118 });

  const isReceiver = activeCall?.mode === 'receiver';
  const isConnected = callStatus === 'connected';

  const callLabel = useMemo(() => {
    if (!activeCall) return 'Video call';
    if (isReceiver) return activeCall.callerName || activeCall.callerEmail || 'Incoming call';
    return activeCall.receiverEmail ? `Calling ${activeCall.receiverEmail}` : 'Calling';
  }, [activeCall, isReceiver]);

  const getRemoteAvatar = () => {
    // Return remote user's avatar/photo URL if available
    if (isReceiver && activeCall?.callerEmail) {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(activeCall.callerName || activeCall.callerEmail)}&background=random&size=128`;
    }
    if (activeCall?.receiverEmail) {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(activeCall.receiverEmail)}&background=random&size=128`;
    }
    return null;
  };

  const getCurrentUserAvatar = () => {
    return currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.displayName || currentUser?.email || 'User')}&background=random&size=128`;
  };

  const formatCallStatus = () => {
    if (isConnected) return formatDuration(durationSeconds);
    if (callStatus === 'ringing') return 'Ringing...';
    if (callStatus === 'connecting') return 'Connecting...';
    if (callStatus === 'calling') return 'Calling...';
    return 'Connecting...';
  };

  // Show/hide controls with auto-hide
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isConnected) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 4000);
    }
  }, [isConnected]);

  const handleVideoClick = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      showControls();
    }
  }, [controlsVisible, showControls]);

  // Drag functionality for local video
  const handleLocalVideoMouseDown = useCallback((e) => {
    if (!isConnected) return;
    localVideoDragRef.current = {
      isDragging: true,
      startX: e.clientX || e.touches?.[0]?.clientX || 0,
      startY: e.clientY || e.touches?.[0]?.clientY || 0,
      initialRight: localVideoPosition.right,
      initialBottom: localVideoPosition.bottom,
    };
    e.preventDefault();
  }, [isConnected, localVideoPosition]);

  const handleMouseMove = useCallback((e) => {
    if (!localVideoDragRef.current.isDragging) return;
    const dx = (e.clientX || e.touches?.[0]?.clientX || 0) - localVideoDragRef.current.startX;
    const dy = (e.clientY || e.touches?.[0]?.clientY || 0) - localVideoDragRef.current.startY;
    setLocalVideoPosition({
      right: Math.max(10, Math.min(window.innerWidth - 180, localVideoDragRef.current.initialRight - dx)),
      bottom: Math.max(100, Math.min(window.innerHeight - 100, localVideoDragRef.current.initialBottom + dy)),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    localVideoDragRef.current.isDragging = false;
  }, []);

  // Set up global mouse events for dragging
  useEffect(() => {
    if (isVisible) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isVisible, handleMouseMove, handleMouseUp]);

  const runCleanups = useCallback(() => {
    cleanupCallbacksRef.current.forEach((cleanup) => cleanup());
    cleanupCallbacksRef.current = [];
  }, []);

  const resetLocalState = useCallback(() => {
    runCleanups();
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    startedRef.current = false;
    remoteDescriptionSetRef.current = false;
    pendingCandidatesRef.current = [];
    setCallId(null);
    setCallStatus('idle');
    setPermissionError('');
    setAudioEnabled(true);
    setVideoEnabled(true);
    setDurationSeconds(0);
    setControlsVisible(true);
    setRemoteVideoEnabled(true);
    setLocalVideoPosition({ right: 18, bottom: 118 });
  }, [runCleanups]);

  const attachCleanup = useCallback((cleanup) => {
    cleanupCallbacksRef.current.push(cleanup);
  }, []);

  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = mediaStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      return mediaStream;
    } catch (error) {
      setPermissionError('Camera or microphone permission was blocked. Please allow access and try again.');
      setCallStatus('error');
      throw error;
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    if (!peerConnectionRef.current || !remoteDescriptionSetRef.current) return;

    const candidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const addRemoteCandidate = useCallback(async (candidate) => {
    if (!candidate || !peerConnectionRef.current) return;

    if (!remoteDescriptionSetRef.current) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }, []);

  const createPeerConnection = useCallback((id, role) => {
    const pc = new RTCPeerConnection(getPeerConfiguration());
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      const candidatePath = role === 'caller' ? 'callerCandidates' : 'receiverCandidates';
      const candidatesRef = databaseRef(realtimeDb, `calls/${id}/${candidatePath}`);
      set(push(candidatesRef), event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        update(databaseRef(realtimeDb, `calls/${id}`), { status: 'connected', connectedAt: Date.now() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('connected');
      }
    };

    return pc;
  }, []);

  const watchCallStatus = useCallback((id) => {
    const statusRef = child(databaseRef(realtimeDb), `calls/${id}/status`);
    const unsubscribe = onValue(statusRef, (snapshot) => {
      const nextStatus = snapshot.val();
      if (!nextStatus) return;

      setCallStatus(nextStatus);
      if (nextStatus === 'ended' || nextStatus === 'rejected') {
        resetLocalState();
        onClose();
      }
    });

    attachCleanup(unsubscribe);
  }, [attachCleanup, onClose, resetLocalState]);

  const watchCandidates = useCallback((id, path) => {
    const candidatesRef = databaseRef(realtimeDb, `calls/${id}/${path}`);
    const unsubscribe = onChildAdded(candidatesRef, (snapshot) => {
      addRemoteCandidate(snapshot.val());
    });

    attachCleanup(unsubscribe);
  }, [addRemoteCandidate, attachCleanup]);

  const startCaller = useCallback(async () => {
    if (!currentUser || !activeCall?.receiverEmail) return;

    setCallStatus('calling');
    const newCallRef = push(databaseRef(realtimeDb, 'calls'));
    const newCallId = newCallRef.key;
    setCallId(newCallId);

    const mediaStream = await getLocalMedia();
    const pc = createPeerConnection(newCallId, 'caller');
    mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await set(newCallRef, {
      callerId: currentUser.uid,
      callerEmail: currentUser.email.toLowerCase(),
      callerName: currentUser.displayName || currentUser.email,
      receiverId: activeCall.receiverId || null,
      receiverEmail: activeCall.receiverEmail.toLowerCase(),
      status: 'ringing',
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      createdAt: Date.now(),
    });

    watchCallStatus(newCallId);
    watchCandidates(newCallId, 'receiverCandidates');

    const answerRef = child(databaseRef(realtimeDb), `calls/${newCallId}/answer`);
    const unsubscribeAnswer = onValue(answerRef, async (snapshot) => {
      const answer = snapshot.val();
      if (!answer || remoteDescriptionSetRef.current || !peerConnectionRef.current) return;

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      remoteDescriptionSetRef.current = true;
      await flushPendingCandidates();
    });

    attachCleanup(unsubscribeAnswer);
  }, [activeCall, attachCleanup, createPeerConnection, currentUser, flushPendingCandidates, getLocalMedia, watchCallStatus, watchCandidates]);

  const startReceiver = useCallback(async () => {
    if (!currentUser || !activeCall?.callId) return;

    setCallId(activeCall.callId);
    setCallStatus('connecting');
    const callRef = databaseRef(realtimeDb, `calls/${activeCall.callId}`);
    const callSnapshot = await get(callRef);
    const callData = callSnapshot.val();

    if (!callData?.offer) {
      setCallStatus('error');
      setPermissionError('This call is no longer available.');
      return;
    }

    await update(callRef, {
      receiverId: currentUser.uid,
      receiverEmail: currentUser.email.toLowerCase(),
      status: 'accepted',
      acceptedAt: Date.now(),
    });

    const mediaStream = await getLocalMedia();
    const pc = createPeerConnection(activeCall.callId, 'receiver');
    mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    remoteDescriptionSetRef.current = true;
    await flushPendingCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await update(callRef, {
      status: 'connecting',
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    });

    watchCallStatus(activeCall.callId);
    watchCandidates(activeCall.callId, 'callerCandidates');
  }, [activeCall, createPeerConnection, currentUser, flushPendingCandidates, getLocalMedia, watchCallStatus, watchCandidates]);

  const endCall = useCallback(async () => {
    const id = callId || activeCall?.callId;

    if (id) {
      await update(databaseRef(realtimeDb, `calls/${id}`), { status: 'ended', endedAt: Date.now() });
      await remove(databaseRef(realtimeDb, `calls/${id}`));
    }

    resetLocalState();
    onClose();
  }, [activeCall, callId, onClose, resetLocalState]);

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setAudioEnabled(audioTrack.enabled);
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setVideoEnabled(videoTrack.enabled);
  };

  useEffect(() => {
    setIsFullscreen(window.innerWidth <= 768 || initialFullscreen);
  }, [initialFullscreen]);

  useEffect(() => {
    if (!isVisible || !activeCall || !currentUser || startedRef.current) return undefined;

    startedRef.current = true;
    const start = activeCall.mode === 'receiver' ? startReceiver : startCaller;
    start().catch((error) => {
      console.error('Video call failed:', error);
    });

    return undefined;
  }, [activeCall, currentUser, isVisible, startCaller, startReceiver]);

  useEffect(() => {
    if (!isVisible) {
      resetLocalState();
    }
  }, [isVisible, resetLocalState]);

  useEffect(() => {
    if (!isConnected) return undefined;

    const intervalId = window.setInterval(() => {
      setDurationSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isConnected]);

  if (!isVisible) return null;

  const remoteAvatar = getRemoteAvatar();

  return (
    <div className={`video-overlay ${isFullscreen ? 'fullscreen' : 'minimized'} ${isConnected ? 'is-connected' : 'is-ringing'}`}>
      <div className="video-stage" onClick={handleVideoClick}>
        {/* Remote video (full screen when connected) */}
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={`video remote-video ${isConnected ? 'primary' : 'hidden-video'}`} 
        />
        
        {/* Local video (floating PIP) */}
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`video local-video ${isConnected ? 'secondary' : 'primary'}`}
          style={isConnected ? {
            right: `${localVideoPosition.right}px`,
            bottom: `${localVideoPosition.bottom}px`,
          } : undefined}
          onMouseDown={handleLocalVideoMouseDown}
          onTouchStart={handleLocalVideoMouseDown}
        />

        {/* Call Info Header */}
        <div className="call-info-header">
          {remoteAvatar && (
            <img 
              src={remoteAvatar} 
              alt="Caller" 
              className="call-avatar"
            />
          )}
          <div className="call-name">{callLabel}</div>
          <div className="call-status">{formatCallStatus()}</div>
        </div>

        {/* Video Placeholder (when not connected) */}
        <div className={`video-placeholder ${!isConnected ? 'visible' : ''}`}>
          {remoteAvatar && (
            <img 
              src={remoteAvatar} 
              alt="Caller" 
              className="video-placeholder-avatar"
            />
          )}
          <strong>{callLabel}</strong>
          <span>{formatCallStatus()}</span>
        </div>

        {/* Minimize button */}
        <button
          className="video-side-button video-minimize-button"
          onClick={(e) => {
            e.stopPropagation();
            setIsFullscreen((value) => !value);
          }}
          aria-label={isFullscreen ? 'Minimize call' : 'Fullscreen call'}
          title={isFullscreen ? 'Minimize call' : 'Fullscreen call'}
        >
          <span aria-hidden="true">{isFullscreen ? '↙' : '⛶'}</span>
        </button>

        {/* Permissions error */}
        {permissionError && <div className="video-call-error">{permissionError}</div>}

        {/* Call Controls */}
        <div className={`video-controls ${!controlsVisible ? 'hidden' : ''}`}>
          <button 
            className="video-control-button" 
            onClick={toggleAudio} 
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'} 
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            <span aria-hidden="true">{audioEnabled ? '🎤' : '🔇'}</span>
          </button>
          
          <button 
            className={`video-control-button ${videoEnabled ? '' : 'is-off'}`} 
            onClick={toggleVideo} 
            aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'} 
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            <span aria-hidden="true">{videoEnabled ? '📹' : '📷'}</span>
          </button>
          
          <button 
            className="video-control-button" 
            aria-label="Switch camera" 
            title="Switch camera"
          >
            <span aria-hidden="true">🔄</span>
          </button>
          
          <button 
            className="video-control-button" 
            aria-label="Speaker" 
            title="Speaker"
          >
            <span aria-hidden="true">🔊</span>
          </button>
          
          <button 
            className="video-control-button end-call-btn" 
            onClick={endCall} 
            aria-label="End call" 
            title="End call"
          >
            <span aria-hidden="true">📞</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoCallOverlay;
