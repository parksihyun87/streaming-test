// src/components/Map.js
import React, { useEffect, useRef } from 'react';
import './Map.css'; // 맵 스타일 (배경 이미지, 크기 등)

// 맵 데이터 (간단한 예시, 실제로는 Tiled 등에서 내보낸 JSON 사용)
const mapData = {
  width: 800,
  height: 600,
  // roomZones: { roomId: { x, y, width, height } }
  roomZones: {
    'forest': { x: 0, y: 0, width: 400, height: 600 },
    'cave': { x: 400, y: 0, width: 400, height: 600 }
  }
};

function Map({ onRoomEnter, currentRoomId }) {
  const mapRef = useRef(null);

  // 캐릭터 위치와 방 구역 충돌 감지 로직 (App.js에서 캐릭터 위치를 Map으로 전달받아 처리하거나,
  // 캐릭터 컴포넌트 내에서 스스로 감지하도록 할 수 있음)
  // 여기서는 Map이 어떤 방에 해당하는지를 시각적으로 표시만 함.
  // 실제 방 입장 로직은 App.js의 캐릭터 이동 로직과 연동되어야 함.

  useEffect(() => {
    // 맵 배경 이미지 등 스타일 설정 (CSS로도 가능)
    if (mapRef.current) {
      mapRef.current.style.width = `${mapData.width}px`;
      mapRef.current.style.height = `${mapData.height}px`;
      // 방 ID에 따라 다른 배경 이미지 설정 (예시)
      if (currentRoomId === 'forest') {
        mapRef.current.style.backgroundImage = `url('/images/forest_map.png')`;
      } else if (currentRoomId === 'cave') {
        mapRef.current.style.backgroundImage = `url('/images/cave_map.png')`;
      } else {
         mapRef.current.style.backgroundImage = `url('/images/default_map.png')`;
      }
      mapRef.current.style.backgroundSize = 'cover';
    }
  }, [currentRoomId]); // 방 ID가 바뀌면 맵 배경 변경

  return (
    <div ref={mapRef} className="map-container">
      {/* 맵 내부 요소들 (예: 건물, 나무 등) */}
      {/* 방 구역 시각화 (선택 사항, 개발용) */}
      {Object.entries(mapData.roomZones).map(([roomId, zone]) => (
        <div
          key={roomId}
          style={{
            position: 'absolute',
            left: zone.x,
            top: zone.y,
            width: zone.width,
            height: zone.height,
            border: `2px ${currentRoomId === roomId ? 'solid green' : 'dashed gray'}`,
            opacity: 0.3,
            boxSizing: 'border-box',
            pointerEvents: 'none', // 클릭 방지
          }}
          title={`Room: ${roomId}`}
        />
      ))}
    </div>
  );
}

export default Map;