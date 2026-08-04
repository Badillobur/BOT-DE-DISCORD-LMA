const { EmbedBuilder } = require('discord.js');
const TicketHandler = require('./ticketHandler');

class ButtonHandler {
    static async handleButtonInteraction(interaction, client) {
        const id = interaction.customId;

        try {
            if (id.startsWith('close_ticket_')) {
                await this.handleCloseTicket(interaction, client);
            }
        } catch (error) {
            console.error('Error en botón:', error);
            try {
                await interaction.reply({ content: '❌ Error al procesar la acción.', ephemeral: true });
            } catch (_) {}
        }
    }

    static async handleCloseTicket(interaction, client) {
        const ticketId = interaction.customId.replace('close_ticket_', '');

        // Solo el dueño del servidor o roles admin pueden cerrar
        const canClose = await TicketHandler.canClose(interaction);
        if (!canClose) {
            return await interaction.reply({
                content: '❌ Solo los administradores pueden cerrar tickets.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const ticket = await TicketHandler.closeTicket(ticketId, interaction.user);

        if (!ticket) {
            return await interaction.editReply({ content: '❌ Ticket no encontrado.' });
        }

        // Mensaje de cierre en el canal
        await interaction.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔒 Ticket Cerrado')
                .setDescription(`Cerrado por <@${interaction.user.id}>\n\nEl canal se eliminará en **5 segundos**.`)
                .setColor('#e74c3c')
                .setTimestamp()]
        });

        await interaction.editReply({ content: '✅ Ticket cerrado.' });

        // Log en canal de logs
        try {
            const ConfigManager = require('./configManager');
            const config = await ConfigManager.getGuildConfig(interaction.guild.id);
            const logChannel = interaction.guild.channels.cache.find(c => c.name === (config.logChannel || 'logs'));
            if (logChannel) {
                await logChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔒 Ticket Cerrado')
                        .setDescription(`**Ticket:** ${ticketId}\n**Cerrado por:** <@${interaction.user.id}>\n**Usuario original:** <@${ticket.userId}>`)
                        .setColor('#e74c3c')
                        .setTimestamp()]
                });
            }
        } catch (_) {}

        // Eliminar canal tras 5 segundos
        setTimeout(async () => {
            try { await interaction.channel.delete(); } catch (_) {}
        }, 5000);
    }
}

module.exports = ButtonHandler;