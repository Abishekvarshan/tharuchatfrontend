import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Chat.css'; // optional CSS for chat styling

function Chat({ messages, currentUserId, addMessage, typingUsers = [], onTypingChange, onMessageRead }) {
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const touchStartRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const previousMessagesRef = useRef([]);
  const hasInitialScrollRef = useRef(false);
  const readObserverRef = useRef(null);
  const readQueuedRef = useRef(new Set());
  const keepLatestVisibleRef = useRef(false);
  const userNearBottomRef = useRef(true);
  const [composerHeight, setComposerHeight] = useState(64);

  const isNearBottom = useCallback(() => {
    const messagePanel = messagesRef.current;
    if (!messagePanel) return true;
    return messagePanel.scrollHeight - messagePanel.scrollTop - messagePanel.clientHeight < 72;
  }, []);

  const updateNearBottomState = useCallback(() => {
    userNearBottomRef.current = isNearBottom();
    return userNearBottomRef.current;
  }, [isNearBottom]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const messagePanel = messagesRef.current;
    if (!messagePanel) return;
    messagePanel.scrollTo({ top: messagePanel.scrollHeight, behavior });
    userNearBottomRef.current = true;
    setNewMessageCount(0);
  }, []);

  const settleLatestMessages = useCallback(() => {
    [0, 80, 180, 360].forEach((delay) => {
      window.setTimeout(() => {
        requestAnimationFrame(() => scrollToBottom('auto'));
      }, delay);
    });
  }, [scrollToBottom]);

  useEffect(() => {
    const previousMessages = previousMessagesRef.current;
    const previousIds = new Set(previousMessages.map((message) => message.id).filter(Boolean));
    const addedMessages = messages.filter((message) => message.id && !previousIds.has(message.id));

    if (!hasInitialScrollRef.current && messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom('auto'));
      hasInitialScrollRef.current = true;
      previousMessagesRef.current = messages;
      return;
    }

    const shouldKeepLatestVisible = keepLatestVisibleRef.current || userNearBottomRef.current;

    if (addedMessages.some((message) => message.sender === currentUserId) || shouldKeepLatestVisible) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    } else {
      const incomingCount = addedMessages.filter((message) => message.sender !== currentUserId).length;
      if (incomingCount > 0) {
        setNewMessageCount((count) => count + incomingCount);
      }
    }

    previousMessagesRef.current = messages;
  }, [messages, currentUserId, scrollToBottom]);

  useEffect(() => {
    const messagePanel = messagesRef.current;
    if (!messagePanel) return undefined;

    const handleScroll = () => {
      if (updateNearBottomState()) {
        setNewMessageCount(0);
      }
    };

    messagePanel.addEventListener('scroll', handleScroll, { passive: true });
    return () => messagePanel.removeEventListener('scroll', handleScroll);
  }, [updateNearBottomState]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const keepFocusedInputVisible = () => {
      if (document.activeElement === inputRef.current && keepLatestVisibleRef.current) {
        settleLatestMessages();
      }
    };

    viewport.addEventListener('resize', keepFocusedInputVisible);
    viewport.addEventListener('scroll', keepFocusedInputVisible);

    return () => {
      viewport.removeEventListener('resize', keepFocusedInputVisible);
      viewport.removeEventListener('scroll', keepFocusedInputVisible);
    };
  }, [settleLatestMessages]);

  useEffect(() => {
    const messagePanel = messagesRef.current;
    if (!messagePanel || !onMessageRead || !currentUserId) return undefined;

    readObserverRef.current?.disconnect();
    readObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;

        const messageId = entry.target.getAttribute('data-message-id');
        if (!messageId || readQueuedRef.current.has(messageId)) return;

        readQueuedRef.current.add(messageId);
        onMessageRead(messageId);
      });
    }, {
      root: messagePanel,
      threshold: 0.6,
    });

    const unreadIncomingMessages = messages
      .filter((message) => (
        message.id
        && message.sender !== currentUserId
        && !message.readBy?.[currentUserId]
      ));

    unreadIncomingMessages.forEach((message) => {
      const messageElement = messagePanel.querySelector(`[data-message-id="${message.id}"]`);
      if (messageElement) {
        readObserverRef.current.observe(messageElement);
      }
    });

    return () => {
      readObserverRef.current?.disconnect();
    };
  }, [messages, currentUserId, onMessageRead]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, []);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return undefined;

    const updateComposerHeight = () => {
      setComposerHeight(composer.offsetHeight);
      if (document.activeElement === inputRef.current && keepLatestVisibleRef.current) {
        requestAnimationFrame(() => scrollToBottom('auto'));
      }
    };

    updateComposerHeight();

    if (!window.ResizeObserver) {
      window.addEventListener('resize', updateComposerHeight);
      return () => window.removeEventListener('resize', updateComposerHeight);
    }

    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(composer);

    return () => observer.disconnect();
  }, [scrollToBottom]);

  useEffect(() => () => {
    clearTimeout(typingTimeoutRef.current);
    onTypingChange?.(false);
  }, [onTypingChange]);

  const stopTypingSoon = () => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTypingChange?.(false);
    }, 1500);
  };

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
    clearTimeout(typingTimeoutRef.current);
    onTypingChange?.(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleInputChange = (e) => {
    const nextInput = e.target.value;
    setInput(nextInput);

    if (nextInput.trim()) {
      onTypingChange?.(true);
      stopTypingSoon();
    } else {
      clearTimeout(typingTimeoutRef.current);
      onTypingChange?.(false);
    }
  };

  const handleInputFocus = () => {
    keepLatestVisibleRef.current = updateNearBottomState();
    if (keepLatestVisibleRef.current) {
      settleLatestMessages();
    }
  };

  const handleInputBlur = () => {
    keepLatestVisibleRef.current = false;
  };

  const getMessageDetails = (msg) => ({
    text: typeof msg === 'string' ? msg : msg.text,
    sender: typeof msg === 'string' ? null : msg.sender,
    replyTo: typeof msg === 'string' ? null : msg.replyTo,
  });

  const formatMessageTime = (msg) => {
    if (typeof msg === 'string') return '';

    const createdAt = msg.createdAt;
    const date = createdAt?.toDate?.() || (createdAt ? new Date(createdAt) : new Date());

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getOwnMessageStatus = (msg) => {
    if (typeof msg === 'string') return 'sent';

    const hasBeenRead = Object.keys(msg.readBy || {}).some((userId) => userId !== currentUserId);
    if (hasBeenRead) return 'read';

    const hasBeenDelivered = Object.keys(msg.deliveredTo || {}).some((userId) => userId !== currentUserId);
    if (hasBeenDelivered) return 'delivered';

    return 'sent';
  };

  const selectReply = (msg) => {
    const { text, sender } = getMessageDetails(msg);
    setReplyingTo({ text, sender });
    setContextMenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancelReply = () => {
    setReplyingTo(null);
    requestAnimationFrame(() => inputRef.current?.focus());
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
      <div className="messages" ref={messagesRef}>
        {messages.map((msg, idx) => {
          // Handle both old string format and new object format
          const { text: messageText, sender: senderId, replyTo } = getMessageDetails(msg);
          const isOwnMessage = senderId === currentUserId || (senderId === 'local-user' && !currentUserId);

          return (
            <div
              key={msg.id || idx}
              className={`message-row ${isOwnMessage ? 'own-message-row' : 'other-message-row'}`}
              data-message-id={msg.id || ''}
            >
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
                <div className="message-content">
                  <span>{messageText}</span>
                  {formatMessageTime(msg) && (
                    <span className={`message-meta ${isOwnMessage ? 'own-message-meta' : 'other-message-meta'}`}>
                      <span className="message-time">{formatMessageTime(msg)}</span>
                      {isOwnMessage && (
                        <span
                          className={`message-status message-status-${getOwnMessageStatus(msg)}`}
                          aria-label={`Message ${getOwnMessageStatus(msg)}`}
                          title={`Message ${getOwnMessageStatus(msg)}`}
                        >
                          <span className="status-tick">{'\u2713'}</span>
                          {getOwnMessageStatus(msg) !== 'sent' && (
                            <span className="status-tick status-tick-overlap">{'\u2713'}</span>
                          )}
                        </span>
                      )}
                    </span>
                  )}
                </div>
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
        {typingUsers.length > 0 && (
          <div className="message-row other-message-row typing-message-row">
            <div className="typing-indicator" aria-label="Typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {newMessageCount > 0 && (
        <button
          className="new-message-indicator"
          type="button"
          style={{ bottom: `calc(${composerHeight + 8}px + env(safe-area-inset-bottom))` }}
          onClick={() => scrollToBottom('smooth')}
        >
          {newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'}
        </button>
      )}

      <div className="chat-composer" ref={composerRef}>
        {replyingTo && (
          <div className="replying-banner">
            <div>
              <strong>Replying to</strong>
              <span>{replyingTo.text}</span>
            </div>
            <button
              aria-label="Cancel reply"
              onMouseDown={(event) => event.preventDefault()}
              onTouchStart={(event) => event.preventDefault()}
              onClick={cancelReply}
            >
              &times;
            </button>
          </div>
        )}
        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyPress={handleKeyPress}
          />
          <button type="submit" onMouseDown={(event) => event.preventDefault()}>Send</button>
        </form>
      </div>
    </div>
  );
}

export default Chat;
