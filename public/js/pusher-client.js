// Pusher client configuration
const pusher = new Pusher('0a60accf2ff212f780e5', {
  cluster: 'us3',
  forceTLS: true
});

console.log('[pusher-client.js] Pusher initialized');
