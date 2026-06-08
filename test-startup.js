// Simple, zero-dependency Node.js test server to isolate Hostinger environment issues
const http = require('http');

const port = process.env.PORT || 5000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <h1>Node.js environment is working!</h1>
    <p>Port: ${port}</p>
    <p>Node Version: ${process.version}</p>
    <p>Time: ${new Date().toISOString()}</p>
  `);
});

server.listen(port, () => {
  console.log(`Test server running on port ${port}`);
});
