// Vercel serverless entry: serves the Expo server bundle (API routes) for every request.
const { createRequestHandler } = require('expo-server/adapter/vercel');

module.exports = createRequestHandler({
  build: require('path').join(__dirname, '../dist/server'),
});
