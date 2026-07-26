const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('Packaging build zip...');

// Načtení verze z version.json
const versionPath = path.join(__dirname, '../version.json');
let version = '1.0.0';
if (fs.existsSync(versionPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        if (data.version) version = data.version;
    } catch (e) {}
}

// Cílová složka pro zip
const zipDir = path.join(__dirname, '../build_zip');
if (!fs.existsSync(zipDir)) {
    fs.mkdirSync(zipDir, { recursive: true });
}

const zipPath = path.join(zipDir, `BeneGToolkit-v${version}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`Zip packaging complete: ${zipPath} (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);

// Určíme složku se zdrojovými soubory (dist nebo src)
const srcDir = fs.existsSync(path.join(__dirname, '../dist')) 
    ? path.join(__dirname, '../dist') 
    : path.join(__dirname, '../src');

// KLÍČOVÝ KROK: Druhý parametr 'BeneGToolkit' zabalí vše do podsložky BeneGToolkit uvnitř ZIPu
archive.directory(srcDir, 'BeneGToolkit');

archive.finalize();