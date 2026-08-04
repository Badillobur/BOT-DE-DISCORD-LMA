/**
 * githubStorage.js
 * Guarda los anuncios en GitHub via API para persistencia real.
 * Requiere: GITHUB_TOKEN, GITHUB_REPO (ej: "Badillobur/BOT-DE-DISCORD-LMA"), GITHUB_BRANCH (opcional, default "main")
 */

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'Badillobur/BOT-DE-DISCORD-LMA';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/announcements.json';

function githubRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/contents/${path}`,
            method,
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'DiscordBot',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(responseData) }); }
                catch { resolve({ status: res.statusCode, data: responseData }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// Leer anuncios desde GitHub
async function readAnnouncements() {
    try {
        if (!GITHUB_TOKEN) return readLocalAnnouncements();
        const res = await githubRequest('GET', FILE_PATH);
        if (res.status === 404) return {};
        if (res.status !== 200) return readLocalAnnouncements();
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        return JSON.parse(content);
    } catch (e) {
        console.error('Error leyendo de GitHub:', e.message);
        return readLocalAnnouncements();
    }
}

// Guardar anuncios en GitHub
async function writeAnnouncements(announcements) {
    if (!GITHUB_TOKEN) {
        writeLocalAnnouncements(announcements);
        return;
    }
    try {
        const content = Buffer.from(JSON.stringify(announcements, null, 2)).toString('base64');
        // Obtener SHA del archivo actual (necesario para actualizar)
        let sha = null;
        const existing = await githubRequest('GET', FILE_PATH);
        if (existing.status === 200) sha = existing.data.sha;

        const body = {
            message: 'Update announcements',
            content,
            branch: GITHUB_BRANCH,
            ...(sha ? { sha } : {})
        };
        const res = await githubRequest('PUT', FILE_PATH, body);
        if (res.status !== 200 && res.status !== 201) {
            console.error('Error guardando en GitHub:', res.data.message || res.status);
            writeLocalAnnouncements(announcements);
        }
    } catch (e) {
        console.error('Error escribiendo en GitHub:', e.message);
        writeLocalAnnouncements(announcements);
    }
}

// Fallback local
function readLocalAnnouncements() {
    try {
        const fs = require('fs');
        const p = require('path').join(__dirname, '..', 'data', 'announcements.json');
        if (!fs.existsSync(p)) return {};
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return {}; }
}

function writeLocalAnnouncements(data) {
    try {
        const fs = require('fs');
        const dir = require('path').join(__dirname, '..', 'data');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(require('path').join(dir, 'announcements.json'), JSON.stringify(data, null, 2));
    } catch (e) { console.error('Error guardando local:', e.message); }
}

module.exports = { readAnnouncements, writeAnnouncements };