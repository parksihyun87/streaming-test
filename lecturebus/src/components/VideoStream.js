// src/components/VideoStream.js
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import './VideoStream.css';

// WebRTC 관련 상수는 전역적으로 또는 환경 변수로 관리하는 것이 좋습니다.
// 실제 서비스에서는 여기에 유료 STUN/TURN 서버를 추가하는 것이 좋습니다.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

// VideoStream 컴포넌트를 forwardRef로 감싸서 부모 컴포넌트에서 ref를 통해 내부 함수를 호출할 수 있게 합니다.
const VideoStream = forwardRef(({ ws, roomId, viewerId, nickname }, ref) => {
  const videoRef = useRef(null);
  const peerConnection = useRef(null);
  const iceCandidateQueue = useRef([]); // Offer가 오기 전에 Candidate가 먼저 도착할 경우를 대비한 큐
  const [currentStream, setCurrentStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('대기 중'); // '대기 중', '연결 중', '연결됨', '오류', '끊김'

  // --- WebRTC 핵심 로직 ---

  // RTCPeerConnection 객체를 생성하고 이벤트 리스너를 설정하는 함수
  const createPeerConnection = useCallback(() => {
    // 기존 PeerConnection이 있다면 정리
    if (peerConnection.current) {
      console.log('기존 PeerConnection 정리 중...');
      peerConnection.current.close();
      peerConnection.current = null;
      setCurrentStream(null);
      setConnectionStatus('대기 중');
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // 원격 스트림이 추가될 때
    pc.ontrack = (event) => {
      console.log('🎥 미디어 스트림 수신:', event.streams[0]);
      if (videoRef.current && videoRef.current.srcObject !== event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setCurrentStream(event.streams[0]);
        setConnectionStatus('연결됨');
      }
    };

    // ICE Candidate가 생성될 때 (네트워크 경로 정보)
    pc.onicecandidate = (event) => {
      if (event.candidate && ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log('📤 ICE Candidate 전송:', event.candidate);
        ws.current.send(JSON.stringify({
          type: 'candidate',
          from: viewerId,
          to: 'sender', // 이 시나리오에서는 방의 송신자에게 보냄. 실제로는 송신자의 고유 ID를 사용해야 더 정확함.
          candidate: event.candidate,
          roomId: roomId
        }));
      }
    };

    // PeerConnection의 전체 연결 상태 변화 감지
    pc.onconnectionstatechange = () => {
      console.log(`🔗 WebRTC 연결 상태: ${pc.connectionState}`);
      setConnectionStatus(pc.connectionState);
      if (pc.connectionstate === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setCurrentStream(null);
        console.log('WebRTC 연결이 끊겼거나 실패했습니다.');
      }
    };

    // ICE 연결 상태 변화 감지 (네트워크 연결 상태)
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE 연결 상태: ${pc.iceConnectionState}`);
    };

    peerConnection.current = pc;
    console.log('✅ RTCPeerConnection 생성 완료');
    return pc;
  }, [ws, viewerId, roomId]); // ws, viewerId, roomId가 변경될 때마다 함수 재생성

  // Offer 메시지 처리 함수 (App.js에서 호출됨)
  const handleOffer = useCallback(async (data) => {
    console.log('📨 Offer 수신:', data);
    setConnectionStatus('연결 중...');

    // roomId가 다르면 처리하지 않음 (이 메시지가 현재 방과 관련 있는지 확인)
    if (data.roomId !== roomId) {
      console.warn(`Offer의 방 ID(${data.roomId})가 현재 방 ID(${roomId})와 다릅니다. 무시합니다.`);
      return;
    }

    const pc = createPeerConnection(); // 새로운 PC 생성 또는 기존 PC 재활용

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      console.log('✅ Remote Description (Offer) 설정 완료');

      // Offer가 도착하기 전에 큐에 쌓인 ICE Candidate들을 추가
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        try {
          // RTCIceCandidate는 객체로 변환하여 사용
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ 큐에 있던 ICE Candidate 추가');
        } catch (e) {
          console.warn('⚠️ 큐에 있던 ICE Candidate 추가 실패:', e);
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('✅ Local Description (Answer) 설정 완료');

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log('📤 Answer 전송:', answer);
        ws.current.send(JSON.stringify({
          type: 'answer',
          from: viewerId,
          to: data.from, // Offer를 보낸 송신자에게 응답
          sdp: answer,
          roomId: roomId
        }));
      }
    } catch (error) {
      console.error('❌ Offer 처리 실패:', error);
      setConnectionStatus('오류');
      // 오류 발생 시 PeerConnection 정리
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    }
  }, [createPeerConnection, ws, viewerId, roomId]);

  // Candidate 메시지 처리 함수 (App.js에서 호출됨)
  const handleCandidate = useCallback(async (data) => {
    // roomId가 다르면 처리하지 않음
    if (data.roomId !== roomId) {
        console.warn(`Candidate의 방 ID(${data.roomId})가 현재 방 ID(${roomId})와 다릅니다. 무시합니다.`);
        return;
    }

    // PeerConnection이 아직 생성되지 않았거나 Remote Description이 설정되지 않았다면 큐에 저장
    if (!peerConnection.current || !peerConnection.current.remoteDescription || peerConnection.current.remoteDescription.type === undefined) {
      console.log('🧊 ICE Candidate 큐에 저장 (PeerConnection 초기화 또는 Remote Description 설정 대기 중)');
      iceCandidateQueue.current.push(data.candidate);
      return;
    }

    try {
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      console.log('✅ ICE Candidate 추가');
    } catch (error) {
      // "Error: Failed to set remote answer sdp: Failed to set ICE candidate"와 같은 오류는
      // 이미 추가되었거나 유효하지 않은 candidate일 수 있으므로 경고로 처리
      console.warn('⚠️ ICE Candidate 추가 실패:', error);
    }
  }, [roomId]);


  // WebRTC 연결을 강제로 종료하는 함수
  const closePeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log('WebRTC 연결 종료 요청 받음.');
      peerConnection.current.close();
      peerConnection.current = null;
      setCurrentStream(null);
      setConnectionStatus('끊김');
      iceCandidateQueue.current = []; // 큐 초기화
    }
  }, []);

  // useImperativeHandle: 부모 컴포넌트(App.js)에서 이 컴포넌트의 특정 함수들을 호출할 수 있게 합니다.
  useImperativeHandle(ref, () => ({
    handleOffer: handleOffer,
    handleCandidate: handleCandidate,
    closePeerConnection: closePeerConnection,
    // 필요하다면 다른 WebRTC 관련 함수들도 노출할 수 있습니다.
  }));

  // roomId가 변경되면 WebRTC 연결을 재설정 (혹은 종료 후 재시작)
  useEffect(() => {
    console.log(`VideoStream - roomId 변경 감지: ${roomId}`);
    if (peerConnection.current) {
        closePeerConnection(); // 기존 연결 종료
    }
    // 새 방에 진입 시 자동으로 Offer를 받게 될 것이므로, 여기서 바로 PeerConnection을 생성할 필요는 없음
    // Sender가 'sender-available' 또는 Offer를 보내줄 때까지 기다림
  }, [roomId, closePeerConnection]); // roomId가 변경될 때마다 실행

  // 컴포넌트 언마운트 시 WebRTC 연결 정리
  useEffect(() => {
    return () => {
      closePeerConnection();
    };
  }, [closePeerConnection]);


  return (
    <div className="video-stream-container">
      <h3>방송 화면 ({connectionStatus})</h3>
      <video ref={videoRef} autoPlay playsInline controls muted={false}></video> {/* muted는 개발 중 편의를 위함, 실제로는 false */}
      {!currentStream && connectionStatus !== '연결됨' && <p>스트림을 기다리는 중입니다...</p>}
      {currentStream && <p>스트리밍 연결됨!</p>}
      {connectionStatus === '오류' && <p style={{color: 'red'}}>스트리밍 연결에 실패했습니다.</p>}
    </div>
  );
});

export default VideoStream;