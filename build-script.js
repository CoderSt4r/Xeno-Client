const fs = require('fs');
const path = require('path');

const filesToCopy = [
    'main.js', 'renderer.js', 'login.js', 'preload.js', 
    'index.html', 'login.html', 'styles.css', 'login.css', 
    'package.json'
];

const buildPackDir = path.join(__dirname, 'build-pack');
const buildDir = path.join(buildPackDir, 'build');

// Clean and create directories
if (fs.existsSync(buildPackDir)) fs.rmSync(buildPackDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

// Copy code files
filesToCopy.forEach(file => {
    if (fs.existsSync(path.join(__dirname, file))) {
        fs.copyFileSync(path.join(__dirname, file), path.join(buildPackDir, file));
    }
});

// Copy node_modules (recursively)
if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
    fs.cpSync(path.join(__dirname, 'node_modules'), path.join(buildPackDir, 'node_modules'), { recursive: true });
}

// Copy icon
if (fs.existsSync(path.join(__dirname, 'build', 'icon.png'))) {
    fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), path.join(buildDir, 'icon.png'));
}

console.log('Build pack prepared successfully!');
