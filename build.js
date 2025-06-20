const fs = require('fs');
const path = require('path');

// Tạo thư mục dist nếu chưa có
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy worker.js từ src sang dist
fs.copyFileSync(
  path.join('src', 'worker.js'),
  path.join('dist', 'worker.js')
);

console.log('Successfully copied src/worker.js to dist/worker.js'); 