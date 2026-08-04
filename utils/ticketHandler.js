const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Announcement, GuildConfig, Ticket: TicketModel } = require('../db');

class TicketHandler {

    static async handleTicketSelection(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const announcementKey = interaction.customId.replace('ticket_select_', '');
            const selectedValue = interaction.values[0];

            // Buscar anuncio en MongoDB
            const announcement = await Announcement.findById(announcementKey);
            if (!announcement) {
                return await interaction.editReply({ content: '❌ Anuncio no encontrado.' });
            }

            const selectedOption = announcement.options.find(opt => opt.value === selectedValue);
            if (!selectedOption) {
                return await interaction.editReply({ content: '❌ Opción no válida.' });
            }

            // Verificar ticket abierto
            const existing = await TicketModel.findOne({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                status: 'open'
            });
            if (existing) {
                return await interaction.editReply({ content: `Ya tienes un ticket abierto: <#${existing.channelId}>` });
            }

            // Obtener config
            let config = await GuildConfig.findById(interaction.guild.id)
                || await GuildConfig.findById('global')
                || { ticketCategory: 'TICKETS', logChannel: 'logs', adminRoles: [] };

            const ticket = await this.createTicket(interaction, announcementKey, selectedOption, config);
            await interaction.editReply({ content: `✅ Tu ticket fue creado: <#${ticket.channelId}>` });

        } catch (error) {
            console.error('Error creando ticket:', error);
            try { await interaction.editReply({ content: '❌ Error al crear el ticket.' }); } catch (_) {}
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

        // Contar tickets del servidor para número
        const count = await TicketModel.countDocuments({ guildId: guild.id }) + 1;
        const channelName = `ticket-${count}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15)}`;

        // Permisos del canal
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

        // Añadir roles admin
        const adminRoles = config.adminRoles || [];
        for (const roleName of adminRoles) {
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

        // Guardar en MongoDB
        await TicketModel.create({
            _id: ticketId,
            channelId: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            ownerId: guild.ownerId,
            type: announcementKey,
            option: selectedOption.label,
            optionValue: selectedOption.value,
            status: 'open'
        });

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

        return { channelId: ticketChannel.id };
    }

    static async canClose(interaction) {
        if (interaction.user.id === interaction.guild.ownerId) return true;
        let config = await GuildConfig.findById(interaction.guild.id) || await GuildConfig.findById('global');
        if (config && config.adminRoles) {
            return interaction.member.roles.cache.some(r => config.adminRoles.includes(r.name));
        }
        return false;
    }

    static async closeTicket(ticketId, closedBy) {
        return await TicketModel.findByIdAndUpdate(
            ticketId,
            { status: 'closed', closedAt: new Date().toISOString(), closedBy: closedBy.id },
            { new: true }
        );
    }
}

module.exports = TicketHandler;