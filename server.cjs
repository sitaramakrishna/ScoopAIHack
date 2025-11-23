const express = require('express');
const path = require('path');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/secrets', (req, res) => {
  res.json({
    googleGenaiApiKey: process.env.GOOGLE_GENAI_API_KEY,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    googleClientId: process.env.VITE_GOOGLE_CLIENT_ID,
    googleAuthSecret: process.env.VITE_GOOGLE_AUTH_SECRET
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
