// src/components/PlayerCharacter.js
import React from 'react';
import './PlayerCharacter.css'; // 캐릭터 스타일 (크기, 스프라이트 애니메이션)

function PlayerCharacter({ position, nickname }) {
  // position: { x, y }
  // 맵 내에서 캐릭터의 위치를 absolute 포지셔닝으로 제어
  return (
    <div
      className="player-character"
      style={{ left: position.x, top: position.y }}
    >
      <div className="character-sprite"></div> {/* 실제 캐릭터 이미지 */}
      <div className="character-nickname">{nickname}</div>
    </div>
  );
}

export default PlayerCharacter;