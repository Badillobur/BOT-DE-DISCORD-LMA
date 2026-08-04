const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ConfigManager = require('./configManager');
const fs = require('fs-extra');
const path = require('path');

class TicketHandler {
    static ticketsPath = path.join(__dirname, '..', 'data', 'tickets.json');

    static async initialize() {
        const dataDir = path.join(__dirname, '..', 'data');
        await fs.ensureDir(dataDir);
        if (!await fs.pathExists(this.ticketsPath)) {
            await fs.writeJson(this.ticketsPath, {});
        }
    }

    // Manejar selección de menú desde Discord
    static async handleTicketSelection(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const parts = interaction.customId.split('_');
            // customId format: ticket_select_ANNOUNCEMENTID
            const announcementKey = parts.slice(2).join('_');
            const selectedValue = interaction.values[0];

            const config = await ConfigManager.getGuildConfig(interaction.guild.id);
            const announcement = config.announcements && config.announcements[announcementKey];

            if (!announcement) {
                return await interaction.editReply({ content: '❌ Anuncio no encontrado.' });
            }

            const selectedOption = announcement.options.find(opt => opt.value === selectedValue);
            if (!selectedOption) {
                return await interaction.editReply({ content: '❌ Opción no válida.' });
            }

            // Verificar si ya tiene ticket abierto
            const existing = await this.getUserActiveTicket(interaction.user.id, interaction.guild.id);
            if (existing) {
                return await interaction.editReply({ content: `Ya tienes un ticket abierto: <#${existing.channelId}>` });
            }

            // Crear ticket
            const ticket = await this.createTicket(interaction, announcementKey, selectedOption, config);

            await interaction.editReply({ content: `✅ Tu ticket fue creado: <#${ticket.channelId}>` });

        } catch (error) {
            console.error('Error creando ticket:', error);
            try {
                await interaction.editReply({ content: '❌ Error al crear el ticket. Contacta a un admin.' });
            } catch (_) {}
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
                permissionOverwrites: [{
                    id: guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel]
                }]
            });
        }

        const ticketNumber = await this.getNextTicketNumber(guild.id);
        const channelName = `ticket-${ticketNumber}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        // Permisos: solo el usuario que abrió + roles admin pueden ver
        const permissionOverwrites = [
            {
                id: guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel]
            },
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

        // Añadir roles admin
        if (config.adminRoles && config.adminRoles.length > 0) {
            for (const roleName of config.adminRoles) {
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
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites
        });

        const ticketData = {
            id: `${guild.id}-${ticketNumber}`,
            channelId: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            ownerId: guild.ownerId, // Solo el dueño del server puede cerrar
            type: announcementKey,
            option: selectedOption.label,
            optionValue: selectedOption.value,
            status: 'open',
            createdAt: new Date().toISOString()
        };

        await this.saveTicket(ticketData);

        // Mensaje de bienvenida con botón cerrar (solo visible para el dueño del server/admin)
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`**Usuario:** <@${user.id}>\n**Opción:** ${selectedOption.label}\n**Descripción:** ${selectedOption.description}`)
            .setColor('#FFD700')
            .setTimestamp()
            .setFooter({ text: `Ticket ID: ${ticketData.id}` });

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketData.id}`)
                .setLabel('🔒 Cerrar Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
            content: `<@${user.id}> ¡Hola! Un administrador te atenderá pronto.`,
            embeds: [embed],
            components: [closeBtn]
        });

        // Log en canal de logs
        try {
            const logChannel = guild.channels.cache.find(c => c.name === (config.logChannel || 'logs'));
            if (logChannel) {
                await logChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🎫 Ticket Abierto')
                        .setDescription(`**Usuario:** <@${user.id}>\n**Canal:** <#${ticketChannel.id}>\n**Opción:** ${selectedOption.label}`)
                        .setColor('#27ae60')
                        .setTimestamp()]
                });
            }
        } catch (_) {}

        return ticketData;
    }

    // Cerrar ticket - SOLO el dueño del servidor o roles admin pueden hacerlo
    static async closeTicket(ticketId, closedBy) {
        const tickets = await this.getAllTickets();
        const ticket = tickets[ticketId];
        if (ticket) {
            ticket.status = 'closed';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = closedBy.id;
            await this.saveTicket(ticket);
        }
        return ticket;
    }

    // Verificar si puede cerrar - SOLO dueño del server o roles admin
    static async canClose(interaction) {
        // Dueño del servidor siempre puede
        if (interaction.user.id === interaction.guild.ownerId) return true;

        // Roles admin
        const config = await ConfigManager.getGuildConfig(interaction.guild.id);
        if (config.adminRoles) {
            return interaction.member.roles.cache.some(r => config.adminRoles.includes(r.name));
        }

        return false;
    }

    static async getNextTicketNumber(guildId) {
        const tickets = await this.getAllTickets();
        const guildTickets = Object.values(tickets).filter(t => t.guildId === guildId);
        return guildTickets.length + 1;
    }

    static async getUserActiveTicket(userId, guildId) {
        const tickets = await this.getAllTickets();
        return Object.values(tickets).find(t =>
            t.userId === userId && t.guildId === guildId && t.status === 'open'
        );
    }

    static async saveTicket(ticketData) {
        await this.initialize();
        const tickets = await fs.readJson(this.ticketsPath);
        tickets[ticketData.id] = ticketData;
        await fs.writeJson(this.ticketsPath, tickets, { spaces: 2 });
    }

    static async getAllTickets() {
        await this.initialize();
        return await fs.readJson(this.ticketsPath);
    }
}

module.exports = TicketHandler;