const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readAnnouncements } = require('./githubStorage');
const fs = require('fs');
const path = require('path');

// ── Almacenamiento de tickets en memoria + archivo local ──────────────────────
// En Render, los tickets se pierden al reiniciar, pero los canales de Discord
// se mantienen. Solo necesitamos persistencia mientras el bot está activo.
const ticketsMemory = {};

function saveTicket(ticket) {
    ticketsMemory[ticket.id] = ticket;
    // Intentar guardar en disco también (fallback)
    try {
        const dir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, 'tickets.json');
        const existing = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
        existing[ticket.id] = ticket;
        fs.writeFileSync(p, JSON.stringify(existing, null, 2));
    } catch (_) {}
}

function getTicket(id) {
    if (ticketsMemory[id]) return ticketsMemory[id];
    try {
        const p = path.join(__dirname, '..', 'data', 'tickets.json');
        if (fs.existsSync(p)) {
            const all = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (all[id]) { ticketsMemory[id] = all[id]; return all[id]; }
        }
    } catch (_) {}
    return null;
}

function getUserOpenTicket(userId, guildId) {
    // Revisar memoria
    for (const t of Object.values(ticketsMemory)) {
        if (t.userId === userId && t.guildId === guildId && t.status === 'open') return t;
    }
    // Revisar archivo
    try {
        const p = path.join(__dirname, '..', 'data', 'tickets.json');
        if (fs.existsSync(p)) {
            const all = JSON.parse(fs.readFileSync(p, 'utf-8'));
            for (const t of Object.values(all)) {
                if (t.userId === userId && t.guildId === guildId && t.status === 'open') {
                    ticketsMemory[t.id] = t;
                    return t;
                }
            }
        }
    } catch (_) {}
    return null;
}

function countGuildTickets(guildId) {
    try {
        const p = path.join(__dirname, '..', 'data', 'tickets.json');
        if (fs.existsSync(p)) {
            const all = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return Object.values(all).filter(t => t.guildId === guildId).length;
        }
    } catch (_) {}
    return Object.values(ticketsMemory).filter(t => t.guildId === guildId).length;
}

// ── Config del servidor (en memoria) ─────────────────────────────────────────
const configCache = {};

function getConfig(guildId) {
    return configCache[guildId] || { ticketCategory: 'TICKETS', logChannel: 'logs', adminRoles: [] };
}

// ── TicketHandler ─────────────────────────────────────────────────────────────
class TicketHandler {

    static async handleTicketSelection(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const announcementKey = interaction.customId.replace('ticket_select_', '');
            const selectedValue = interaction.values[0];

            // Buscar anuncio (GitHub storage o config.json)
            let announcement = null;
            try {
                const announcements = await readAnnouncements();
                announcement = announcements[announcementKey];
            } catch (_) {}

            // Fallback: buscar en config.json local
            if (!announcement) {
                try {
                    const cfg = require('../config.json');
                    announcement = cfg.announcements && cfg.announcements[announcementKey];
                } catch (_) {}
            }

            if (!announcement) {
                return await interaction.editReply({ content: '❌ Anuncio no encontrado. Vuelve a enviarlo desde el panel.' });
            }

            const selectedOption = announcement.options && announcement.options.find(opt => opt.value === selectedValue);
            if (!selectedOption) {
                return await interaction.editReply({ content: '❌ Opción no válida.' });
            }

            // Verificar ticket abierto existente
            const existing = getUserOpenTicket(interaction.user.id, interaction.guild.id);
            if (existing) {
                return await interaction.editReply({ content: `Ya tienes un ticket abierto: <#${existing.channelId}>` });
            }

            const config = getConfig(interaction.guild.id);
            const ticket = await this.createTicket(interaction, announcementKey, selectedOption, config);
            await interaction.editReply({ content: `✅ Tu ticket fue creado: <#${ticket.channelId}>` });

        } catch (error) {
            console.error('Error creando ticket:', error);
            try { await interaction.editReply({ content: '❌ Error al crear el ticket. Intenta nuevamente.' }); } catch (_) {}
        }
    }

    static async createTicket(interaction, announcementKey, selectedOption, config) {
        const guild = interaction.guild;
        const user = interaction.user;

        // Buscar o crear categoría
        let category = guild.channels.cache.find(c =>
            c.type === ChannelType.GuildCategory &&
            c.name.toLowerCase() === (config.ticketCategory || 'TICKETS').toLowerCase()
        );
        if (!category) {
            category = await guild.channels.create({
                name: config.ticketCategory || 'TICKETS',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }]
            });
        }

        const count = countGuildTickets(guild.id) + 1;
        const channelName = `ticket-${count}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15)}`;

        // Permisos
        const permissionOverwrites = [
            { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            }
        ];

        for (const roleName of (config.adminRoles || [])) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.AttachFiles
                    ]
                });
            }
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites
        });

        const ticketId = `${guild.id}-${count}`;
        const ticketData = {
            id: ticketId,
            channelId: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            ownerId: guild.ownerId,
            type: announcementKey,
            option: selectedOption.label,
            optionValue: selectedOption.value,
            status: 'open',
            createdAt: new Date().toISOString()
        };
        saveTicket(ticketData);

        // Mensaje bienvenida + botón cerrar
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${count}`)
            .setDescription(`**Usuario:** <@${user.id}>\n**Opción:** ${selectedOption.label}\n**Descripción:** ${selectedOption.description || ''}`)
            .setColor('#FFD700')
            .setTimestamp()
            .setFooter({ text: `ID: ${ticketId}` });

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketId}`)
                .setLabel('🔒 Cerrar Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
            content: `<@${user.id}> ¡Bienvenido! Un administrador te atenderá pronto.`,
            embeds: [embed],
            components: [closeBtn]
        });

        // Log
        try {
            const logCh = guild.channels.cache.find(c => c.name === (config.logChannel || 'logs'));
            if (logCh) {
                await logCh.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🎫 Ticket Abierto')
                        .setDescription(`**Usuario:** <@${user.id}>\n**Canal:** <#${ticketChannel.id}>\n**Opción:** ${selectedOption.label}`)
                        .setColor('#27ae60').setTimestamp()]
                });
            }
        } catch (_) {}

        return ticketData;
    }

    // Solo dueño del servidor o roles admin pueden cerrar
    static canClose(interaction) {
        if (interaction.user.id === interaction.guild.ownerId) return true;
        const config = getConfig(interaction.guild.id);
        if (config.adminRoles && config.adminRoles.length > 0) {
            return interaction.member.roles.cache.some(r => config.adminRoles.includes(r.name));
        }
        return false;
    }

    static closeTicket(ticketId, closedBy) {
        const ticket = getTicket(ticketId);
        if (ticket) {
            ticket.status = 'closed';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = closedBy.id;
            saveTicket(ticket);
        }
        return ticket;
    }

    // Guardar config del servidor
    static setGuildConfig(guildId, config) {
        configCache[guildId] = config;
    }
}

module.exports = TicketHandler;