import React, { useState, useEffect, useRef } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ref as databaseRef, onValue, remove, update } from 'firebase/database';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { getDailyRoomID } from './utils';
import Chat from './components/Chat';
import VideoCallOverlay from './components/VideoCallOverlay';
import { auth, db, realtimeDb } from './firebase';
import './App.css';

const ALLOWED_EMAILS = new Set([
  'varsityabi@gmail.com',
  'shamilyrathnakumar@gmail.com',
]);

function App() {
  const [messages, setMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const firebaseReadyRef = useRef(null);
  const roomID = getDailyRoomID();

  useEffect(() => {
    let unsubscribeMessages = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setAuthLoading(false);
      const isAllowedUser = user?.email && ALLOWED_EMAILS.has(user.email.toLowerCase());
      setCurrentUser(isAllowedUser ? user : null);
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

  useEffect(() => {
    if (!currentUser?.email) {
      setIncomingCall(null);
      return undefined;
    }

    const callsRef = databaseRef(realtimeDb, 'calls');
    const unsubscribe = onValue(callsRef, (snapshot) => {
      const calls = snapshot.val() || {};
      const nextIncomingCall = Object.entries(calls).find(([, call]) => (
        call.status === 'ringing'
        && call.receiverEmail === currentUser.email.toLowerCase()
        && call.callerId !== currentUser.uid
      ));

      if (!nextIncomingCall) {
        setIncomingCall(null);
        return;
      }

      const [callId, call] = nextIncomingCall;
      setIncomingCall({ id: callId, ...call });
    });

    return () => unsubscribe();
  }, [currentUser]);

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
    if (!currentUser) return;
    const receiverEmail = [...ALLOWED_EMAILS].find((email) => email !== currentUser.email.toLowerCase());

    setActiveCall({
      mode: 'caller',
      receiverEmail,
    });
    setShowVideoOverlay(true);
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
    setActiveCall(null);
  };

  const handleAcceptCall = () => {
    if (!incomingCall) return;

    setActiveCall({
      mode: 'receiver',
      callId: incomingCall.id,
      callerId: incomingCall.callerId,
      callerName: incomingCall.callerName,
      callerEmail: incomingCall.callerEmail,
    });
    setIncomingCall(null);
    setShowVideoOverlay(true);
  };

  const handleRejectCall = async () => {
    if (!incomingCall) return;

    const callRef = databaseRef(realtimeDb, `calls/${incomingCall.id}`);
    await update(callRef, { status: 'rejected', endedAt: Date.now() });
    await remove(callRef);
    setIncomingCall(null);
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
          <button className="video-call-button" onClick={handleVideoCallClick} aria-label="Start video call" title="Start video call">
            <span className="video-call-icon" aria-hidden="true" />
          </button>
          <button
            className={`theme-toggle ${darkMode ? 'is-dark' : 'is-light'}`}
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-toggle-orbit" aria-hidden="true">
              <span className="theme-toggle-icon" />
            </span>
          </button>
        </div>
      </header>

      <Chat messages={messages} currentUserId={currentUserId} addMessage={addMessage} />

      {incomingCall && !showVideoOverlay && (
        <div className="incoming-call-card">
          <div>
            <strong>Incoming video call</strong>
            <span>{incomingCall.callerName || incomingCall.callerEmail || 'WishUs user'}</span>
          </div>
          <button className="accept-call-button" onClick={handleAcceptCall}>Accept</button>
          <button className="reject-call-button" onClick={handleRejectCall}>Reject</button>
        </div>
      )}

      <VideoCallOverlay
        activeCall={activeCall}
        currentUser={currentUser}
        onClose={handleCloseVideoOverlay}
        isVisible={showVideoOverlay}
      />
    </div>
  );
}

export default App;
