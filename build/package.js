const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('Starting ZIP packaging process...');

// Resolve project root folder (assumes script is located in a subfolder like 'scripts/')
// Note: If this script is located in the project root directly, change '..' to '.'
const projectRoot = path.resolve(__dirname, '..');

// Read version from version.json (or fallback to package.json)
const versionPath = path.join(projectRoot, 'version.json');
const packagePath = path.join(projectRoot, 'package.json');
let version = '1.0.1';

if (fs.existsSync(versionPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        if (data.version) version = data.version;
    } catch (e) {
        console.warn('Warning: Could not read version.json, using default version.');
    }
} else if (fs.existsSync(packagePath)) {
    try {
        const data = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (data.version) version = data.version;
    } catch (e) {}
}

// Source folder containing all extension files
const srcDir = path.join(projectRoot, 'src');

if (!fs.existsSync(srcDir)) {
    console.error(`Error: Source directory does not exist at path: ${srcDir}`);
    process.exit(1);
}

// Output directory for the generated ZIP
const zipDir = path.join(projectRoot, 'build_zip');
if (!fs.existsSync(zipDir)) {
    fs.mkdirSync(zipDir, { recursive: true });
}

// Destination ZIP file path
const zipPath = path.join(zipDir, `BeneGToolkit-v${version}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    const fileSizeMB = (archive.pointer() / (1024 * 1024)).toFixed(2);
    console.log('--------------------------------------------------');
    console.log(`ZIP packaging complete!`);
    console.log(`Saved to: ${zipPath}`);
    console.log(`File size: ${archive.pointer()} bytes (~${fileSizeMB} MB)`);
    console.log('--------------------------------------------------');
});

archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err);
    } else {
        throw err;
    }
});

archive.on('error', (err) => {
    console.error('Archiver error:', err);
    throw err;
});

// Pipe archive data to the file stream
archive.pipe(output);

// Pack all contents of srcDir into the 'BeneGToolkit' subfolder inside the archive
archive.directory(srcDir, 'BeneGToolkit');

// Finalize the archive creation
archive.finalize();