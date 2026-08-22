import React, { useState, useRef, useEffect } from 'react';
import './Chat.css'; // optional CSS for chat styling

function Chat({ messages, currentUserId, addMessage }) {
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const messagesEndRef = useRef(null);
  const touchStartRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when new message arrives
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, []);

  const handleSend = () => {
    const messageText = input.trim();
    if (messageText === '') return;

    const senderId = currentUserId || 'local-user';
    const message = {
      text: messageText,
      sender: senderId,
      replyTo: replyingTo,
    };

    // Firestore persists the message and broadcasts it to connected clients.
    addMessage(message);

    setInput('');
    setReplyingTo(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  const getMessageDetails = (msg) => ({
    text: typeof msg === 'string' ? msg : msg.text,
    sender: typeof msg === 'string' ? null : msg.sender,
    replyTo: typeof msg === 'string' ? null : msg.replyTo,
  });

  const selectReply = (msg) => {
    const { text, sender } = getMessageDetails(msg);
    setReplyingTo({ text, sender });
    setContextMenu(null);
  };

  const handleTouchStart = (event, index) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, index };
  };

  const handleTouchEnd = (event, msg) => {
    if (!touchStartRef.current) return;

    const touch = event.changedTouches[0];
    const { x, y } = touchStartRef.current;
    const horizontalDistance = touch.clientX - x;
    const verticalDistance = Math.abs(touch.clientY - y);

    if (horizontalDistance > 60 && horizontalDistance > verticalDistance) {
      selectReply(msg);
    }

    touchStartRef.current = null;
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => {
          // Handle both old string format and new object format
          const { text: messageText, sender: senderId, replyTo } = getMessageDetails(msg);
          const isOwnMessage = senderId === currentUserId || (senderId === 'local-user' && !currentUserId);

          return (
            <div key={msg.id || idx} className={`message-row ${isOwnMessage ? 'own-message-row' : 'other-message-row'}`}>
              <div
                className={`message ${isOwnMessage ? 'own-message' : 'other-message'}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, index: idx });
                }}
                onTouchStart={(event) => handleTouchStart(event, idx)}
                onTouchEnd={(event) => handleTouchEnd(event, msg)}
              >
                {replyTo && (
                  <div className="reply-preview">
                    <strong>Reply</strong>
                    <span>{replyTo.text}</span>
                  </div>
                )}
                <div>{messageText}</div>
              </div>
              {contextMenu?.index === idx && (
                <button
                  className="reply-action"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onClick={() => selectReply(msg)}
                >
                  Reply
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {replyingTo && (
        <div className="replying-banner">
          <div>
            <strong>Replying to</strong>
            <span>{replyingTo.text}</span>
          </div>
          <button aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>×</button>
        </div>
      )}
      <form className="chat-input" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button type="submit" onMouseDown={(event) => event.preventDefault()}>Send</button>
      </form>
    </div>
  );
}

export default Chat;
