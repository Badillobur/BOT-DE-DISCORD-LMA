const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const ConfigManager = require('./utils/configManager');
const LogManager = require('./utils/logManager');
const BackupManager = require('./utils/backupManager');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web/public')));

// Configurar motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// ===========================
// RUTAS WEB INTERFACE
// ===========================

// Página principal
app.get('/', (req, res) => {
    res.render('index', { title: 'Discord Bot Panel' });
});

// Panel de control
app.get('/panel', (req, res) => {
    res.render('panel', { title: 'Panel de Control' });
});

// ===========================
// API ROUTES - AUTH
// ===========================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Contraseña por defecto (cambiar en producción)
        const defaultUser = 'admin';
        const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
        
        if (username === defaultUser && password === defaultPassword) {
            const token = jwt.sign(
                { username, role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            await LogManager.log(
                LogManager.LogTypes.INFO,
                'Admin login successful',
                { username, ip: req.ip }
            );
            
            res.json({ token, user: { username, role: 'admin' } });
        } else {
            res.status(401).json({ error: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// ===========================
// API ROUTES - CONFIGURACIÓN
// ===========================

// Obtener configuración global
app.get('/api/config/global', authenticateToken, async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = await fs.readJson(configPath);
        
        // No enviar token por seguridad
        const safeConfig = { ...config };
        delete safeConfig.token;
        
        res.json(safeConfig);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar configuración global
app.put('/api/config/global', authenticateToken, async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const currentConfig = await fs.readJson(configPath);
        
        // Preservar token y clientId
        const updatedConfig = {
            ...req.body,
            token: currentConfig.token,
            clientId: currentConfig.clientId
        };
        
        await fs.writeJson(configPath, updatedConfig, { spaces: 2 });
        
        await LogManager.log(
            LogManager.LogTypes.CONFIG_CHANGE,
            'Global config updated via web panel',
            { adminUser: req.user.username, changes: Object.keys(req.body) }
        );
        
        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================
// API ROUTES - ANUNCIOS
// ===========================

// Obtener todos los anuncios
app.get('/api/announcements', authenticateToken, async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = await fs.readJson(configPath);
        
        res.json(config.announcements || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear nuevo anuncio
app.post('/api/announcements', authenticateToken, async (req, res) => {
    try {
        const { id, announcement } = req.body;
        
        if (!id || !announcement) {
            return res.status(400).json({ error: 'ID y datos del anuncio requeridos' });
        }
        
        const configPath = path.join(__dirname, 'config.json');
        const config = await fs.readJson(configPath);
        
        if (!config.announcements) {
            config.announcements = {};
        }
        
        config.announcements[id] = announcement;
        await fs.writeJson(configPath, config, { spaces: 2 });
        
        await LogManager.log(
            LogManager.LogTypes.ANNOUNCEMENT_CREATE,
            `Announcement created via web panel: ${id}`,
            { adminUser: req.user.username, announcementId: id }
        );
        
        res.json({ success: true, message: 'Anuncio creado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar anuncio existente
app.put('/api/announcements/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = req.body;
        
        const configPath = path.join(__dirname, 'config.json');
        const config = await fs.readJson(configPath);
        
        if (!config.announcements || !config.announcements[id]) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        config.announcements[id] = announcement;
        await fs.writeJson(configPath, config, { spaces: 2 });
        
        await LogManager.log(
            LogManager.LogTypes.ANNOUNCEMENT_EDIT,
            `Announcement updated via web panel: ${id}`,
            { adminUser: req.user.username, announcementId: id }
        );
        
        res.json({ success: true, message: 'Anuncio actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar anuncio
app.delete('/api/announcements/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const configPath = path.join(__dirname, 'config.json');
        const config = await fs.readJson(configPath);
        
        if (!config.announcements || !config.announcements[id]) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        delete config.announcements[id];
        await fs.writeJson(configPath, config, { spaces: 2 });
        
        await LogManager.log(
            LogManager.LogTypes.ANNOUNCEMENT_DELETE,
            `Announcement deleted via web panel: ${id}`,
            { adminUser: req.user.username, announcementId: id }
        );
        
        res.json({ success: true, message: 'Anuncio eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================
// API ROUTES - ESTADÍSTICAS
// ===========================

// Obtener estadísticas generales
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const ticketsPath = path.join(__dirname, 'data/tickets.json');
        const blacklistPath = path.join(__dirname, 'data/blacklist.json');
        
        let totalTickets = 0;
        let activeTickets = 0;
        let totalUsers = 0;
        
        if (await fs.pathExists(ticketsPath)) {
            const tickets = await fs.readJson(ticketsPath);
            const ticketArray = Object.values(tickets);
            totalTickets = ticketArray.length;
            activeTickets = ticketArray.filter(t => t.status === 'open').length;
            totalUsers = new Set(ticketArray.map(t => t.userId)).size;
        }
        
        let blacklistedUsers = 0;
        if (await fs.pathExists(blacklistPath)) {
            const blacklist = await fs.readJson(blacklistPath);
            blacklistedUsers = Object.values(blacklist).reduce((total, guild) => {
                return total + Object.keys(guild).length;
            }, 0);
        }
        
        res.json({
            totalTickets,
            activeTickets,
            closedTickets: totalTickets - activeTickets,
            totalUsers,
            blacklistedUsers
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================
// API ROUTES - LOGS
// ===========================

// Obtener logs recientes
app.get('/api/logs', authenticateToken, async (req, res) => {
    try {
        const { days = 7, type = 'all' } = req.query;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        // Obtener logs de los últimos días
        const logs = [];
        for (let i = 0; i < parseInt(days); i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayLogs = await LogManager.getLogsByDate(dateStr);
            if (dayLogs) {
                logs.push(...dayLogs.entries);
            }
        }
        
        // Filtrar por tipo si es necesario
        let filteredLogs = logs;
        if (type !== 'all') {
            filteredLogs = logs.filter(log => log.type === type);
        }
        
        // Ordenar por timestamp (más reciente primero)
        filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json(filteredLogs.slice(0, 100)); // Últimos 100 logs
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================
// API ROUTES - RESPALDOS
// ===========================

// Listar respaldos
app.get('/api/backups', authenticateToken, async (req, res) => {
    try {
        const backups = await BackupManager.listBackups();
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear respaldo
app.post('/api/backups', authenticateToken, async (req, res) => {
    try {
        const { type = 'full' } = req.body;
        
        let backup;
        if (type === 'full') {
            backup = await BackupManager.createFullBackup();
        } else {
            const backups = await BackupManager.listBackups();
            if (backups.length === 0) {
                return res.status(400).json({ error: 'Se requiere un respaldo completo primero' });
            }
            backup = await BackupManager.createIncrementalBackup(backups[0].timestamp);
        }
        
        await LogManager.log(
            LogManager.LogTypes.INFO,
            `Backup created via web panel: ${backup.name}`,
            { adminUser: req.user.username, backupType: type }
        );
        
        res.json({ success: true, backup });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================
// MANEJO DE ERRORES
// ===========================

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Ruta 404
app.use((req, res) => {
    res.status(404).render('404', { title: 'Página no encontrada' });
});

// ===========================
// INICIAR SERVIDOR
// ===========================

app.listen(PORT, () => {
    console.log(`🌐 Servidor web iniciado en puerto ${PORT}`.green);
    console.log(`📱 Panel: http://localhost:${PORT}`.cyan);
    
    // Iniciar bot en paralelo
    if (process.env.NODE_ENV !== 'web-only') {
        require('./index.js');
    }
});

module.exports = app;