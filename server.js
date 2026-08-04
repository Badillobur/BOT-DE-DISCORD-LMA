const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { connectDB, Announcement, GuildConfig, Ticket } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-change-this';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web/public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// Auth middleware
const auth = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
};

// ── PÁGINAS ──────────────────────────────────────────────
app.get('/', (req, res) => res.render('index', { title: 'Bot Panel' }));
app.get('/panel', (req, res) => res.render('panel', { title: 'Panel de Control' }));
app.get('/ping', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── AUTH ─────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (username === adminUser && password === adminPass) {
        const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token, user: { username } });
    }
    res.status(401).json({ error: 'Credenciales inválidas' });
});

// ── ANUNCIOS ─────────────────────────────────────────────
// Obtener todos
app.get('/api/announcements', auth, async (req, res) => {
    try {
        const list = await Announcement.find();
        const obj = {};
        list.forEach(a => { obj[a._id] = { title: a.title, description: a.description, color: a.color, image: a.image, options: a.options }; });
        res.json(obj);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear anuncio
app.post('/api/announcements', auth, async (req, res) => {
    try {
        const { id, announcement } = req.body;
        if (!id || !announcement) return res.status(400).json({ error: 'ID y datos requeridos' });
        const clean = id.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!clean) return res.status(400).json({ error: 'ID inválido' });
        const existing = await Announcement.findById(clean);
        if (existing) return res.status(400).json({ error: `Ya existe un anuncio con ID "${clean}"` });
        await Announcement.create({ _id: clean, ...announcement });
        res.json({ success: true, message: 'Anuncio creado exitosamente' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Actualizar anuncio
app.put('/api/announcements/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Announcement.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) return res.status(404).json({ error: 'Anuncio no encontrado' });
        res.json({ success: true, message: 'Anuncio actualizado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar anuncio
app.delete('/api/announcements/:id', auth, async (req, res) => {
    try {
        const deleted = await Announcement.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Anuncio no encontrado' });
        res.json({ success: true, message: 'Anuncio eliminado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar anuncio a Discord
app.post('/api/announcements/:id/send', auth, async (req, res) => {
    try {
        const { channelId } = req.body;
        if (!channelId) return res.status(400).json({ error: 'ID del canal requerido' });

        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ error: 'Anuncio no encontrado' });
        if (!announcement.options || announcement.options.length === 0)
            return res.status(400).json({ error: 'El anuncio necesita al menos una opción de ticket' });

        let client;
        try { client = require('./index.js'); } catch (e) {
            return res.status(500).json({ error: 'Bot no disponible. Verifica que el token sea correcto.' });
        }

        const channel = client.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Canal no encontrado. Verifica el ID y que el bot esté en ese servidor.' });

        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

        const embed = new EmbedBuilder()
            .setTitle(announcement.title)
            .setDescription(announcement.description)
            .setColor(announcement.color || '#FFD700')
            .setTimestamp();
        if (announcement.image) embed.setImage(announcement.image);

        const select = new StringSelectMenuBuilder()
            .setCustomId('ticket_select_' + announcement._id)
            .setPlaceholder('Seleccionar una opción');

        announcement.options.forEach(opt => {
            const o = { label: opt.label, description: opt.description, value: opt.value };
            if (opt.emoji) o.emoji = opt.emoji;
            select.addOptions(o);
        });

        await channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(select)]
        });

        res.json({ success: true, message: `Anuncio enviado al canal <#${channelId}>` });
    } catch (e) {
        console.error('Error enviando anuncio:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── CONFIG ────────────────────────────────────────────────
app.get('/api/config/global', auth, async (req, res) => {
    try {
        let cfg = await GuildConfig.findById('global');
        if (!cfg) cfg = { prefix: '!', embedColor: '#FFD700', ticketCategory: 'TICKETS', logChannel: 'logs', adminRoles: [] };
        res.json(cfg);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/config/global', auth, async (req, res) => {
    try {
        await GuildConfig.findByIdAndUpdate('global', req.body, { upsert: true, new: true });
        res.json({ success: true, message: 'Configuración guardada' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
    try {
        const total = await Ticket.countDocuments();
        const active = await Ticket.countDocuments({ status: 'open' });
        const users = await Ticket.distinct('userId');
        res.json({ totalTickets: total, activeTickets: active, closedTickets: total - active, totalUsers: users.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LOGS ──────────────────────────────────────────────────
app.get('/api/logs', auth, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 }).limit(50);
        const logs = tickets.map(t => ({
            type: t.status === 'open' ? 'ticket_create' : 'ticket_close',
            message: `Ticket ${t._id} - ${t.option || ''}`,
            timestamp: t.createdAt,
            metadata: { userId: t.userId, guildId: t.guildId }
        }));
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ERROR HANDLERS ────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});
app.use((req, res) => {
    try { res.status(404).render('404', { title: '404' }); } catch { res.status(404).send('Not found'); }
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`🌐 Servidor en puerto ${PORT}`);
    await connectDB();

    // Auto-ping cada 14 min para no dormirse en Render
    const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(async () => {
        try { await fetch(`${APP_URL}/ping`); } catch (_) {}
    }, 14 * 60 * 1000);

    if (process.env.NODE_ENV !== 'web-only') {
        require('./index.js');
    }
});

module.exports = app;