// src/components/ChatWindow.js
import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css'; // 채팅창 스타일

function ChatWindow({ messages, ws, currentRoomId, nickname }) {
  const [inputMessage, setInputMessage] = useState('');
  const chatLogRef = useRef(null); // 메시지 스크롤을 위한 ref
  const messageInputRef = useRef(null); // 입력 필드 포커스 제어를 위한 ref

  useEffect(() => {
    // 메시지 추가 시 스크롤 최하단으로
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    if (inputMessage.trim() && ws && ws.readyState === WebSocket.OPEN) {
      const messageToSend = inputMessage; // 현재 메시지 저장
      
      ws.send(JSON.stringify({
        type: 'chat',
        from: nickname,
        message: messageToSend, // 띄어쓰기 포함된 원본 메시지 전송
        roomId: currentRoomId
      }));

      // 본인 메시지를 직접 messages 배열에 추가하여 바로 화면에 표시
      // (서버에서 다시 에코되는 메시지와 중복될 경우,
      //  실제 앱에서는 메시지마다 고유 ID를 부여하여 중복을 방지합니다.)
      messages.push({ from: nickname, message: messageToSend }); // 현재 prop으로 받은 messages 배열에 직접 추가

      setInputMessage(''); // 입력 필드 초기화

      // 메시지 전송 후 입력 필드의 포커스를 해제하여 방향키가 캐릭터 이동에만 사용되도록 함
      if (messageInputRef.current) {
        messageInputRef.current.blur(); 
      }
    }
  };

  return (
    <div className="chat-window"> {/* ChatWindow.css에 맞게 클래스 이름 통일 */}
      <div className="chat-log" ref={chatLogRef}> {/* ChatWindow.css에 맞게 클래스 이름 통일 */}
        {messages.map((msg, index) => (
          <div key={index} className={msg.from === 'system' ? 'system-message' : 'chat-message'}>
            <strong>{msg.from}:</strong> {msg.message}
          </div>
        ))}
      </div>
      <div className="chat-input-container">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // Enter 키로 인한 기본 동작(예: 폼 제출, 줄바꿈) 방지
              sendMessage();
            }
          }}
          placeholder="메시지를 입력하세요..."
          ref={messageInputRef} // 입력 필드 ref 연결
        />
        <button onClick={sendMessage}>전송</button>
      </div>
    </div>
  );
}

export default ChatWindow;