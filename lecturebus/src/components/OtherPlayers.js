// src/components/OtherPlayers.js
import React from 'react';
import './PlayerCharacter.css'; // 동일한 CSS 사용 가능

function OtherPlayers({ players, currentPlayerId }) {
  return (
    <>
      {Object.entries(players).map(([id, player]) => (
        id !== currentPlayerId && ( // 본인 캐릭터는 제외
          <div
            key={id}
            className="other-player-character"
            style={{ left: player.x, top: player.y }}
          >
            <div className="character-sprite other"></div>
            <div className="character-nickname">{player.nickname}</div>
          </div>
        )
      ))}
    </>
  );
}

export default OtherPlayers;