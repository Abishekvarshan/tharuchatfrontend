import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { getDailyRoomID } from './utils';
import Chat from './components/Chat';
import VideoCallOverlay from './components/VideoCallOverlay';
import './App.css';

const SOCKET_SERVER_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'; // Replace with deployed backend URL

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [isReceiver, setIsReceiver] = useState(false);
  const roomID = getDailyRoomID();

  // Initialize Socket.IO
  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    // Set currentUserId when socket connects
    newSocket.on('connect', () => {
      setCurrentUserId(newSocket.id);
      newSocket.emit('join-room', roomID);
    });

    newSocket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });



    // Incoming call prompt
    newSocket.on('incoming-call', () => {
      const accept = window.confirm('Incoming video call. Accept?');
      if (accept) {
        setIsReceiver(true);
        setShowVideoOverlay(true);
      }
    });

    // Call ended by other user
    newSocket.on('call-ended', () => {
      setShowVideoOverlay(false);
      setIsReceiver(false);
    });

    // Room full
    newSocket.on('room-full', (data) => {
      alert(data.message);
    });

    return () => newSocket.disconnect();
  }, [roomID]);

  // Toggle Dark/Light Mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  };

  const handleVideoCallClick = () => {
    setShowVideoOverlay(true);
    setIsReceiver(false); // Set as caller
  };

  const addMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleCloseVideoOverlay = () => {
    setShowVideoOverlay(false);
    setIsReceiver(false);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h2>Love Chat</h2>
        <div className="header-buttons">
          <button onClick={handleVideoCallClick}>📹</button>
          <button onClick={toggleDarkMode}>
            {darkMode ? '🌙' : '☀️'}
            </button>
        </div>
      </header>

      <Chat messages={messages} socket={socket} currentUserId={currentUserId} addMessage={addMessage} />

      <VideoCallOverlay
        socket={socket}
        onClose={handleCloseVideoOverlay}
        isReceiver={isReceiver}
        isVisible={showVideoOverlay}
      />
    </div>
  );
}

export default App;
