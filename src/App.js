import React, { useState, useEffect, useRef } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { getDailyRoomID } from './utils';
import Chat from './components/Chat';
import VideoCallOverlay from './components/VideoCallOverlay';
import { auth, db } from './firebase';
import './App.css';

const ALLOWED_EMAILS = new Set([
  'varsityabi@gmail.com',
  'shamilyrathnakumar@gmail.com',
]);

function App() {
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [isReceiver, setIsReceiver] = useState(false);
  const firebaseReadyRef = useRef(null);
  const roomID = getDailyRoomID();

  useEffect(() => {
    let unsubscribeMessages = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setAuthLoading(false);
      const isAllowedUser = user?.email && ALLOWED_EMAILS.has(user.email.toLowerCase());
      setCurrentUserId(isAllowedUser ? user.uid : null);

      if (user && isAllowedUser) {
        firebaseReadyRef.current = Promise.resolve(user);
        const messagesQuery = query(
          collection(db, 'rooms', roomID, 'messages'),
          orderBy('createdAt', 'asc'),
        );

        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          setMessages(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })));
        });
      } else if (user) {
        setAuthError('This Google account is not allowed to use this chat.');
        signOut(auth);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeMessages();
    };
  }, [roomID]);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('Google sign-in failed:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in was not completed. Please try again.');
      }
    }
  };

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

  const addMessage = async (message) => {
    try {
      await firebaseReadyRef.current;
      await addDoc(collection(db, 'rooms', roomID, 'messages'), {
        text: message.text,
        sender: message.sender,
        replyTo: message.replyTo || null,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Message could not be saved:', error);
      setMessages((prev) => [...prev, message]);
    }
  };

  const handleCloseVideoOverlay = () => {
    setShowVideoOverlay(false);
    setIsReceiver(false);
  };

  if (authLoading) {
    return <div className="auth-screen">Checking sign-in...</div>;
  }

  if (!currentUserId) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <h1>WishUs</h1>
          <p>Sign in with Google to continue</p>
          <button className="google-sign-in" onClick={handleGoogleSignIn}>
            Continue with Google
          </button>
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-lockup">
          <img src="/wishus.png" alt="WishUs" className="brand-icon" />
          <h2>WishUs</h2>
        </div>
        <div className="header-buttons">
          <button onClick={handleVideoCallClick}>📹</button>
          <button onClick={toggleDarkMode}>
            {darkMode ? '🌙' : '☀️'}
            </button>
        </div>
      </header>

      <Chat messages={messages} currentUserId={currentUserId} addMessage={addMessage} />

      <VideoCallOverlay
        onClose={handleCloseVideoOverlay}
        isReceiver={isReceiver}
        isVisible={showVideoOverlay}
      />
    </div>
  );
}

export default App;
