const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const TicketHandler = require('../../utils/ticketHandler');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user-management')
        .setDescription('Gestionar usuarios del sistema de tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('blacklist')
                .setDescription('Añadir usuario a la lista negra')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario a bloquear')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('razon')
                        .setDescription('Razón del bloqueo')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unblacklist')
                .setDescription('Remover usuario de la lista negra')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario a desbloquear')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-blacklisted')
                .setDescription('Ver usuarios en lista negra'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('close-all-user')
                .setDescription('Cerrar todos los tickets de un usuario')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario cuyos tickets cerrar')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('razon')
                        .setDescription('Razón del cierre masivo')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user-info')
                .setDescription('Ver información detallada de un usuario')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario a consultar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('limit-user')
                .setDescription('Establecer límite de tickets por usuario')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario para establecer límite')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('limite')
                        .setDescription('Número máximo de tickets simultáneos (0 = sin límite)')
                        .setMinValue(0)
                        .setMaxValue(20)
                        .setRequired(true))),

    adminOnly: true,

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'blacklist':
                    await this.handleBlacklist(interaction);
                    break;
                
                case 'unblacklist':
                    await this.handleUnblacklist(interaction);
                    break;
                
                case 'list-blacklisted':
                    await this.handleListBlacklisted(interaction);
                    break;
                
                case 'close-all-user':
                    await this.handleCloseAllUser(interaction);
                    break;
                
                case 'user-info':
                    await this.handleUserInfo(interaction);
                    break;
                
                case 'limit-user':
                    await this.handleLimitUser(interaction);
                    break;
                
                default:
                    await interaction.editReply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'Subcomando no válido.',
                            'error'
                        )]
                    });
            }

        } catch (error) {
            console.error('❌ Error en user-management:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al ejecutar el comando.',
                    'error'
                )]
            });
        }
    },

    async handleBlacklist(interaction) {
        const user = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon') || 'No especificada';

        const blacklist = await this.getBlacklist();
        const guildId = interaction.guild.id;

        if (!blacklist[guildId]) {
            blacklist[guildId] = {};
        }

        if (blacklist[guildId][user.id]) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Usuario Ya Bloqueado',
                    `${user.username} ya está en la lista negra.`,
                    'warning'
                )]
            });
        }

        blacklist[guildId][user.id] = {
            username: user.username,
            reason: razon,
            blockedBy: interaction.user.id,
            blockedAt: new Date().toISOString()
        };

        await this.saveBlacklist(blacklist);

        // Cerrar tickets activos del usuario
        const tickets = await TicketHandler.getAllTickets();
        const userTickets = Object.values(tickets).filter(t => 
            t.userId === user.id && 
            t.guildId === guildId && 
            t.status === 'open'
        );

        for (const ticket of userTickets) {
            await TicketHandler.closeTicket(ticket.id, interaction.user);
            
            try {
                const channel = interaction.guild.channels.cache.get(ticket.channelId);
                if (channel) {
                    await channel.send({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Usuario Bloqueado',
                            `Este ticket ha sido cerrado porque ${user.username} fue añadido a la lista negra.\n\n**Razón:** ${razon}`,
                            'warning'
                        )]
                    });
                    
                    setTimeout(() => channel.delete().catch(console.error), 5000);
                }
            } catch (error) {
                console.error('Error cerrando canal:', error);
            }
        }

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Usuario Bloqueado',
                `${user.username} ha sido añadido a la lista negra.\n\n**Razón:** ${razon}\n**Tickets cerrados:** ${userTickets.length}`,
                'success'
            )]
        });
    },

    async handleUnblacklist(interaction) {
        const user = interaction.options.getUser('usuario');
        const blacklist = await this.getBlacklist();
        const guildId = interaction.guild.id;

        if (!blacklist[guildId] || !blacklist[guildId][user.id]) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Usuario No Bloqueado',
                    `${user.username} no está en la lista negra.`,
                    'info'
                )]
            });
        }

        delete blacklist[guildId][user.id];
        await this.saveBlacklist(blacklist);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Usuario Desbloqueado',
                `${user.username} ha sido removido de la lista negra.`,
                'success'
            )]
        });
    },

    async handleListBlacklisted(interaction) {
        const blacklist = await this.getBlacklist();
        const guildId = interaction.guild.id;
        
        const guildBlacklist = blacklist[guildId] || {};
        const blacklistedUsers = Object.entries(guildBlacklist);

        if (blacklistedUsers.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Lista Negra Vacía',
                    'No hay usuarios en la lista negra.',
                    'info'
                )]
            });
        }

        let description = '';
        blacklistedUsers.slice(0, 10).forEach(([userId, data]) => {
            description += `**<@${userId}>** (${data.username})\n`;
            description += `📝 Razón: ${data.reason}\n`;
            description += `👮 Por: <@${data.blockedBy}>\n`;
            description += `📅 Fecha: ${new Date(data.blockedAt).toLocaleDateString()}\n\n`;
        });

        if (blacklistedUsers.length > 10) {
            description += `\n*... y ${blacklistedUsers.length - 10} usuarios más*`;
        }

        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            'Lista Negra',
            description,
            'warning'
        );

        embed.setFooter({ text: `Total: ${blacklistedUsers.length} usuarios bloqueados` });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleCloseAllUser(interaction) {
        const user = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon') || 'Cierre masivo por administrador';

        const tickets = await TicketHandler.getAllTickets();
        const userTickets = Object.values(tickets).filter(t => 
            t.userId === user.id && 
            t.guildId === interaction.guild.id && 
            t.status === 'open'
        );

        if (userTickets.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Tickets',
                    `${user.username} no tiene tickets abiertos.`,
                    'info'
                )]
            });
        }

        let closedCount = 0;
        for (const ticket of userTickets) {
            try {
                await TicketHandler.closeTicket(ticket.id, interaction.user);
                
                const channel = interaction.guild.channels.cache.get(ticket.channelId);
                if (channel) {
                    await channel.send({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Ticket Cerrado por Administrador',
                            `**Razón:** ${razon}\n**Cerrado por:** ${interaction.user.username}`,
                            'warning'
                        )]
                    });
                    
                    setTimeout(() => channel.delete().catch(console.error), 5000);
                }
                closedCount++;
            } catch (error) {
                console.error(`Error cerrando ticket ${ticket.id}:`, error);
            }
        }

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Tickets Cerrados',
                `Se han cerrado ${closedCount} tickets de ${user.username}.\n\n**Razón:** ${razon}`,
                'success'
            )]
        });
    },

    async handleUserInfo(interaction) {
        const user = interaction.options.getUser('usuario');
        const tickets = await TicketHandler.getAllTickets();
        const blacklist = await this.getBlacklist();
        const limits = await this.getUserLimits();

        const guildId = interaction.guild.id;
        const userTickets = Object.values(tickets).filter(t => 
            t.userId === user.id && t.guildId === guildId
        );

        const openTickets = userTickets.filter(t => t.status === 'open').length;
        const closedTickets = userTickets.filter(t => t.status === 'closed').length;
        const totalTickets = userTickets.length;

        // Verificar estado de blacklist
        const isBlacklisted = blacklist[guildId] && blacklist[guildId][user.id];
        const userLimit = limits[guildId] && limits[guildId][user.id] ? limits[guildId][user.id].limit : 'Sin límite';

        // Primer y último ticket
        const sortedTickets = userTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const firstTicket = sortedTickets[0];
        const lastTicket = sortedTickets[sortedTickets.length - 1];

        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            `Información de ${user.username}`,
            `**Estado:** ${isBlacklisted ? '🚫 Bloqueado' : '✅ Activo'}\n**Límite de tickets:** ${userLimit}`,
            'info'
        );

        embed.addFields(
            { name: '📊 Tickets', value: `**Total:** ${totalTickets}\n**Abiertos:** ${openTickets}\n**Cerrados:** ${closedTickets}`, inline: true },
            { name: '📅 Actividad', value: firstTicket ? `**Primer ticket:** ${new Date(firstTicket.createdAt).toLocaleDateString()}\n**Último ticket:** ${new Date(lastTicket.createdAt).toLocaleDateString()}` : 'Sin actividad', inline: true }
        );

        if (isBlacklisted) {
            const blacklistData = blacklist[guildId][user.id];
            embed.addFields({
                name: '🚫 Información de Bloqueo',
                value: `**Razón:** ${blacklistData.reason}\n**Por:** <@${blacklistData.blockedBy}>\n**Fecha:** ${new Date(blacklistData.blockedAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.setThumbnail(user.displayAvatarURL());

        await interaction.editReply({ embeds: [embed] });
    },

    async handleLimitUser(interaction) {
        const user = interaction.options.getUser('usuario');
        const limite = interaction.options.getInteger('limite');

        const limits = await this.getUserLimits();
        const guildId = interaction.guild.id;

        if (!limits[guildId]) {
            limits[guildId] = {};
        }

        if (limite === 0) {
            delete limits[guildId][user.id];
            await this.saveUserLimits(limits);

            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Límite Removido',
                    `Se ha removido el límite de tickets para ${user.username}.`,
                    'success'
                )]
            });
        }

        limits[guildId][user.id] = {
            limit: limite,
            setBy: interaction.user.id,
            setAt: new Date().toISOString()
        };

        await this.saveUserLimits(limits);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Límite Establecido',
                `${user.username} ahora puede tener máximo ${limite} tickets simultáneos.`,
                'success'
            )]
        });
    },

    // Funciones auxiliares
    async getBlacklist() {
        const blacklistPath = path.join(__dirname, '../../data/blacklist.json');
        if (await fs.pathExists(blacklistPath)) {
            return await fs.readJson(blacklistPath);
        }
        return {};
    },

    async saveBlacklist(blacklist) {
        const blacklistPath = path.join(__dirname, '../../data/blacklist.json');
        await fs.writeJson(blacklistPath, blacklist, { spaces: 2 });
    },

    async getUserLimits() {
        const limitsPath = path.join(__dirname, '../../data/user-limits.json');
        if (await fs.pathExists(limitsPath)) {
            return await fs.readJson(limitsPath);
        }
        return {};
    },

    async saveUserLimits(limits) {
        const limitsPath = path.join(__dirname, '../../data/user-limits.json');
        await fs.writeJson(limitsPath, limits, { spaces: 2 });
    }
};