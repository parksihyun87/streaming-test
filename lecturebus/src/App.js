// src/App.js (수정 제안)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map from './components/Map';
import PlayerCharacter from './components/PlayerCharacter';
import OtherPlayers from './components/OtherPlayers';
import ChatWindow from './components/ChatWindow';
import VideoStream from './components/VideoStream'; // WebRTC 비디오 스트림 컴포넌트
import './App.css'; // 기본 CSS

const WS_URL = 'ws://localhost:8080'; // 시그널링 서버 주소

function App() {
  const [nickname, setNickname] = useState('플레이어1');
  const [roomId, setRoomId] = useState('defaultRoom'); // 현재 입장한 방 ID
  const [characterPosition, setCharacterPosition] = useState({ x: 100, y: 100 });
  const [otherPlayers, setOtherPlayers] = useState({}); // { viewerId: { x, y, nickname, roomId } }
  const [chatMessages, setChatMessages] = useState([]);
  // const [videoStream, setVideoStream] = useState(null); // VideoStream 컴포넌트에서 직접 관리하도록 변경
  const ws = useRef(null);
  const viewerIdRef = useRef(Math.random().toString(36).substr(2, 9)); // App 컴포넌트의 고유 ID

  // VideoStream 컴포넌트의 WebRTC 처리 함수를 참조하기 위한 ref
  const videoStreamRef = useRef(null); // VideoStream 컴포넌트의 인스턴스를 참조

  // WebSocket 초기화 및 메시지 핸들러
  useEffect(() => {
    ws.current = new WebSocket(WS_URL);
    ws.current.viewerId = viewerIdRef.current; // WebSocket 객체에 viewerId 저장

    ws.current.onopen = () => {
      console.log('WebSocket 연결됨');
      // 방 입장 메시지 전송 (초기 입장)
      ws.current.send(JSON.stringify({
        type: 'enterRoom',
        role: 'viewer', // 또는 'player' 등 새로운 역할 정의
        viewerId: viewerIdRef.current, // 고유 ID
        roomId: roomId,
        nickname: nickname
      }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('메시지 수신:', data);

      switch (data.type) {
        case 'player_move':
          // 다른 플레이어 위치 업데이트 (다른 방 플레이어는 무시)
          if (data.roomId === roomId) {
            setOtherPlayers(prev => ({
              ...prev,
              [data.viewerId]: { x: data.x, y: data.y, nickname: data.nickname, roomId: data.roomId }
            }));
          }
          break;
        case 'chat':
          setChatMessages(prev => [...prev, { from: data.from, message: data.message }]);
          break;
        case 'like':
        case 'star-balloon':
          // 좋아요/별풍선 메시지 처리 (ChatWindow에서 시스템 메시지로 표시)
          setChatMessages(prev => [...prev, { from: 'system', message: `✨ ${data.from}님이 ${data.type === 'like' ? '좋아요를 눌렀습니다!' : `별풍선 ${data.count}개를 보냈습니다!`}` }]);
          break;
        case 'sender-available':
        case 'no-sender-available':
        case 'sender-disconnected':
          // 송신자 상태 변경 메시지 처리 (UI에 표시 등)
          setChatMessages(prev => [...prev, { from: 'system', message: `🚨 ${data.type}!` }]);
          if (data.type === 'sender-disconnected' && videoStreamRef.current && videoStreamRef.current.closePeerConnection) {
              videoStreamRef.current.closePeerConnection(); // WebRTC 연결 종료 요청
          }
          break;
        case 'offer': // WebRTC offer 처리
          if (data.roomId === roomId && videoStreamRef.current && videoStreamRef.current.handleOffer) {
            videoStreamRef.current.handleOffer(data); // VideoStream 컴포넌트의 함수 호출
          }
          break;
        case 'candidate': // WebRTC candidate 처리
          if (data.roomId === roomId && videoStreamRef.current && videoStreamRef.current.handleCandidate) {
            videoStreamRef.current.handleCandidate(data); // VideoStream 컴포넌트의 함수 호출
          }
          break;
        case 'room-members': // 시청자 목록 업데이트
            // 이 데이터는 OtherPlayers 컴포넌트에서 직접 활용하거나,
            // App.js 상태에 저장하여 다른 곳에서 사용할 수 있습니다.
            // setRoomMembers(data.members);
            break;
        default:
          console.warn('알 수 없는 메시지 타입:', data.type);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket 연결 종료');
      setChatMessages(prev => [...prev, { from: 'system', message: '서버와의 연결이 끊겼습니다.' }]);
      if (videoStreamRef.current && videoStreamRef.current.closePeerConnection) {
          videoStreamRef.current.closePeerConnection(); // WebRTC 연결 종료 요청
      }
    };
    ws.current.onerror = (error) => console.error('WebSocket 오류:', error);

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [roomId, nickname]); // roomId나 nickname 변경 시 WebSocket 재연결

  // 키보드 입력에 따른 캐릭터 이동 및 룸 진입 감지
  useEffect(() => {
    const handleKeyDown = (e) => {
      let newPos = { ...characterPosition };
      const moveAmount = 10;
      const MAP_WIDTH = 800; // Map 컴포넌트의 width와 일치
      const MAP_HEIGHT = 600; // Map 컴포넌트의 height와 일치

      switch (e.key) {
        case 'ArrowUp': case 'w': newPos.y = Math.max(0, newPos.y - moveAmount); break;
        case 'ArrowDown': case 's': newPos.y = Math.min(MAP_HEIGHT, newPos.y + moveAmount); break;
        case 'ArrowLeft': case 'a': newPos.x = Math.max(0, newPos.x - moveAmount); break;
        case 'ArrowRight': case 'd': newPos.x = Math.min(MAP_WIDTH, newPos.x + moveAmount); break;
        default: return;
      }
      setCharacterPosition(newPos);

      // --- 방 진입 감지 로직 (예시) ---
      // 이 부분은 맵 데이터에 따라 유동적으로 변경되어야 합니다.
      let newRoomDetected = roomId;
      if (newPos.x < 400 && roomId !== 'forest') { // 맵의 왼쪽 절반
          newRoomDetected = 'forest';
      } else if (newPos.x >= 400 && roomId !== 'cave') { // 맵의 오른쪽 절반
          newRoomDetected = 'cave';
      }

      if (newRoomDetected !== roomId) {
          setRoomId(newRoomDetected); // roomId 상태 변경 -> useEffect가 WebSocket 재연결 및 enterRoom 메시지 전송
          setOtherPlayers({}); // 방 변경 시 다른 플레이어 목록 초기화
          setChatMessages(prev => [...prev, { from: 'system', message: `✨ 방 "${newRoomDetected}"(으)로 이동합니다.` }]);
          console.log(`방 변경: ${roomId} -> ${newRoomDetected}`);
          // WebRTC 연결도 새로 설정해야 함 (VideoStream 컴포넌트가 roomId 변경을 감지하여 처리)
      }

      // 서버에 위치 업데이트 전송 (모든 플레이어에게 브로드캐스트)
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'player_move',
          viewerId: viewerIdRef.current,
          nickname: nickname,
          x: newPos.x,
          y: newPos.y,
          roomId: newRoomDetected // 현재 방 ID
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [characterPosition, nickname, roomId]);


  return (
    <div className="App">
      <h1>2D 방 이동</h1>
      <div className="game-area">
        {/* Map 컴포넌트에 현재 방 ID 전달 */}
        <Map currentRoomId={roomId} />
        <PlayerCharacter position={characterPosition} nickname={nickname} />
        <OtherPlayers players={otherPlayers} currentPlayerId={viewerIdRef.current} />
      </div>
      <ChatWindow messages={chatMessages} ws={ws.current} currentRoomId={roomId} nickname={nickname} />

      {/* VideoStream 컴포넌트에 ref와 필요한 prop들을 전달 */}
      {/* VideoStream 컴포넌트가 내부적으로 WebRTC 연결을 관리하도록 */}
      <VideoStream
        ref={videoStreamRef} // WebRTC 함수들을 App.js에서 호출하기 위함
        ws={ws}
        roomId={roomId}
        viewerId={viewerIdRef.current}
        nickname={nickname}
      />

      {/* 닉네임/방 ID 설정 UI (선택 사항) */}
      <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h3>설정</h3>
        <p>현재 방: <strong>{roomId}</strong></p>
        <label>
          닉네임:
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={() => { /* 닉네임 변경 시 서버에 알리는 로직 추가 가능 */ }}
          />
        </label>
      </div>
    </div>
  );
}

export default App;