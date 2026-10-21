const Pusher = require('pusher');

const pusher = new Pusher({
  appId: '2187391',
  key: '0a60accf2ff212f780e5',
  secret: '4ac57b886baf21bf22b2',
  cluster: 'us3',
  useTLS: true
});

console.log('[pusher-server.js] Pusher server initialized');

module.exports = pusher;
