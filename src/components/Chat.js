import React, { useState, useRef, useEffect } from 'react';
import './Chat.css'; // optional CSS for chat styling

function Chat({ messages, socket, currentUserId, addMessage }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Scroll to bottom when new message arrives
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim() === '' || !socket || !currentUserId) return;

    // Send to server first
    socket.emit('chat-message', input);

    // Add message locally for immediate display (backend will echo back to other user)
    addMessage({ text: input, sender: currentUserId });

    setInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => {
          // Handle both old string format and new object format
          const messageText = typeof msg === 'string' ? msg : msg.text;
          const senderId = typeof msg === 'string' ? null : msg.sender;
          const isOwnMessage = senderId === currentUserId;

          return (
            <div
              key={idx}
              className={`message ${isOwnMessage ? 'own-message' : 'other-message'}`}
            >
              {messageText}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

export default Chat;
