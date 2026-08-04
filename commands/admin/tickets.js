const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const TicketHandler = require('../../utils/ticketHandler');
const CustomEmbedBuilder = require('../../utils/embedBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Gestionar tickets del servidor')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Ver todos los tickets activos'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Cerrar un ticket específico')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID del ticket a cerrar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Ver estadísticas de tickets'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Ver tickets de un usuario específico')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario a buscar')
                        .setRequired(true))),

    adminOnly: true,

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();
            const tickets = await TicketHandler.getAllTickets();
            const guildTickets = Object.values(tickets).filter(t => t.guildId === interaction.guild.id);

            switch (subcommand) {
                case 'list':
                    await this.handleListTickets(interaction, guildTickets);
                    break;
                
                case 'close':
                    await this.handleCloseTicket(interaction, tickets);
                    break;
                
                case 'stats':
                    await this.handleTicketStats(interaction, guildTickets);
                    break;
                
                case 'user':
                    await this.handleUserTickets(interaction, guildTickets);
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
            console.error('❌ Error en comando tickets:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al ejecutar el comando.',
                    'error'
                )]
            });
        }
    },

    async handleListTickets(interaction, guildTickets) {
        const activeTickets = guildTickets.filter(t => t.status === 'open');
        
        if (activeTickets.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Tickets',
                    'No hay tickets activos en este servidor.',
                    'info'
                )]
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Tickets Activos')
            .setColor('#0099FF')
            .setTimestamp();

        let description = '';
        activeTickets.slice(0, 10).forEach(ticket => {
            description += `**${ticket.id}** - <@${ticket.userId}>\n`;
            description += `📋 Tipo: ${ticket.type} | 🏷️ Opción: ${ticket.option}\n`;
            description += `📅 Creado: <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>\n\n`;
        });

        if (activeTickets.length > 10) {
            description += `\n*... y ${activeTickets.length - 10} tickets más*`;
        }

        embed.setDescription(description);
        embed.setFooter({ text: `Total: ${activeTickets.length} tickets activos` });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleCloseTicket(interaction, tickets) {
        const ticketId = interaction.options.getString('id');
        const ticket = tickets[ticketId];

        if (!ticket) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'No se encontró un ticket con ese ID.',
                    'error'
                )]
            });
        }

        if (ticket.status !== 'open') {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Este ticket ya está cerrado.',
                    'warning'
                )]
            });
        }

        // Cerrar ticket
        await TicketHandler.closeTicket(ticketId, interaction.user);

        // Intentar eliminar el canal
        try {
            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                await channel.delete();
            }
        } catch (error) {
            console.error('Error eliminando canal:', error);
        }

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Ticket Cerrado',
                `El ticket ${ticketId} ha sido cerrado exitosamente.`,
                'success'
            )]
        });
    },

    async handleTicketStats(interaction, guildTickets) {
        const totalTickets = guildTickets.length;
        const activeTickets = guildTickets.filter(t => t.status === 'open').length;
        const closedTickets = guildTickets.filter(t => t.status === 'closed').length;

        // Estadísticas por tipo
        const typeStats = {};
        guildTickets.forEach(ticket => {
            if (!typeStats[ticket.type]) {
                typeStats[ticket.type] = 0;
            }
            typeStats[ticket.type]++;
        });

        const embed = new EmbedBuilder()
            .setTitle('📊 Estadísticas de Tickets')
            .setColor('#FFD700')
            .setTimestamp()
            .addFields(
                { name: '📈 Total', value: totalTickets.toString(), inline: true },
                { name: '🟢 Activos', value: activeTickets.toString(), inline: true },
                { name: '🔒 Cerrados', value: closedTickets.toString(), inline: true }
            );

        if (Object.keys(typeStats).length > 0) {
            let typeStatsText = '';
            Object.entries(typeStats).forEach(([type, count]) => {
                typeStatsText += `**${type}:** ${count}\n`;
            });
            embed.addFields({ name: '📋 Por Tipo', value: typeStatsText, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleUserTickets(interaction, guildTickets) {
        const user = interaction.options.getUser('usuario');
        const userTickets = guildTickets.filter(t => t.userId === user.id);

        if (userTickets.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Tickets',
                    `${user.username} no tiene tickets en este servidor.`,
                    'info'
                )]
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Tickets de ${user.username}`)
            .setThumbnail(user.displayAvatarURL())
            .setColor('#9932CC')
            .setTimestamp();

        let description = '';
        userTickets.slice(0, 5).forEach(ticket => {
            const status = ticket.status === 'open' ? '🟢 Abierto' : '🔒 Cerrado';
            description += `**${ticket.id}** - ${status}\n`;
            description += `📋 Tipo: ${ticket.type} | 🏷️ ${ticket.option}\n`;
            description += `📅 <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>\n\n`;
        });

        if (userTickets.length > 5) {
            description += `\n*... y ${userTickets.length - 5} tickets más*`;
        }

        embed.setDescription(description);
        embed.setFooter({ text: `Total: ${userTickets.length} tickets` });

        await interaction.editReply({ embeds: [embed] });
    }
};