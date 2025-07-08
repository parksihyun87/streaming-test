// signaling-server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// HTTP 서버 생성 (HTML 파일 서빙용)
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/client.html') {
    const filePath = path.join(__dirname, 'client.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('HTML file not found');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket 서버를 HTTP 서버에 연결
const wss = new WebSocket.Server({ server });

let peers = [];//peer담는 그릇

wss.on('connection', ws => {// ws라는 연결자 객체가 연결되면 푸시함
  console.log('새로운 클라이언트 연결됨');
  peers.push(ws);

  ws.on('message', message => {
    // 받은 메시지를 JSON 파싱, js 객체로 가져옴
    const data = JSON.parse(message);
    console.log('받은 메시지:', data);

    // 모든 피어에게 전달 (본인 제외)
    peers.forEach(peer => {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(data));// js객체를 json문자열 형태로 전송
      }
    });
  });

  ws.on('close', () => {
    console.log('클라이언트 연결 종료');
    peers = peers.filter(p => p !== ws);// p종료시 제거
  });
});

// 서버 시작
server.listen(8080, '0.0.0.0', () => {
  console.log('HTTP 서버가 http://192.168.0.71:8080 에서 실행중');//http://192.168.0.71:8080
  console.log('WebSocket 서버가 ws://192.168.0.71:8080 에서 실행중');
  console.log('다른 컴퓨터에서 http://192.168.0.71:8080 으로 접속하세요');
});