import React, { useRef } from 'react';
import './VideoCall.css';

function VideoCall({ localVideoRef, remoteVideoRef }) {
  return (
    <div className="video-call-container">
      <div className="video-wrapper">
        <video ref={localVideoRef} autoPlay muted className="video local" />
        <p className="label">You</p>
      </div>
      <div className="video-wrapper">
        <video ref={remoteVideoRef} autoPlay className="video remote" />
        <p className="label">Partner</p>
      </div>
    </div>
  );
}

export default VideoCall;
