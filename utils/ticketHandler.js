const { ChannelType, PermissionFlagsBits } = require('discord.js');
const CustomEmbedBuilder = require('./embedBuilder');
const ConfigManager = require('./configManager');
const fs = require('fs-extra');
const path = require('path');

class TicketHandler {
    static ticketsPath = path.join(__dirname, '..', 'data', 'tickets.json');

    /**
     * Inicializar sistema de tickets
     */
    static async initialize() {
        const dataDir = path.join(__dirname, '..', 'data');
        if (!await fs.pathExists(dataDir)) {
            await fs.ensureDir(dataDir);
        }

        if (!await fs.pathExists(this.ticketsPath)) {
            await fs.writeJson(this.ticketsPath, {});
        }
    }

    /**
     * Manejar selección de ticket
     */
    static async handleTicketSelection(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const [action, announcementKey] = interaction.customId.split('_');
            const selectedValue = interaction.values[0];

            // Obtener configuración del servidor
            const config = await ConfigManager.getGuildConfig(interaction.guild.id);

            // Verificar blacklist
            const isBlacklisted = await this.isUserBlacklisted(interaction.user.id, interaction.guild.id);
            if (isBlacklisted) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Acceso Denegado',
                        'No puedes crear tickets porque estás en la lista negra.',
                        'error'
                    )]
                });
            }

            // Verificar límites de usuario
            const canCreateTicket = await this.canUserCreateTicket(interaction.user.id, interaction.guild.id);
            if (!canCreateTicket.allowed) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Límite Alcanzado',
                        canCreateTicket.message,
                        'warning'
                    )]
                });
            }

            // Buscar la opción seleccionada
            const announcement = config.announcements[announcementKey];
            const selectedOption = announcement.options.find(opt => opt.value === selectedValue);

            if (!selectedOption) {
                return await interaction.editReply('❌ Opción no válida.');
            }

            // Verificar si ya tiene un ticket abierto
            const existingTicket = await this.getUserActiveTicket(interaction.user.id, interaction.guild.id);
            if (existingTicket) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Ticket Existente',
                        `Ya tienes un ticket abierto: <#${existingTicket.channelId}>`,
                        'warning'
                    )]
                });
            }

            // Crear ticket
            const ticket = await this.createTicket(interaction, announcementKey, selectedOption, config);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Ticket Creado',
                    `Tu ticket ha sido creado exitosamente: <#${ticket.channelId}>`,
                    'success'
                )]
            });

        } catch (error) {
            console.error('❌ Error creando ticket:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al crear tu ticket. Contacta a un administrador.',
                    'error'
                )]
            });
        }
    }

    /**
     * Crear un nuevo ticket
     */
    static async createTicket(interaction, announcementKey, selectedOption, config) {
        const guild = interaction.guild;
        const user = interaction.user;

        // Buscar o crear categoría de tickets
        let category = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            c.name.toLowerCase().includes(config.ticketCategory.toLowerCase())
        );

        if (!category) {
            category = await guild.channels.create({
                name: config.ticketCategory,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            });
        }

        // Crear canal de ticket
        const ticketNumber = await this.getNextTicketNumber(guild.id);
        const channelName = `ticket-${ticketNumber}-${user.username.toLowerCase()}`;

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                ...config.adminRoles.map(roleName => {
                    const role = guild.roles.cache.find(r => r.name === roleName);
                    if (role) {
                        return {
                            id: role.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageMessages
                            ]
                        };
                    }
                }).filter(Boolean)
            ]
        });

        // Crear datos del ticket
        const ticketData = {
            id: `${guild.id}-${ticketNumber}`,
            channelId: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            type: announcementKey,
            option: selectedOption.label,
            optionValue: selectedOption.value,
            status: 'open',
            createdAt: new Date().toISOString(),
            messages: []
        };

        // Guardar ticket
        await this.saveTicket(ticketData);

        // Enviar mensaje inicial en el ticket
        const welcomeEmbed = CustomEmbedBuilder.createTicketInfoEmbed(ticketData);
        
        const closeButton = CustomEmbedBuilder.createActionButtons([
            {
                customId: `close_ticket_${ticketData.id}`,
                label: 'Cerrar Ticket',
                style: 4, // Danger
                emoji: '🔒'
            }
        ]);

        await ticketChannel.send({
            content: `Hola <@${user.id}>, bienvenido a tu ticket!\n\n**Opción seleccionada:** ${selectedOption.label}\n**Descripción:** ${selectedOption.description}`,
            embeds: [welcomeEmbed],
            components: [closeButton]
        });

        // Log del ticket
        await this.logTicketAction(guild, 'create', ticketData, user, config);

        return ticketData;
    }

    /**
     * Obtener siguiente número de ticket
     */
    static async getNextTicketNumber(guildId) {
        const tickets = await this.getAllTickets();
        const guildTickets = Object.values(tickets).filter(t => t.guildId === guildId);
        return guildTickets.length + 1;
    }

    /**
     * Obtener ticket activo del usuario
     */
    static async getUserActiveTicket(userId, guildId) {
        const tickets = await this.getAllTickets();
        return Object.values(tickets).find(t => 
            t.userId === userId && 
            t.guildId === guildId && 
            t.status === 'open'
        );
    }

    /**
     * Guardar ticket
     */
    static async saveTicket(ticketData) {
        await this.initialize();
        const tickets = await fs.readJson(this.ticketsPath);
        tickets[ticketData.id] = ticketData;
        await fs.writeJson(this.ticketsPath, tickets, { spaces: 2 });
    }

    /**
     * Obtener todos los tickets
     */
    static async getAllTickets() {
        await this.initialize();
        return await fs.readJson(this.ticketsPath);
    }

    /**
     * Cerrar ticket
     */
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

    /**
     * Log de acciones de tickets
     */
    static async logTicketAction(guild, action, ticketData, user, config = null) {
        if (!config) {
            config = await ConfigManager.getGuildConfig(guild.id);
        }
        
        const logChannel = guild.channels.cache.find(c => c.name === config.logChannel);
        if (!logChannel) return;

        const logEmbed = CustomEmbedBuilder.createConfirmationEmbed(
            `Ticket ${action}`,
            `**Usuario:** <@${user.id}>\n**Ticket:** ${ticketData.id}\n**Tipo:** ${ticketData.type}\n**Canal:** <#${ticketData.channelId}>`,
            'info'
        );

        await logChannel.send({ embeds: [logEmbed] });
    }

    /**
     * Verificar si un usuario está en la blacklist
     */
    static async isUserBlacklisted(userId, guildId) {
        try {
            const blacklistPath = path.join(__dirname, '..', 'data', 'blacklist.json');
            if (!await fs.pathExists(blacklistPath)) return false;
            
            const blacklist = await fs.readJson(blacklistPath);
            return blacklist[guildId] && blacklist[guildId][userId];
        } catch (error) {
            console.error('Error verificando blacklist:', error);
            return false;
        }
    }

    /**
     * Verificar si un usuario puede crear un ticket
     */
    static async canUserCreateTicket(userId, guildId) {
        try {
            // Obtener límites de usuario
            const limitsPath = path.join(__dirname, '..', 'data', 'user-limits.json');
            let userLimit = null;
            
            if (await fs.pathExists(limitsPath)) {
                const limits = await fs.readJson(limitsPath);
                if (limits[guildId] && limits[guildId][userId]) {
                    userLimit = limits[guildId][userId].limit;
                }
            }

            // Si no hay límite específico, permitir
            if (userLimit === null) {
                return { allowed: true };
            }

            // Contar tickets activos del usuario
            const tickets = await this.getAllTickets();
            const activeTickets = Object.values(tickets).filter(t => 
                t.userId === userId && 
                t.guildId === guildId && 
                t.status === 'open'
            ).length;

            if (activeTickets >= userLimit) {
                return {
                    allowed: false,
                    message: `Has alcanzado tu límite de ${userLimit} tickets simultáneos. Cierra algunos tickets antes de crear uno nuevo.`
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('Error verificando límite de usuario:', error);
            return { allowed: true }; // En caso de error, permitir
        }
    }
}

module.exports = TicketHandler;